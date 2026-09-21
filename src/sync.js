import path from 'path'
import fs from 'fs/promises'

import { db, getSetting } from './db.js'
import { notifyPlexSectionRefresh } from './plex.js'
import {
  listFinished,
  deleteRecordings as deleteTvhRecordings,
  resolveConnection,
  TvheadendError,
} from './tvheadend.js'
import { processRecordingAds, pruneCutOriginals, shouldQueueAutoDelete } from './commercials.js'
import { makeImportProgress } from './progress.js'

export const getActiveSyncId = () => inFlight?.syncId ?? null

export const startSync = async ({ trigger = 'manual', showId = null } = {}) => {
  if (inFlight) return { syncId: inFlight.syncId, alreadyRunning: true }

  const syncId = await createSync(trigger, showId)
  const promise = doSync({ syncId, trigger, showId })
    .catch((err) => {
      console.error('[sync] unhandled error:', err)
    })
    .finally(() => {
      inFlight = null
    })
  inFlight = { syncId, promise }
  return { syncId, alreadyRunning: false }
}

export const matchShow = (shows, showTitle) => {
  const t = showTitle.toLowerCase()
  return shows.find((s) => t.includes(s.show_pattern.toLowerCase()))
}

export const getMediaRoot = async () => {
  const fromSetting = await getSetting('media_root')
  if (fromSetting && fromSetting.trim()) return fromSetting.trim()
  return process.env.MEDIA_ROOT || DEFAULT_MEDIA_ROOT
}

export const getRecordingsRoot = async () => {
  const fromSetting = await getSetting('recordings_root')
  if (fromSetting && fromSetting.trim()) return fromSetting.trim()
  return process.env.RECORDINGS_ROOT || DEFAULT_RECORDINGS_ROOT
}

export const getTvhRecordingsPath = async () => {
  const fromSetting = await getSetting('tvh_recordings_path')
  if (fromSetting && fromSetting.trim()) return fromSetting.trim()
  return process.env.TVH_RECORDINGS_PATH || DEFAULT_RECORDINGS_ROOT
}

export const localPathFor = ({ tvhFilename, tvhRecordingsPath, recordingsRoot }) => {
  const remoteRoot = tvhRecordingsPath.replace(/\/+$/, '')
  const localRoot = recordingsRoot.replace(/\/+$/, '')
  if (tvhFilename === remoteRoot) return localRoot
  if (!tvhFilename.startsWith(`${remoteRoot}/`)) return null
  return path.join(localRoot, tvhFilename.slice(remoteRoot.length + 1))
}

export const createValidFilename = (name) =>
  String(name)
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

export const episodeFilename = ({ item, show }) => {
  const base = createValidFilename(show.dest_folder)
  const suffix = item.episode_title ? ` - ${createValidFilename(item.episode_title)}` : ''
  const ext = item.ext || 'ts'
  if (item.season != null && item.episode != null) {
    const ss = String(item.season).padStart(2, '0')
    const ee = String(item.episode).padStart(2, '0')
    return `${base} - S${ss}E${ee}${suffix}.${ext}`
  }
  const aired = new Date(item.start).toISOString().slice(0, 10)
  return `${base} - ${aired}${suffix}.${ext}`
}

export const buildDestPath = ({ item, show, mediaRoot }) => {
  const seasonRaw = item.season != null ? String(item.season) : '0'
  const seasonPadded = seasonRaw.padStart(2, '0')
  const seasonDir = (show.season_template || 'Season {season}')
    .replaceAll('{season}', seasonPadded)
    .replaceAll('{season_padded}', seasonPadded)
    .replaceAll('{season_unpadded}', seasonRaw)
  const dest = path.join(mediaRoot, show.dest_folder, seasonDir, episodeFilename({ item, show }))
  const root = path.resolve(mediaRoot)
  const resolved = path.resolve(dest)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`destination escapes media root: ${show.dest_folder}/${seasonDir}`)
  }
  return dest
}

export const classifyImport = ({ expectedSize, actualSize, tolerance = SIZE_TOLERANCE_BYTES }) => {
  const expectedKnown = Number.isFinite(expectedSize) && expectedSize > 0
  const actualKnown = Number.isFinite(actualSize) && actualSize >= 0
  const shortfall = expectedKnown && actualKnown ? expectedSize - actualSize : 0
  if (shortfall > tolerance) {
    return {
      dbStatus: 'partial',
      summaryKey: 'failed',
      sizeToStore: actualSize,
      error: `short copy: on-disk ${actualSize} bytes vs TVHeadend ${expectedSize} bytes (Δ ${shortfall})`,
    }
  }
  return {
    dbStatus: 'done',
    summaryKey: 'imported',
    sizeToStore: actualKnown ? actualSize : expectedSize,
    error: null,
  }
}

