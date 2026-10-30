import path from 'path'
import fs from 'fs/promises'

import { db, getSetting } from './db.js'
import {
  getActiveSyncId,
  getMediaRoot,
  getMoviesRoot,
  getOneOffRoot,
  getRecordingsRoot,
  getTvhRecordingsPath,
  localPathFor,
} from './sync.js'
import { listActiveRecordings, removeRecordings, resolveConnection, TvheadendError } from './tvheadend.js'
import { notifyPlexSectionRefresh } from './plex.js'
import { groupKeyOf, withPlexRows } from './library.js'
import { isPlexItemId } from './plex-library.js'
import { loadLibraryItemRows, removePartsByFile, loadPartsByFile } from './plex-library-store.js'
import { arrClientFor, loadArrSettings } from './arr-store.js'
import { recycleBinOf } from './arr-client.js'
import { createArrLookup } from './arr-files.js'
import { recheckManagers } from './delete-manager-check.js'
import {
  combineResults,
  foreignTargetsOf,
  keepsRecording,
  previewForeign,
  removeSeriesFromSonarr,
  runForeign,
  versionChoicesFrom,
} from './foreign-delete.js'
import {
  blockedReasonOf,
  deletionRequestFrom,
  expectedCountFrom,
  previewDeletion,
  rootFor,
  runDeletion,
  summarise,
} from './library-delete.js'

export const mountLibraryDeleteRoutes = ({ app, csrf, limiter }) => {
  app.post('/api/library/delete/preview', limiter, csrf, async (req, res) => {
    const { request, error } = deletionRequestFrom(req.body)
    if (error) return res.status(400).json({ error })
    const { choices, error: choiceError } = versionChoicesFrom(req.body)
    if (choiceError) return res.status(400).json({ error: choiceError })
    const context = await deletionContext()
    const plan = await planDeletion({ request, choices, context })
    res.setHeader('Cache-Control', 'no-store')
    res.json(await previewPlan({ plan, context }))
  })

  app.post('/api/library/delete', limiter, csrf, async (req, res) => {
    const { request, error } = deletionRequestFrom(req.body)
    if (error) return res.status(400).json({ error })
    const expectedCount = expectedCountFrom(req.body)
    if (expectedCount == null) return res.status(400).json({ error: 'expected_count must be a whole number' })
    const { choices, error: choiceError } = versionChoicesFrom(req.body)
    if (choiceError) return res.status(400).json({ error: choiceError })
    const context = await deletionContext()
    const plan = await planDeletion({ request, choices, context })
    const blocked = plan.blocked || blockedReasonOf({ rows: plan.recordingRows, syncing: getActiveSyncId() != null })
    if (blocked) return res.status(409).json({ error: blocked })
    if (plan.count !== expectedCount) {
      return res.status(409).json({
        error: 'The episodes changed since you checked. Review the list and try again.',
        count: plan.count,
      })
    }
    const outcome = await runPlan({ plan, context, removeSeries: req.body?.remove_series === true })
    res.status(summarise(outcome.results).httpStatus).json(outcome)
  })
}

const planDeletion = async ({ request, choices, context }) => {
  const plexIds = (request.recordingIds || []).filter(isPlexItemId)
  const recordingIds = request.recordingIds?.filter((id) => !isPlexItemId(id))
  const [loadedRows, itemRows] = await Promise.all([
    request.recordingIds ? (recordingIds.length ? loadDeletionRows({ recordingIds }) : []) : loadDeletionRows(request),
    loadLibraryItemRows().catch(() => []),
  ])
  const merged = withPlexRows({ rows: loadedRows, itemRows })
  const wantedPlex = new Set(plexIds)
  const plexRows = request.recordingIds
    ? merged.filter((row) => wantedPlex.has(row.recording_id))
    : merged.filter((row) => row.source === 'plex' && groupKeyOf(row) === request.showKey && (request.scope !== 'watched' || row.watched_at))
  const mergedRecordings = merged.filter((row) => row.source !== 'plex')
  const rows = [...mergedRecordings, ...plexRows]
  const keptRows = mergedRecordings.filter((row) => keepsRecording({ row, choices }))
  const checked = await recheckManagers({
    targets: foreignTargetsOf({ rows, choices }),
    recordingRows: keptRows,
    lookup: createArrLookup({ clientFor: arrClientFor }),
    kindOfTarget: kindOfTargetIn({ rows, roots: context.roots }),
    kindOfRow: (row) => recordingKindOf({ row, roots: context.roots }),
    activeIds: context.tvh.activeIds,
  })
  return {
    rows,
    recordingRows: keptRows,
    targets: await withRecordingSizes(checked.targets),
    managedRecordingIds: checked.managedRecordingIds,
    blocked: checked.blocked,
    count: rows.length,
    requestedIds: rows.map((row) => row.recording_id),
  }
}

