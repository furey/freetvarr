import { db, getSetting, setSetting } from './db.js'
import { RESUME_END_MARGIN_S } from './playback.js'
import { ratingKeyOfItemId } from './plex-library.js'

export const loadWholeLibrarySettings = async () => {
  const [enabled, chosen, tv, oneoff, movies] = await Promise.all([
    getSetting(ENABLED_KEY),
    getSetting(SECTIONS_KEY),
    getSetting('plex_tv_section_id'),
    getSetting('plex_oneoff_section_id'),
    getSetting('plex_movies_section_id'),
  ])
  return wholeLibrarySettingsOf({ enabled, chosen, tv, oneoff, movies })
}

export const wholeLibrarySettingsOf = ({ enabled, chosen, tv, oneoff, movies }) => {
  const parsed = parseIds(chosen)
  const defaults = [tv, movies].filter(Boolean).map(String)
  return {
    enabled: enabled !== 'false',
    sectionIds: (parsed ?? defaults).filter((id) => id !== String(oneoff ?? '')),
    oneOffSectionId: oneoff ? String(oneoff) : null,
  }
}

export const saveWholeLibrarySettings = async ({ enabled, sectionIds }) => {
  if (typeof enabled === 'boolean') await setSetting(ENABLED_KEY, String(enabled))
  if (Array.isArray(sectionIds)) await setSetting(SECTIONS_KEY, JSON.stringify(sectionIds.map(String)))
  return loadWholeLibrarySettings()
}

export const loadLibraryItemRows = async ({ settings } = {}) => {
  const chosen = settings ?? await loadWholeLibrarySettings()
  if (!chosen.enabled || !chosen.sectionIds.length) return []
  return db('library_items').whereIn('section_id', chosen.sectionIds).select()
}

export const loadItemParts = (itemId) => {
  const ratingKey = ratingKeyOfItemId(itemId)
  return ratingKey ? db('library_items').where({ rating_key: ratingKey }).select() : []
}

export const plexItemPlaybackRow = async ({ itemId, partId = null }) => {
  const parts = await loadItemParts(itemId)
  if (!parts.length) return null
  const part = parts.find((entry) => entry.part_id === partId) ?? parts.find((entry) => !entry.recording_id) ?? parts[0]
  return {
    recording_id: itemId,
    title: part.show_title || part.title,
    episode_title: part.kind === 'episode' ? part.title : null,
    status: 'done',
    file_path: part.file_path,
    duration_s: part.duration_s ?? null,
    playback_position_s: part.view_offset_s > 0 ? part.view_offset_s : null,
    deleted_from_tvh_at: 'plex',
    purged_at: null,
  }
}

export const loadPartsByFile = (filePath) => db('library_items').where({ file_path: filePath }).select()

export const saveScannedItems = async ({ rows, full, sectionId, seenAt }) => {
  const existing = await db('library_items').where({ section_id: sectionId }).select('rating_key', 'part_id', 'pending_push', 'watched_at', 'view_offset_s', 'manager', 'manager_file_id', 'manager_item_id', 'manager_series_id', 'file_path')
  const byId = new Map(existing.map((row) => [partKeyOf(row), row]))
  await db.transaction(async (trx) => {
    for (const row of rows) {
      const kept = byId.get(partKeyOf(row))
      await trx('library_items').insert(rowToSave({ row, kept })).onConflict(['rating_key', 'part_id']).merge()
    }
    if (full) await trx('library_items').where({ section_id: sectionId }).where('seen_at', '<', seenAt).delete()
  })
}

export const rowToSave = ({ row, kept }) => {
  const sameFile = kept && kept.file_path === row.file_path
  const managed = sameFile && kept.manager
    ? { manager: kept.manager, manager_file_id: kept.manager_file_id, manager_item_id: kept.manager_item_id, manager_series_id: kept.manager_series_id }
    : {}
  const local = kept?.pending_push
    ? { pending_push: kept.pending_push, watched_at: kept.watched_at, view_offset_s: kept.view_offset_s }
    : {}
  return { ...row, ...managed, ...local }
}

export const saveManagerFields = async (updates) => {
  await db.transaction(async (trx) => {
    for (const update of updates) {
      await trx('library_items')
        .where({ rating_key: update.rating_key, part_id: update.part_id })
        .update({
          manager: update.manager,
          manager_file_id: update.manager_file_id,
          manager_item_id: update.manager_item_id,
          manager_series_id: update.manager_series_id,
        })
    }
  })
}

export const markItemWatched = async ({ itemId, watched, nowMs = Date.now() }) => {
  const ratingKey = ratingKeyOfItemId(itemId)
  if (!ratingKey) return null
  const patch = watched
    ? { watched_at: nowMs, last_viewed_at: nowMs, view_offset_s: 0, pending_push: 'scrobble' }
    : { watched_at: null, view_offset_s: 0, pending_push: 'unscrobble' }
  const n = await db('library_items').where({ rating_key: ratingKey }).update(patch)
  if (!n) return null
  return { watched, watched_at: watched ? new Date(nowMs).toISOString() : null, playback_position_s: null }
}

export const saveItemPosition = async ({ itemId, seconds, durationS, nowMs = Date.now() }) => {
  const ratingKey = ratingKeyOfItemId(itemId)
  if (!ratingKey) return 0
  const finished = durationS > 0 && seconds >= durationS - RESUME_END_MARGIN_S
  const patch = finished
    ? { watched_at: nowMs, last_viewed_at: nowMs, view_offset_s: 0, pending_push: 'scrobble' }
    : { view_offset_s: seconds, last_viewed_at: nowMs, pending_push: 'progress' }
  return db('library_items').where({ rating_key: ratingKey }).update(patch)
}

export const loadPendingPushes = async () => {
  const rows = await db('library_items').whereNotNull('pending_push').select('rating_key', 'pending_push', 'view_offset_s', 'title', 'show_title', 'season', 'episode')
  const byKey = new Map()
  for (const row of rows) byKey.set(String(row.rating_key), row)
  return [...byKey.values()]
}

export const clearPendingPush = ({ ratingKey, action }) => db('library_items')
  .where({ rating_key: ratingKey, pending_push: action })
  .update({ pending_push: null })

export const removePartsByFile = (filePath) => db('library_items').where({ file_path: filePath }).delete()

export const loadRecordingFiles = () => db('recordings')
  .whereNotNull('file_path')
  .whereNull('purged_at')
  .select('recording_id as recordingId', 'file_path as filePath')

const parseIds = (raw) => {
  if (!raw) return null
  try {
    const ids = JSON.parse(raw)
    return Array.isArray(ids) ? ids.map(String) : null
  } catch {
    return null
  }
}

const partKeyOf = (row) => `${row.rating_key}|${row.part_id}`

const ENABLED_KEY = 'plex_whole_library'
const SECTIONS_KEY = 'plex_library_sections'