const doSync = async ({ syncId, trigger, showId = null }) => {
  const summary = { trigger, imported: 0, skipped: 0, failed: 0, errors: [] }
  if (showId != null) summary.showId = showId
  const deletables = []
  const mediaRoot = await getMediaRoot()
  const recordingsRoot = await getRecordingsRoot()
  const tvhRecordingsPath = await getTvhRecordingsPath()

  let shows, finished
  try {
    shows = await db('shows').where({ enabled: true })
    if (showId != null) {
      shows = shows.filter((s) => s.id === showId)
      if (shows.length === 0) {
        summary.message = `show_id ${showId} not found or not enabled`
        await finishSync(syncId, 'error', summary)
        return
      }
    }
    if (shows.length === 0) {
      summary.message = 'no active shows'
      await finishSync(syncId, 'ok', summary)
      return
    }
    const conn = await resolveConnection()
    finished = await listFinished(conn)
  } catch (err) {
    summary.errors.push(err.message)
    await finishSync(syncId, 'error', summary)
    return
  }

  for (const entry of finished) {
    const show = matchShow(shows, entry.name)
    if (!show) continue
    const item = toItem({ entry, tvhRecordingsPath, recordingsRoot })
    try {
      const { summaryKey, adResult } = await processItem({ item, show, mediaRoot })
      summary[summaryKey]++
      if (adResult) accumulateAdSummary(summary, adResult)
      if (
        summaryKey === 'imported'
        && show.delete_after_import
        && shouldQueueAutoDelete({ show, adResult })
      ) {
        deletables.push({ recording_id: item.id, title: item.title })
      }
    } catch (err) {
      summary.failed++
      summary.errors.push(`${item.title}: ${err.message}`)
    }
  }

  if (summary.imported > 0) summary.plex = await notifyPlexSectionRefresh()
  if (deletables.length > 0) summary.delete = await runAutoDelete(deletables, summary.plex)

  const finalStatus = summary.failed > 0 ? 'partial' : 'ok'
  await finishSync(syncId, finalStatus, summary)
}

const toItem = ({ entry, tvhRecordingsPath, recordingsRoot }) => ({
  id: entry.uuid,
  title: entry.name,
  episode_title: entry.episodeTitle,
  season: entry.season,
  episode: entry.episode,
  start: entry.startDate,
  size: entry.filesize,
  statusText: entry.statusText,
  sourcePath: entry.filename
    ? localPathFor({ tvhFilename: entry.filename, tvhRecordingsPath, recordingsRoot })
    : null,
  ext: entry.filename ? path.extname(entry.filename).slice(1) || 'ts' : 'ts',
})

const processItem = async ({ item, show, mediaRoot }) => {
  const existing = await db('recordings').where({ recording_id: item.id }).first()
  if (existing?.status === 'done') return { summaryKey: 'skipped' }
  if (existing?.deleted_from_tvh_at) return { summaryKey: 'skipped' }

  if (!item.sourcePath) {
    await upsertRecording({
      item, show, file_path: null, status: 'skipped',
      error: `TVHeadend file path is outside the recordings mount (${item.statusText || 'no file'})`,
    })
    return { summaryKey: 'skipped' }
  }

  let sourceStat
  try {
    sourceStat = await fs.stat(item.sourcePath)
  } catch {
    await upsertRecording({
      item, show, file_path: null, status: 'skipped',
      error: `file not found at ${item.sourcePath}; check the recordings mount`,
    })
    return { summaryKey: 'skipped' }
  }

  const filePath = buildDestPath({ item, show, mediaRoot })
  await upsertRecording({ item, show, file_path: filePath, status: 'importing', error: null })
  await fs.mkdir(path.dirname(filePath), { recursive: true })

  await importFile({ sourcePath: item.sourcePath, filePath, size: sourceStat.size, recordingId: item.id })

  let actualSize = null
  try {
    actualSize = (await fs.stat(filePath)).size
  } catch {
    actualSize = null
  }

  const outcome = classifyImport({ expectedSize: sourceStat.size, actualSize })
  const statusNote = item.statusText && item.statusText !== 'Completed OK'
    ? `TVHeadend reported: ${item.statusText}`
    : null
  await db('recordings').where({ recording_id: item.id }).update({
    status: outcome.dbStatus,
    error: outcome.error || statusNote,
    size: outcome.sizeToStore,
    imported_at: db.fn.now(),
  })

  let adResult = null
  if (outcome.dbStatus === 'done' && show.ad_removal !== 'off') {
    const adRemovalEnabled = (await getSetting('ad_removal_enabled')) === 'true'
    if (adRemovalEnabled) {
      adResult = await processRecordingAds({ filePath, mode: show.ad_removal, recordingId: item.id })
    }
  }
  return { summaryKey: outcome.summaryKey, adResult }
}