const kindOfTargetIn = ({ rows, roots }) => {
  const byId = new Map(rows.map((row) => [row.recording_id, row]))
  return (target) => {
    const row = byId.get(target.recordingId)
    return row?.source === 'plex' ? row.plex_kind : recordingKindOf({ row, roots })
  }
}

const recordingKindOf = ({ row, roots }) => (row?.file_path && path.isAbsolute(row.file_path) ? rootFor(row.file_path, roots)?.kind ?? null : null)

const withRecordingSizes = (targets) => Promise.all(targets.map(async (target) => {
  if (!target.recording) return target
  const stat = await fs.stat(target.filePath).catch(() => null)
  return { ...target, sizeBytes: stat?.size ?? null }
}))

const managedFreeRows = (plan) => plan.recordingRows
  .map((row) => (plan.managedRecordingIds.has(row.recording_id) ? { ...row, file_path: null } : row))

const previewPlan = async ({ plan, context }) => {
  const arrSettings = await loadArrSettings()
  const connected = await connectedApps(arrSettings)
  const recordings = await previewDeletion({ rows: managedFreeRows(plan), ...context })
  const recordingPaths = new Set(plan.targets.filter((target) => target.recording).map((target) => target.filePath))
  const files = (await previewForeign({ targets: plan.targets, roots: context.roots, connected, coversOf: coveredEpisodesOf }))
    .map((file) => (recordingPaths.has(file.filePath) ? { ...file, recording: true } : file))
  const recordingItems = new Map(recordings.items.map((item) => [item.recordingId, item]))
  const items = plan.rows.map((row) => ({
    ...(recordingItems.get(row.recording_id) || itemOf(row)),
    recordingId: row.recording_id,
    recording: recordingItems.has(row.recording_id),
    source: row.source === 'plex' ? 'plex' : 'freetvarr',
    copies: files.filter((file) => file.recordingIds.includes(row.recording_id)),
    canChoose: row.source !== 'plex' && Boolean(row.other_versions?.length),
    otherManager: row.other_versions?.[0]?.manager ?? null,
  }))
  const foreignBytes = files.reduce((sum, file) => sum + file.bytes, 0)
  return {
    count: plan.count,
    bytes: recordings.bytes + foreignBytes,
    missingCount: recordings.missingCount,
    items,
    recycleBin: await recycleBinsOf(connected),
    unmonitor: arrSettings.unmonitorOnDelete,
    sonarrSeries: sonarrSeriesOf(plan.targets),
    ...(plan.blocked ? { blocked: plan.blocked } : {}),
  }
}

const runPlan = async ({ plan, context, removeSeries }) => {
  const arrSettings = await loadArrSettings()
  const connected = await connectedApps(arrSettings)
  const foreign = await runForeign({
    targets: plan.targets,
    roots: context.roots,
    connected,
    clientFor: (app) => arrClientFor(app, { settings: arrSettings }),
    unmonitor: arrSettings.unmonitorOnDelete,
    removeParts: removePartsByFile,
  })
  const rows = rowsStillToDelete({ plan, foreign })
  const recordings = rows.length
    ? await runDeletion({ rows, ...context, save: saveDeletion })
    : { results: [], bytesFreed: 0, plex: {} }
  const plex = { ...recordings.plex, ...await refreshForeignSections(foreign) }
  const series = removeSeries && connected.sonarr
    ? await removeSeriesFromSonarr({ seriesIds: sonarrSeriesOf(plan.targets).map((entry) => entry.id), client: await arrClientFor('sonarr', { settings: arrSettings }) })
    : []
  const results = combineResults({ recordingResults: recordings.results, foreign, requestedIds: plan.requestedIds })
  const foreignBytes = foreign.filter((outcome) => outcome.ok).reduce((sum, outcome) => sum + (outcome.bytes || 0), 0)
  return { results, bytesFreed: recordings.bytesFreed + foreignBytes, plex, series }
}

const rowsStillToDelete = ({ plan, foreign }) => {
  const failedIds = new Set(foreign
    .filter((outcome) => !outcome.ok)
    .flatMap((outcome) => outcome.recordingIds)
    .filter((id) => plan.managedRecordingIds.has(id)))
  return plan.recordingRows.filter((row) => !failedIds.has(row.recording_id))
}

