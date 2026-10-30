import { bytesFreed, deleteFileInRoots, inspectFileInRoots } from './library-delete.js'

export const VERSION_CHOICES = ['both', 'recording', 'other']

export const versionChoicesFrom = (body = {}) => {
  const raw = body?.versions
  if (raw == null) return { choices: {} }
  if (typeof raw !== 'object' || Array.isArray(raw)) return { error: 'versions must map recording ids to both, recording, or other' }
  const choices = {}
  for (const [id, choice] of Object.entries(raw)) {
    if (!VERSION_CHOICES.includes(choice)) return { error: `versions.${id} must be one of ${VERSION_CHOICES.join(', ')}` }
    choices[id] = choice
  }
  return { choices }
}

export const foreignTargetsOf = ({ rows, choices = {} }) => rows.flatMap((row) => {
  const choice = choices[row.recording_id] ?? 'both'
  const versions = row.source === 'plex' ? row.versions || [] : choice === 'recording' ? [] : row.other_versions || []
  return versions.map((version) => ({ recordingId: row.recording_id, ...version }))
})

export const keepsRecording = ({ row, choices = {} }) => row.source !== 'plex' && (choices[row.recording_id] ?? 'both') !== 'other'

export const groupByFile = (targets) => {
  const groups = new Map()
  for (const target of targets) {
    const group = groups.get(target.filePath) || { ...target, recordingIds: [] }
    if (!group.recordingIds.includes(target.recordingId)) group.recordingIds.push(target.recordingId)
    groups.set(target.filePath, group)
  }
  return [...groups.values()]
}

export const routeOf = ({ target, connected }) => {
  if (target.manager === 'sonarr' || target.manager === 'radarr') return connected[target.manager] ? target.manager : 'not-connected'
  return 'disk'
}

export const previewForeign = async ({ targets, roots, connected, coversOf = async () => [], fs }) => {
  const files = []
  for (const group of groupByFile(targets)) {
    const route = routeOf({ target: group, connected })
    const inspected = await inspectFileInRoots({ filePath: group.filePath, roots, fs })
    const covers = await coversOf(group.filePath)
    files.push({
      recordingIds: group.recordingIds,
      filePath: group.filePath,
      route,
      manager: group.manager ?? null,
      bytes: inspected.status === 'present' && inspected.entry.nlink <= 1 ? inspected.entry.size : 0,
      sizeBytes: inspected.entry?.size ?? group.sizeBytes ?? null,
      hardlinked: Boolean(inspected.entry && inspected.entry.nlink > 1),
      missing: inspected.status === 'missing',
      outside: route === 'disk' && inspected.status === 'outside',
      covers,
    })
  }
  return files
}

export const runForeign = async ({ targets, roots, connected, clientFor, unmonitor, removeParts, fs }) => {
  const outcomes = []
  for (const group of groupByFile(targets)) {
    const route = routeOf({ target: group, connected })
    const outcome = route === 'disk'
      ? await deleteFromDisk({ group, roots, fs })
      : route === 'not-connected'
        ? failed(`${appName(group.manager)} is not connected, so Freetvarr left the file alone. Connect it in Settings → Recording → Sonarr and Radarr`)
        : await deleteThroughManager({ group, client: await clientFor(route), unmonitor })
    if (outcome.ok) await removeParts(group.filePath)
    outcomes.push({ ...outcome, route, filePath: group.filePath, recordingIds: group.recordingIds, sectionId: group.sectionId ?? null })
  }
  return outcomes
}

export const removeSeriesFromSonarr = async ({ seriesIds, client }) => {
  const results = []
  for (const id of seriesIds) {
    try {
      await client.deleteSeries(id)
      results.push({ seriesId: id, ok: true })
    } catch (err) {
      results.push({ seriesId: id, ok: false, error: err.message })
    }
  }
  return results
}

export const combineResults = ({ recordingResults = [], foreign = [], requestedIds }) => {
  const byId = new Map(recordingResults.map((result) => [result.recordingId, { ...result }]))
  for (const outcome of foreign) {
    for (const id of outcome.recordingIds) {
      const current = byId.get(id) || { recordingId: id, ok: true, library: 'none', tvh: 'already_removed', bytesFreed: 0, error: null }
      const merged = {
        ...current,
        ok: current.ok && outcome.ok,
        bytesFreed: (current.bytesFreed || 0) + (outcome.ok ? outcome.bytes || 0 : 0),
        error: current.error || (outcome.ok ? null : outcome.error),
        copies: [...(current.copies || []), { route: outcome.route, ok: outcome.ok, status: outcome.status, error: outcome.error ?? null, recycled: outcome.recycled ?? false }],
      }
      byId.set(id, merged)
    }
  }
  return requestedIds.filter((id) => byId.has(id)).map((id) => byId.get(id))
}

const deleteFromDisk = async ({ group, roots, fs }) => {
  const outcome = await deleteFileInRoots({ filePath: group.filePath, roots, fs })
  if (outcome.status === 'failed') return failed(outcome.error)
  return { ok: true, status: outcome.status, bytes: bytesFreed(outcome.entries), steps: [{ step: 'disk', ok: true }] }
}

const deleteThroughManager = async ({ group, client, unmonitor }) => {
  if (!client) return failed(`${appName(group.manager)} is not connected, so Freetvarr left the file alone`)
  const name = appName(group.manager)
  const steps = []
  let unmonitored = []
  if (unmonitor) {
    try {
      unmonitored = await unmonitorIdsOf({ group, client })
      if (unmonitored.length) await unmonitorItems({ group, client, ids: unmonitored })
      steps.push({ step: 'unmonitor', ok: true })
    } catch (err) {
      return failed(`${name} did not stop monitoring it, so nothing was deleted: ${err.message}`, steps)
    }
  }
  try {
    if (group.manager === 'sonarr') await client.deleteEpisodeFile(group.managerFileId)
    else await client.deleteMovieFile(group.managerFileId)
    steps.push({ step: 'delete', ok: true })
    return { ok: true, status: 'deleted', bytes: group.sizeBytes || 0, steps, recycled: true }
  } catch (err) {
    if (err.kind === 'missing') return { ok: true, status: 'missing', bytes: 0, steps: [...steps, { step: 'delete', ok: true }] }
    if (unmonitored.length) await monitorItems({ group, client, ids: unmonitored }).catch(() => {})
    return failed(`${name} did not delete it, so nothing was deleted: ${err.message}`, steps)
  }
}

const unmonitorIdsOf = async ({ group, client }) => {
  if (group.manager === 'radarr') return group.managerItemId ? [group.managerItemId] : []
  const episodes = await client.episodesOfFile(group.managerFileId)
  return (Array.isArray(episodes) ? episodes : []).filter((episode) => episode.monitored !== false).map((episode) => episode.id)
}

const unmonitorItems = ({ group, client, ids }) => (group.manager === 'sonarr' ? client.unmonitorEpisodes(ids) : client.unmonitorMovies(ids))

const monitorItems = ({ group, client, ids }) => (group.manager === 'sonarr' ? client.monitorEpisodes(ids) : client.monitorMovies(ids))

const failed = (error, steps = []) => ({ ok: false, status: 'failed', bytes: 0, error, steps })

const appName = (manager) => ({ sonarr: 'Sonarr', radarr: 'Radarr' }[manager] || 'The app')