const importFile = async ({ sourcePath, filePath, size, recordingId }) => {
  const existing = await fs.stat(filePath).catch(() => null)
  if (existing && existing.size === size) return
  await fs.rm(filePath, { force: true })
  try {
    await fs.link(sourcePath, filePath)
    return
  } catch {
    /* different filesystem or link unsupported; fall through to copy */
  }
  const progress = makeImportProgress(recordingId)
  progress.setTotal(size)
  const ticker = setInterval(async () => {
    const st = await fs.stat(filePath).catch(() => null)
    if (st) progress.update(st.size)
  }, PROGRESS_TICK_MS)
  try {
    await fs.copyFile(sourcePath, filePath)
  } finally {
    clearInterval(ticker)
    progress.stop()
  }
}

const accumulateAdSummary = (summary, adResult) => {
  if (!summary.ads) summary.ads = { scanned: 0, detected: 0, cut: 0, failed: 0, adSeconds: 0 }
  summary.ads.scanned++
  if (adResult.status === 'detected') summary.ads.detected++
  if (adResult.status === 'cut') summary.ads.cut++
  if (adResult.status === 'detect_failed' || adResult.status === 'cut_failed') summary.ads.failed++
  summary.ads.adSeconds += adResult.adSeconds
}

const runAutoDelete = async (deletables, plex) => {
  const ids = deletables.map((d) => d.recording_id)

  const guardSettingRaw = (await getSetting('delete_after_plex_refresh_only')) ?? 'true'
  const guardOn = guardSettingRaw !== 'false'
  const plexAttemptedAndFailed = guardOn && plex && !plex.triggered
  const plexUnconfigured = plex?.skipped && plex?.reason === 'plex not configured'
  if (plexAttemptedAndFailed && !plexUnconfigured) {
    return {
      skipped: true,
      reason: `plex refresh did not succeed (${plex.error || plex.reason || 'unknown'})`,
      candidates: ids.length,
    }
  }

  try {
    const result = await deleteTvhRecordings({ recordingIds: ids })
    const now = new Date().toISOString()
    await db('recordings').whereIn('recording_id', result.deleted).update({ deleted_from_tvh_at: now })
    return { triggered: true, deleted: result.deleted, unmapped: result.unknown, deleted_at: now }
  } catch (err) {
    const stage = err instanceof TvheadendError ? err.stage : 'unknown'
    const code = err instanceof TvheadendError ? err.code : undefined
    console.error(`[tvheadend] delete-after-import failed for ${ids.length} recording(s) (stage ${stage}): ${err.message}`)
    return { error: err.message, stage, code, candidates: ids.length }
  }
}

const createSync = async (trigger, showId = null) => {
  const seed = { trigger }
  if (showId != null) seed.showId = showId
  const inserted = await db('syncs').insert({
    status: 'running',
    summary_json: JSON.stringify(seed),
  }).returning('id')
  const row = inserted[0]
  return typeof row === 'object' ? row.id : row
}

const finishSync = async (syncId, status, summary) => {
  await db('syncs').where({ id: syncId }).update({
    status,
    finished_at: db.fn.now(),
    summary_json: JSON.stringify(summary),
  })
  await pruneSyncHistory()
  await pruneTombstonedRecordings()
  await pruneCutOriginals()
}

const pruneTombstonedRecordings = async () => {
  await db('recordings')
    .whereNotNull('deleted_from_tvh_at')
    .andWhereRaw(
      `datetime(deleted_from_tvh_at) < datetime('now', '-${RECORDING_TOMBSTONE_TTL_DAYS} days')`
    )
    .delete()
}

const pruneSyncHistory = async () => {
  const keep = await db('syncs')
    .select('id')
    .orderBy('started_at', 'desc')
    .limit(SYNC_HISTORY_CAP)
  const keepIds = keep.map((r) => r.id)
  if (keepIds.length < SYNC_HISTORY_CAP) return
  await db('syncs')
    .whereNotIn('id', keepIds)
    .andWhere('status', '!=', 'running')
    .delete()
}

const upsertRecording = async ({ item, show, file_path, status, error }) => {
  const payload = {
    recording_id: item.id,
    show_id: show.id,
    title: item.episode_title ? `${item.title} - ${item.episode_title}` : item.title,
    season: item.season,
    episode: item.episode,
    file_path,
    size: item.size > 0 ? item.size : null,
    status,
    error,
    purged_at: null,
  }
  const { recording_id, ...mergeable } = payload
  await db('recordings')
    .insert(payload)
    .onConflict('recording_id')
    .merge(mergeable)
}

const DEFAULT_MEDIA_ROOT = '/media/tv'
const DEFAULT_RECORDINGS_ROOT = '/recordings'
const SIZE_TOLERANCE_BYTES = 1_000_000
const PROGRESS_TICK_MS = 1000
const SYNC_HISTORY_CAP = 500
const RECORDING_TOMBSTONE_TTL_DAYS = 30

let inFlight = null