const connectedApps = async (settings) => ({
  sonarr: Boolean(settings.sonarr?.url && settings.sonarr?.apiKey),
  radarr: Boolean(settings.radarr?.url && settings.radarr?.apiKey),
})

const recycleBinsOf = async (connected) => {
  const entries = await Promise.all(Object.entries(connected).map(async ([app, on]) => {
    if (!on) return [app, null]
    const client = await arrClientFor(app).catch(() => null)
    const management = client ? await client.mediaManagement().catch(() => null) : null
    return [app, management ? recycleBinOf(management) : null]
  }))
  return Object.fromEntries(entries)
}

const sonarrSeriesOf = (targets) => [...new Map(targets
  .filter((target) => target.manager === 'sonarr' && target.managerSeriesId)
  .map((target) => [target.managerSeriesId, { id: target.managerSeriesId }])).values()]

const coveredEpisodesOf = async (filePath) => (await loadPartsByFile(filePath))
  .filter((part) => part.kind === 'episode' && part.episode != null)
  .map((part) => ({ season: part.season, episode: part.episode }))

const refreshForeignSections = async (foreign) => {
  const sections = [...new Set(foreign.filter((outcome) => outcome.ok && outcome.sectionId).map((outcome) => outcome.sectionId))]
  const refreshed = {}
  for (const sectionId of sections) {
    refreshed[`section-${sectionId}`] = await notifyPlexSectionRefresh({ sectionId }).catch((err) => ({ error: err.message }))
  }
  return refreshed
}

const itemOf = (row) => ({
  title: row.title,
  episodeTitle: row.episode_title ?? null,
  season: row.season ?? null,
  episode: row.episode ?? null,
  bytes: 0,
  missing: false,
})

const loadDeletionRows = async ({ recordingIds, showKey, scope }) => {
  if (recordingIds) return db('recordings').whereIn('recording_id', recordingIds).whereNull('purged_at')
  const rows = await db('recordings')
    .whereNull('purged_at')
    .where((q) => q.whereIn('status', ['done', 'partial']).orWhereNull('deleted_from_tvh_at'))
    .modify((q) => { if (scope === 'watched') q.whereNotNull('watched_at') })
    .orderBy([{ column: 'season' }, { column: 'episode' }, { column: 'aired_at' }])
  return rows.filter((row) => groupKeyOf(row) === showKey)
}

const deletionContext = async () => {
  const [mediaRoot, oneOffRoot, moviesRoot, recordingsRoot, tvhRecordingsPath, activeIds] = await Promise.all([
    getMediaRoot(),
    getOneOffRoot(),
    getMoviesRoot(),
    getRecordingsRoot(),
    getTvhRecordingsPath(),
    loadActiveIds(),
  ])
  return {
    roots: { tv: mediaRoot, oneOff: oneOffRoot, film: moviesRoot },
    tvh: {
      activeIds,
      remove: removeFromTvheadend,
      sourcePathFor: (row) => (row.tvh_filename
        ? localPathFor({ tvhFilename: row.tvh_filename, tvhRecordingsPath, recordingsRoot })
        : null),
    },
    plex: { refresh: refreshPlexSection },
    ownedElsewhere: isFileOwnedByAnotherRecording,
  }
}

const isFileOwnedByAnotherRecording = async (row) => Boolean(await db('recordings')
  .where({ file_path: row.file_path })
  .whereNot({ recording_id: row.recording_id })
  .whereNull('purged_at')
  .whereNull('library_deleted_at')
  .first())

const loadActiveIds = async () => {
  try {
    const active = await listActiveRecordings(await resolveConnection())
    return new Set(active.map((recording) => recording.uuid))
  } catch {
    return new Set()
  }
}

const removeFromTvheadend = async (recordingId) => {
  try {
    await removeRecordings({ recordingIds: [recordingId] })
    return 'removed'
  } catch (err) {
    if (err instanceof TvheadendError && err.code === 'not-found') return 'missing'
    throw err
  }
}

export const refreshPlexSection = async (kind) => {
  if (kind === 'tv') return notifyPlexSectionRefresh()
  const sectionId = await getSetting(PLEX_SECTION_SETTINGS[kind])
  if (!sectionId) return { skipped: true, reason: 'no Plex library chosen for these recordings' }
  return notifyPlexSectionRefresh({ sectionId })
}

const saveDeletion = ({ row, patch }) => db('recordings').where({ recording_id: row.recording_id }).update(patch)

const PLEX_SECTION_SETTINGS = { oneOff: 'plex_oneoff_section_id', film: 'plex_movies_section_id' }
