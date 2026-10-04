import path from 'path'
import fs from 'fs/promises'

import { db, getSetting } from './db.js'
import { notifyPlexSectionRefresh } from './plex.js'
import {
  fetchProgrammeImage,
  listFinished,
  listUpcoming,
  removeRecordings as removeTvhRecordings,
  resolveConnection,
  TvheadendError,
} from './tvheadend.js'
import { processRecordingAds, pruneCutOriginals, shouldQueueAutoDelete } from './commercials.js'
import { makeImportProgress } from './progress.js'
import { findArtwork, pruneRecordingArtwork, removeArtwork, saveArtwork } from './artwork.js'

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
  return shows
    .filter((s) => t.includes(s.show_pattern.toLowerCase()))
    .sort((a, b) => b.show_pattern.length - a.show_pattern.length)[0]
}

export const libraryDecision = ({ existing, libraryChoice, show, importUnmatched }) => {
  if (existing?.library_choice === 'exclude') return { action: 'hold', reason: HOLD_REASONS.excluded }
  if (existing?.library_choice === 'include') return { action: 'import' }
  if (libraryChoice === 'exclude') return { action: 'hold', reason: HOLD_REASONS.recordedOff }
  if (show || importUnmatched || libraryChoice === 'include') return { action: 'import' }
  return { action: 'hold', reason: HOLD_REASONS.noRule }
}

export const getOneOffRoot = async () => {
  const fromSetting = await getSetting('oneoff_root')
  if (fromSetting && fromSetting.trim()) return fromSetting.trim()
  return process.env.ONEOFF_ROOT || DEFAULT_ONEOFF_ROOT
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

export const oneOffFilename = (item) => {
  const title = createValidFilename(item.title) || 'Recording'
  const suffix = item.episode_title ? ` - ${createValidFilename(item.episode_title)}` : ''
  return `${title} - ${localStamp(item.start)}${suffix}.${item.ext || 'ts'}`
}

export const buildOneOffPath = ({ item, oneOffRoot }) => {
  const folder = createValidFilename(item.title) || 'Recording'
  return guardWithinRoot({ dest: path.join(oneOffRoot, folder, oneOffFilename(item)), root: oneOffRoot })
}

export const buildDestPath = ({ item, show, mediaRoot }) => {
  const seasonRaw = item.season != null ? String(item.season) : '0'
  const seasonPadded = seasonRaw.padStart(2, '0')
  const seasonDir = (show.season_template || 'Season {season}')
    .replaceAll('{season}', seasonPadded)
    .replaceAll('{season_padded}', seasonPadded)
    .replaceAll('{season_unpadded}', seasonRaw)
  const dest = path.join(mediaRoot, show.dest_folder, seasonDir, episodeFilename({ item, show }))
  return guardWithinRoot({ dest, root: mediaRoot, label: `${show.dest_folder}/${seasonDir}` })
}

const guardWithinRoot = ({ dest, root, label = dest }) => {
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(dest)
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`destination escapes media root: ${label}`)
  }
  return dest
}

