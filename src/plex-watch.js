import { trackJob } from './activity.js'
import { db, getSetting, setSetting } from './db.js'
import { plexSectionsToSearch } from './plex.js'
import { createPlexWatchSync } from './plex-watch-sync.js'
import { createLibraryScan } from './plex-library-scan.js'
import {
  clearPendingPush,
  loadPendingPushes,
  loadRecordingFiles,
  loadWholeLibrarySettings,
  saveManagerFields,
  saveScannedItems,
} from './plex-library-store.js'
import { buildManagerIndex } from './arr-store.js'
import { getMediaRoot, getMoviesRoot, getOneOffRoot } from './sync.js'

export const loadPlexWatchConfig = async () => {
  const [url, token, sections] = await Promise.all([getSetting('plex_url'), getSetting('plex_token'), plexSectionsToSearch()])
  if (!url || !token || !sections.length) return null
  return { url: url.replace(/\/$/, ''), token, sections }
}

export const loadPlexWatchToggles = async () => {
  const [from, to] = await Promise.all([getSetting(FROM_PLEX_KEY), getSetting(TO_PLEX_KEY)])
  return { fromPlex: from !== 'false', toPlex: to !== 'false' }
}

export const savePlexWatchToggles = async ({ fromPlex, toPlex }) => {
  if (typeof fromPlex === 'boolean') await setSetting(FROM_PLEX_KEY, String(fromPlex))
  if (typeof toPlex === 'boolean') await setSetting(TO_PLEX_KEY, String(toPlex))
  return loadPlexWatchToggles()
}

export const loadPlexWatchStatus = async () => {
  const raw = await getSetting(STATUS_KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

const savePlexWatchStatus = (status) => setSetting(STATUS_KEY, JSON.stringify(status))

const loadRows = () => db('recordings')
  .whereNotNull('file_path')
  .whereNotNull('imported_at')
  .whereNull('purged_at')
  .whereNull('library_deleted_at')
  .whereIn('status', ['done', 'partial'])
  .select('recording_id', 'title', 'season', 'episode', 'file_path', 'duration_s', 'watched_at', 'played_at', 'playback_position_s')

const loadSnapshots = () => db('plex_watch_state').select()

const saveSnapshots = async (snapshots) => {
  if (!snapshots.length) return
  const syncedAt = Date.now()
  await db.transaction(async (trx) => {
    for (const snapshot of snapshots) {
      await trx('plex_watch_state').insert({ ...snapshot, synced_at: syncedAt }).onConflict('recording_id').merge()
    }
  })
}

const pruneSnapshots = async (keepIds) => {
  const known = await db('plex_watch_state').pluck('recording_id')
  const keep = new Set(keepIds)
  const gone = known.filter((id) => !keep.has(id))
  for (let start = 0; start < gone.length; start += DELETE_CHUNK) {
    await db('plex_watch_state').whereIn('recording_id', gone.slice(start, start + DELETE_CHUNK)).delete()
  }
}

const applyPull = ({ recordingId, patch }) => db('recordings').where({ recording_id: recordingId }).update(patch)

const loadLibraryRoots = async () => Promise.all([getMediaRoot(), getMoviesRoot(), getOneOffRoot()])

const libraryScan = createLibraryScan({
  loadSettings: loadWholeLibrarySettings,
  loadRecordingFiles,
  loadRoots: loadLibraryRoots,
  saveScannedItems,
  loadPendingPushes,
  clearPendingPush,
  loadManagerIndex: () => buildManagerIndex(),
  saveManagerFields,
})

export const plexWatchSync = createPlexWatchSync({
  loadConfig: loadPlexWatchConfig,
  loadToggles: loadPlexWatchToggles,
  loadRows,
  loadSnapshots,
  saveSnapshots,
  pruneSnapshots,
  applyPull,
  loadStatus: loadPlexWatchStatus,
  saveStatus: savePlexWatchStatus,
  track: trackJob,
  afterSync: libraryScan.afterSync,
})

const FROM_PLEX_KEY = 'plex_watch_from_plex'
const TO_PLEX_KEY = 'plex_watch_to_plex'
const STATUS_KEY = 'plex_watch_status'
const DELETE_CHUNK = 500
