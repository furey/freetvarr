import { appsForKind } from './arr-files.js'
import { createPathIndex, findInPathIndex, libraryItemRowsOf } from './plex-library.js'

export const QUICK_OVERLAP_S = 120

export const createLibraryScan = ({
  loadSettings,
  loadRecordingFiles,
  loadRoots,
  saveScannedItems,
  loadPendingPushes,
  clearPendingPush,
  loadManagerIndex = async () => null,
  createManagerLookup = () => null,
  saveManagerFields = async () => {},
  now = Date.now,
}) => {
  const afterSync = async ({ client, full, status = {}, job }) => {
    const pushed = await pushPending({ client, job })
    const settings = await loadSettings()
    if (!settings.enabled || !settings.sectionIds.length) return { pushed, scanned: 0 }
    job.step(full ? 'Read your whole Plex library' : 'Read new Plex items')
    const sections = (await client.sections()).filter((section) => settings.sectionIds.includes(section.id) && SCANNED_TYPES.has(section.type))
    const [recordingFiles, roots] = await Promise.all([loadRecordingFiles(), loadRoots()])
    const seenAt = now()
    const sinceS = Math.floor((status.lastRunAt ?? seenAt) / 1000) - QUICK_OVERLAP_S
    let scanned = 0
    const savedRows = []
    for (const section of sections) {
      const items = full
        ? await client.listItems({ section })
        : uniqueItems([
          ...await client.listItems({ section, addedSinceS: sinceS }),
          ...await client.listItems({ section, viewedSinceS: sinceS }),
        ])
      const rows = libraryItemRowsOf({ items, section, recordingFiles, roots, seenAt })
      await saveScannedItems({ rows, full, sectionId: section.id, seenAt })
      scanned += rows.length
      savedRows.push(...rows)
    }
    job.fact(full ? 'Plex library items' : 'New or changed Plex items', scanned)
    if (full) await linkManagers({ rows: savedRows, job })
    else await linkNewManagers({ rows: savedRows, job })
    return { pushed, scanned }
  }

  const pushPending = async ({ client, job }) => {
    const pending = await loadPendingPushes()
    let pushed = 0
    for (const entry of pending) {
      try {
        await client.write({ ratingKey: String(entry.rating_key), action: entry.pending_push, seconds: entry.view_offset_s || 0 })
        await clearPendingPush({ ratingKey: String(entry.rating_key), action: entry.pending_push })
        pushed += 1
      } catch (err) {
        if (err.kind === 'token') throw err
        job.log(`${labelOf(entry)}: ${err.message}`, 'warn')
      }
    }
    return pushed
  }

  const linkManagers = async ({ rows, job }) => {
    const index = await loadManagerIndex().catch((err) => {
      job.log(`Sonarr and Radarr: ${err.message}`, 'warn')
      return null
    })
    if (!index) return
    const updates = managerUpdatesOf({ rows: rows.filter((row) => !row.recording_id), index })
    await saveManagerFields(updates)
    job.fact('Downloaded by Sonarr or Radarr', updates.filter((update) => update.manager).length)
  }

  const linkNewManagers = async ({ rows, job }) => {
    const lookup = createManagerLookup()
    if (!lookup) return
    const updates = []
    try {
      for (const row of rows.filter((entry) => !entry.recording_id)) {
        const { found } = await lookup.managerOf({ filePath: row.file_path, apps: appsForKind(row.kind) })
        if (found) updates.push(managerUpdateOf({ row, found }))
      }
    } catch (err) {
      job.log(`Sonarr and Radarr: ${err.message}`, 'warn')
    }
    if (!updates.length) return
    await saveManagerFields(updates)
    job.fact('Downloaded by Sonarr or Radarr', updates.length)
  }

  return { afterSync }
}

export const managerUpdatesOf = ({ rows, index }) => {
  const paths = createPathIndex(index.values())
  return rows.map((row) => managerUpdateOf({ row, found: findInPathIndex({ index: paths, filePath: row.file_path }) }))
}

const managerUpdateOf = ({ row, found }) => ({
  rating_key: row.rating_key,
  part_id: row.part_id,
  manager: found?.manager ?? null,
  manager_file_id: found?.fileId ?? null,
  manager_item_id: found?.itemId ?? null,
  manager_series_id: found?.seriesId ?? null,
})

const uniqueItems = (items) => [...new Map(items.map((item) => [String(item.ratingKey), item])).values()]

const labelOf = (entry) => {
  const number = entry.season != null && entry.episode != null ? ` S${entry.season} E${entry.episode}` : ''
  return `${entry.show_title || entry.title || 'Plex item'}${number}`
}

const SCANNED_TYPES = new Set(['show', 'movie'])