const localStamp = (ms) => {
  const d = new Date(ms)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}`
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
  const imported = { tv: 0, oneOff: 0 }
  const roots = {
    mediaRoot: await getMediaRoot(),
    oneOffRoot: await getOneOffRoot(),
  }
  const recordingsRoot = await getRecordingsRoot()
  const tvhRecordingsPath = await getTvhRecordingsPath()
  const importUnmatched = (await getSetting('import_unmatched')) !== 'false'

  let shows, finished, conn
  try {
    shows = await db('shows').where({ enabled: true })
    if (showId != null && !shows.some((s) => s.id === showId)) {
      summary.message = `show_id ${showId} not found or not enabled`
      await finishSync(syncId, 'error', summary)
      return
    }
    conn = await resolveConnection()
    finished = await listFinished(conn)
    await captureUpcomingArtwork(conn).catch((err) => console.warn(`[sync] artwork capture: ${err.message}`))
  } catch (err) {
    summary.errors.push(err.message)
    await finishSync(syncId, 'error', summary)
    return
  }

  for (const entry of finished) {
    const show = matchShow(shows, entry.name)
    if (showId != null && show?.id !== showId) continue
    const item = toItem({ entry, tvhRecordingsPath, recordingsRoot })
    try {
      const existing = await saveRecordingDetails({ item, conn })
      const decision = libraryDecision({ existing, libraryChoice: entry.libraryChoice, show, importUnmatched })
      if (decision.action === 'hold') {
        await holdRecording({ item, existing, reason: decision.reason })
        continue
      }
      const { summaryKey, adResult } = await processItem({ item, show, roots })
      summary[summaryKey]++
      if (summaryKey === 'imported') imported[show ? 'tv' : 'oneOff']++
      if (adResult) accumulateAdSummary(summary, adResult)
      if (
        summaryKey === 'imported'
        && show?.delete_after_import
        && shouldQueueAutoDelete({ show, adResult })
      ) {
        deletables.push({ recording_id: item.id, title: item.title })
      }
    } catch (err) {
      summary.failed++
      summary.errors.push(`${item.title}: ${err.message}`)
    }
  }

  if (imported.tv > 0) summary.plex = await notifyPlexSectionRefresh()
  if (imported.oneOff > 0) summary.plexOneOffs = await refreshOneOffSection()
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
  end: entry.endDate,
  size: entry.filesize,
  statusText: entry.statusText,
  channelId: entry.channelId || null,
  channelName: entry.channelName,
  description: entry.description,
  image: entry.image,
  tvhFilename: entry.filename || null,
  sourcePath: entry.filename
    ? localPathFor({ tvhFilename: entry.filename, tvhRecordingsPath, recordingsRoot })
    : null,
  ext: entry.filename ? path.extname(entry.filename).slice(1) || 'ts' : 'ts',
})

const saveRecordingDetails = async ({ item, conn }) => {
  const details = {
    title: item.title,
    episode_title: item.episode_title || null,
    season: item.season,
    episode: item.episode,
    channel_id: item.channelId,
    channel_name: item.channelName,
    aired_at: item.start,
    duration_s: item.end > item.start ? Math.round((item.end - item.start) / 1000) : null,
    synopsis: item.description,
    image_url: item.image,
    tvh_filename: item.tvhFilename,
  }
  await db('recordings')
    .insert({ recording_id: item.id, status: 'pending', ...details })
    .onConflict('recording_id')
    .merge(details)
  const row = await db('recordings').where({ recording_id: item.id }).first()
  if (!row.image_checked_at) await saveRecordingImage({ item, conn })
  return row
}

export const captureRecordingArtwork = async ({ recordingId, source, conn }) => {
  if (!source || failedArtworkSources.has(source)) return null
  if (await findArtwork({ kind: 'recording', id: recordingId })) return null
  const image = await fetchProgrammeImage({ source, conn })
  if (!image) {
    failedArtworkSources.add(source)
    return null
  }
  return saveArtwork({ kind: 'recording', id: recordingId, image })
}

const captureUpcomingArtwork = async (conn) => {
  const upcoming = (await listUpcoming(conn)).filter((e) => e.enabled && e.image)
  for (const entry of upcoming) {
    await captureRecordingArtwork({ recordingId: entry.uuid, source: entry.image, conn }).catch(() => null)
  }
}

const saveRecordingImage = async ({ item, conn }) => {
  await captureRecordingArtwork({ recordingId: item.id, source: item.image, conn }).catch(() => null)
  const imagePath = (await findArtwork({ kind: 'recording', id: item.id }))
    ? `recordings/${item.id}`
    : null
  await db('recordings').where({ recording_id: item.id }).update({
    image_path: imagePath,
    image_checked_at: db.fn.now(),
  })
}

const holdRecording = async ({ item, existing, reason }) => {
  if (['done', 'importing'].includes(existing?.status) || existing?.deleted_from_tvh_at) return
  await db('recordings').where({ recording_id: item.id }).update({
    status: 'not_imported',
    error: reason,
    file_path: null,
  })
}

const refreshOneOffSection = async () => {
  const sectionId = await getSetting('plex_oneoff_section_id')
  if (!sectionId) return { skipped: true, reason: 'no Plex library chosen for one-off recordings' }
  return notifyPlexSectionRefresh({ sectionId })
}

const processItem = async ({ item, show, roots }) => {
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

  if (!show && !(await isDirectory(roots.oneOffRoot))) {
    await upsertRecording({
      item, show, file_path: null, status: 'skipped',
      error: `one-off folder ${roots.oneOffRoot} not found; mount it or change it in Settings`,
    })
    return { summaryKey: 'skipped' }
  }

  const filePath = show
    ? buildDestPath({ item, show, mediaRoot: roots.mediaRoot })
    : buildOneOffPath({ item, oneOffRoot: roots.oneOffRoot })
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
  if (outcome.dbStatus === 'done' && show && show.ad_removal !== 'off') {
    const adRemovalEnabled = (await getSetting('ad_removal_enabled')) === 'true'
    if (adRemovalEnabled) {
      adResult = await processRecordingAds({ filePath, mode: show.ad_removal, recordingId: item.id })
    }
  }
  return { summaryKey: outcome.summaryKey, adResult }
}

const isDirectory = async (dir) => (await fs.stat(dir).catch(() => null))?.isDirectory() ?? false

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
    const result = await removeTvhRecordings({ recordingIds: ids })
    const now = new Date().toISOString()
    await db('recordings').whereIn('recording_id', result.removed).update({ deleted_from_tvh_at: now })
    return { triggered: true, removed: result.removed, unmapped: result.unknown, removed_at: now }
  } catch (err) {
    const stage = err instanceof TvheadendError ? err.stage : 'unknown'
    const code = err instanceof TvheadendError ? err.code : undefined
    console.error(`[tvheadend] remove-after-import failed for ${ids.length} recording(s) (stage ${stage}): ${err.message}`)
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
  const kept = await db('recordings').select('recording_id')
  await pruneRecordingArtwork({ keepIds: kept.map((r) => r.recording_id) }).catch(() => 0)
}

export const forgetRecordingArtwork = (recordingId) =>
  removeArtwork({ kind: 'recording', id: recordingId }).catch(() => null)

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
    show_id: show?.id ?? null,
    title: item.title,
    episode_title: item.episode_title || null,
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
const DEFAULT_ONEOFF_ROOT = '/media/one-offs'
const HOLD_REASONS = {
  excluded: 'Kept out of the library',
  recordedOff: 'Recorded with Add to library off',
  noRule: 'No show rule, and Import every recording is off',
}
const SIZE_TOLERANCE_BYTES = 1_000_000
const PROGRESS_TICK_MS = 1000
const SYNC_HISTORY_CAP = 500
const RECORDING_TOMBSTONE_TTL_DAYS = 30

let inFlight = null
const failedArtworkSources = new Set()
