import path from 'path'
import fs from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { fileURLToPath } from 'url'

import { db, getSetting } from './db.js'
import { setProgress, clearProgress, formatEta } from './progress.js'
import { currentJob, joinJob } from './activity.js'

export const processRecordingAds = async ({ filePath, mode, recordingId, title = null, tools = defaultTools() }) => {
  if (scansInFlight.has(recordingId)) return { status: 'busy', breaks: [], adSeconds: 0 }
  scansInFlight.add(recordingId)
  try {
    const label = title ?? await adJobTitleOf(recordingId)
    return await joinJob(
      { kinds: ['import'], kind: 'ads', title: label ? `Ad removal · ${label}` : 'Ad removal', ref: { recordingId } },
      async (job) => {
        const result = await scanRecordingAds({ filePath, mode, recordingId, tools })
        noteAdResult({ job, result })
        return result
      },
    )
  } finally {
    scansInFlight.delete(recordingId)
  }
}

const noteAdResult = ({ job, result }) => {
  const text = AD_RESULT_TEXT[result.status] ?? result.status
  job.log(`${text}${result.breaks.length ? ` · ${result.breaks.length} breaks` : ''}`)
  if (job.run.kind !== 'ads') return
  job.outcome(text)
  if (result.status.endsWith('_failed')) job.fail(text)
}

const adJobTitleOf = async (recordingId) => {
  const row = await db('recordings').where({ recording_id: recordingId }).first('title').catch(() => null)
  return row?.title ?? null
}

const AD_RESULT_TEXT = {
  cut: 'Ads cut',
  detected: 'Ads marked',
  no_breaks: 'No ads found',
  detect_failed: 'Ad scan failed',
  cut_failed: 'Ad cut failed',
}

const scanRecordingAds = async ({ filePath, mode, recordingId, tools }) => {
  const workdir = adWorkdir(filePath)
  let status = mode === 'cut' ? 'cut_failed' : 'detect_failed'
  let breaks = []
  let restored = false
  try {
    const before = await db('recordings').where({ recording_id: recordingId }).first()
    await db('recordings').where({ recording_id: recordingId }).update({ ad_status: 'scanning' })
    await fs.rm(workdir, { recursive: true, force: true })
    await fs.mkdir(workdir, { recursive: true })
    const sourcePath = await scanSourceOf({ filePath, mode, workdir })
    breaks = await tools.detect({ filePath: sourcePath, workdir, recordingId })
    if (breaks.length === 0) {
      if (sourcePath !== filePath) {
        await putBackupBack({ filePath, recordingId, before })
        restored = true
      }
      status = 'no_breaks'
    } else if (mode !== 'cut') {
      status = 'detected'
    } else {
      const outPath = await tools.cut({ filePath: sourcePath, workdir, breaks, recordingId })
      const { backupCreated } = await swapInCut({ filePath, outPath })
      const { size } = await fs.stat(filePath)
      await db('recordings').where({ recording_id: recordingId })
        .update(cutPatchOf({ before, backupCreated, size, now: new Date().toISOString() }))
      status = 'cut'
    }
  } catch (err) {
    console.error(`[ads] ${path.basename(filePath)}: ${err.message}`)
    currentJob()?.log(err.message, 'error')
  } finally {
    clearProgress(recordingId)
  }
  await fs.rm(workdir, { recursive: true, force: true }).catch(() => {})
  await fs.rmdir(path.dirname(workdir)).catch(() => {})
  await syncSkipMarkers({ filePath, status, breaks }).catch((err) => {
    console.error(`[ads] ${path.basename(filePath)}: failed to update skip markers: ${err.message}`)
  })
  await db('recordings').where({ recording_id: recordingId }).update({
    ad_status: status,
    ad_breaks_json: breaks.length ? JSON.stringify(breaks) : null,
    ad_processed_at: db.fn.now(),
  }).catch((err) => {
    console.error(`[ads] ${recordingId}: failed to record result: ${err.message}`)
  })
  return { status, breaks, adSeconds: totalBreakSeconds(breaks), restored }
}

export const isAdJobRunning = (recordingId) => scansInFlight.has(recordingId)

export const backupPathOf = (filePath) => `${filePath}${ORIG_SUFFIX}`

export const cutPatchOf = ({ before, backupCreated, size, now }) => ({
  size,
  ad_cut_at: now,
  ...(backupCreated ? { ad_backup_saved_at: now, ad_backup_uncut: !before?.ad_cut_at } : {}),
})

export const swapInCut = async ({ filePath, outPath }) => {
  const backupPath = backupPathOf(filePath)
  if (await pathExists(backupPath)) {
    await fs.rename(outPath, filePath)
    return { backupCreated: false }
  }
  await fs.rename(filePath, backupPath)
  try {
    await fs.rename(outPath, filePath)
  } catch (err) {
    await fs.rename(backupPath, filePath)
    throw err
  }
  return { backupCreated: true }
}

export const restoreOriginal = async ({ recordingId, filePath }) => {
  if (scansInFlight.has(recordingId)) return { error: 'busy' }
  const backupPath = backupPathOf(filePath)
  if (!(await pathExists(backupPath))) return { error: 'gone' }
  scansInFlight.add(recordingId)
  try {
    const before = await db('recordings').where({ recording_id: recordingId }).first()
    const size = await putBackupBack({ filePath, recordingId, before })
    return { restored: true, uncut: Boolean(before?.ad_backup_uncut), size }
  } finally {
    scansInFlight.delete(recordingId)
  }
}

const putBackupBack = async ({ filePath, recordingId, before }) => {
  await fs.rename(backupPathOf(filePath), filePath)
  await fs.rm(skipMarkerPath(filePath), { force: true })
  const { size } = await fs.stat(filePath)
  await db('recordings').where({ recording_id: recordingId }).update(restorePatchOf({ before, size }))
  return size
}

export const restorePatchOf = ({ before, size }) => ({
  size,
  ad_status: null,
  ad_breaks_json: null,
  ad_backup_saved_at: null,
  ad_backup_uncut: null,
  ...(before?.ad_backup_uncut ? { ad_cut_at: null } : {}),
})

export const backupKeptUntil = ({ savedAt, retentionDays }) => {
  const savedMs = Date.parse(sqliteUtc(savedAt))
  if (!Number.isFinite(savedMs)) return null
  return new Date(savedMs + retentionDays * DAY_MS).toISOString()
}

export const isBackupExpired = ({ savedAt, retentionDays, nowMs }) => {
  const keptUntil = backupKeptUntil({ savedAt, retentionDays })
  return keptUntil != null && Date.parse(keptUntil) <= nowMs
}

export const originalRetentionDays = async () => {
  const raw = await getSetting('ad_original_retention_days')
  const days = Number.parseInt(raw, 10)
  return Number.isInteger(days) && days > 0 ? days : DEFAULT_ORIG_RETENTION_DAYS
}

export const adScansRunning = () => scansInFlight.size

export const startManualAdScan = ({ filePath, mode, recordingId, onDone = () => {} }) => {
  if (scansInFlight.has(recordingId)) return false
  processRecordingAds({ filePath, mode, recordingId })
    .then(onDone)
    .catch((err) => console.error(`[ads] ${recordingId}: ${err.message}`))
  return true
}

export const pruneCutOriginals = async ({ nowMs = Date.now() } = {}) => {
  const retentionDays = await originalRetentionDays()
  const rows = await db('recordings')
    .whereNotNull('ad_backup_saved_at')
    .whereNotNull('file_path')
    .select('recording_id', 'file_path', 'ad_backup_saved_at')
  const expired = rows.filter((row) => isBackupExpired({ savedAt: row.ad_backup_saved_at, retentionDays, nowMs }))
  for (const row of expired) {
    if (scansInFlight.has(row.recording_id)) continue
    await fs.unlink(backupPathOf(row.file_path)).catch(() => {})
    await db('recordings').where({ recording_id: row.recording_id })
      .update({ ad_backup_saved_at: null, ad_backup_uncut: null })
  }
  return expired.length
}

export const resetInterruptedScans = async () =>
  db('recordings').where({ ad_status: 'scanning' }).update({ ad_status: null })

export const recoverInterruptedCuts = async () => {
  const rows = await db('recordings').whereNotNull('file_path')
    .select('recording_id', 'file_path', 'ad_processed_at', 'ad_cut_at', 'ad_backup_saved_at')
  for (const row of rows) {
    const backupPath = backupPathOf(row.file_path)
    const hasBackup = await pathExists(backupPath)
    if (hasBackup && !(await pathExists(row.file_path))) {
      await fs.rename(backupPath, row.file_path).catch((err) => {
        console.error(`[ads] failed to restore ${backupPath}: ${err.message}`)
      })
      continue
    }
    const patch = backupReconcilePatchOf({ row, hasBackup, now: new Date().toISOString() })
    if (patch) await db('recordings').where({ recording_id: row.recording_id }).update(patch)
  }
}

export const backupReconcilePatchOf = ({ row, hasBackup, now }) => {
  if (hasBackup && !row.ad_backup_saved_at) {
    const savedAt = row.ad_processed_at || now
    return { ad_backup_saved_at: savedAt, ad_backup_uncut: true, ad_cut_at: row.ad_cut_at || savedAt }
  }
  if (!hasBackup && row.ad_backup_saved_at) return { ad_backup_saved_at: null, ad_backup_uncut: null }
  return null
}

export const comskipIniOverrideExists = async () => {
  try {
    await fs.access(CONFIG_COMSKIP_INI)
    return true
  } catch {
    return false
  }
}

export const parseEdl = (text) => {
  if (!text) return []
  return text.split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/).map(Number))
    .filter((cols) => cols.length >= 3 && cols.every(Number.isFinite))
    .filter(([, , action]) => action === 0 || action === 3)
    .map(([start, end, action]) => ({ start, end, action }))
    .filter(({ start, end }) => start >= 0 && end > start)
}

export const skipMarkerPath = (filePath) =>
  path.join(path.dirname(filePath), `${path.basename(filePath, path.extname(filePath))}.edl`)

export const formatSkipMarkers = (breaks) =>
  breaks
    .map(({ start, end }) => `${start.toFixed(2)}\t${end.toFixed(2)}\t${EDL_COMMERCIAL_BREAK}\n`)
    .join('')

export const syncSkipMarkers = async ({ filePath, status, breaks }) => {
  const markerPath = skipMarkerPath(filePath)
  if (status === 'detected') return fs.writeFile(markerPath, formatSkipMarkers(breaks))
  if (STALE_MARKER_STATUSES.includes(status)) return fs.rm(markerPath, { force: true })
}

export const computeKeepSegments = ({ breaks, duration }) => {
  const merged = breaks
    .map(({ start, end }) => ({ start: Math.max(0, start), end: Math.min(duration, end) }))
    .filter(({ start, end }) => end > start)
    .sort((a, b) => a.start - b.start)
    .reduce((acc, b) => {
      const last = acc[acc.length - 1]
      if (last && b.start <= last.end) last.end = Math.max(last.end, b.end)
      else acc.push({ ...b })
      return acc
    }, [])
  const keep = []
  let cursor = 0
  for (const b of merged) {
    if (b.start > cursor) keep.push({ start: cursor, end: b.start })
    cursor = b.end
  }
  if (cursor < duration) keep.push({ start: cursor, end: duration })
  return keep
}

export const cutVerificationTolerance = (boundaryCount) => Math.max(5, 2 * boundaryCount)

export const comskipScanTimeout = ({ duration }) => {
  const scaled = Math.round(duration) * COMSKIP_TIMEOUT_PER_SECOND_MS
  return Math.min(MAX_COMSKIP_TIMEOUT_MS, Math.max(MIN_COMSKIP_TIMEOUT_MS, scaled))
}

export const expectedScanMs = ({ durationSeconds }) =>
  Math.floor(durationSeconds * SCAN_REALTIME_FACTOR * 1000)

export const computeScanPercent = ({ elapsedMs, expectedScanMs }) => {
  if (expectedScanMs <= 0) return null
  const percent = Math.round((elapsedMs / expectedScanMs) * 100)
  return Math.max(0, Math.min(99, percent))
}

export const resolveComskipIni = ({ configIniExists }) =>
  configIniExists ? CONFIG_COMSKIP_INI : DEFAULT_COMSKIP_INI

export const shouldQueueAutoDelete = ({ show, adResult }) => {
  if (show.ad_removal !== 'cut') return true
  return adResult?.status === 'cut' || adResult?.status === 'no_breaks'
}

const detectBreaks = async ({ filePath, workdir, recordingId }) => {
  const ini = await prepareIni(workdir)
  const duration = await probeDuration(filePath).catch(() => 0)
  const timeout = comskipScanTimeout({ duration })
  const stopTicker = startScanTicker({ recordingId, durationSeconds: duration })
  try {
    const failure = await execFileP('nice', [
      '-n', '10', 'comskip', `--ini=${ini}`, `--output=${workdir}`, filePath,
    ], { timeout, maxBuffer: SPAWN_MAX_BUFFER }).then(() => null).catch((err) => err)
    const edlName = `${path.basename(filePath, path.extname(filePath))}.edl`
    const text = await fs.readFile(path.join(workdir, edlName), 'utf8').catch(() => null)
    if (text === null) throw new Error(comskipFailureReason({ failure, timeout }))
    return parseEdl(text).map(({ start, end }) => ({ start, end }))
  } finally {
    stopTicker()
  }
}

const startScanTicker = ({ recordingId, durationSeconds }) => {
  const startedAt = Date.now()
  const expected = expectedScanMs({ durationSeconds })
  const writeTick = () => {
    const elapsedMs = Date.now() - startedAt
    const percent = computeScanPercent({ elapsedMs, expectedScanMs: expected })
    const etaSeconds = expected > 0 ? Math.max(0, (expected - elapsedMs) / 1000) : null
    setProgress(recordingId, {
      phase: 'scanning',
      percent,
      etaSeconds,
      etaLabel: formatEta(etaSeconds),
      detail: percent == null ? `${Math.round(elapsedMs / 1000)}s elapsed` : null,
      startedAt,
    })
  }
  writeTick()
  const timer = setInterval(writeTick, SCAN_TICK_MS)
  return () => clearInterval(timer)
}

const prepareIni = async (workdir) => {
  const source = resolveComskipIni({ configIniExists: await comskipIniOverrideExists() })
  const base = await fs.readFile(source, 'utf8')
  const merged = path.join(workdir, 'comskip.ini')
  await fs.writeFile(merged, `${base}\noutput_edl=1\n`)
  return merged
}

const scanSourceOf = async ({ filePath, mode, workdir }) => {
  const backupPath = backupPathOf(filePath)
  if (mode !== 'cut' || !(await pathExists(backupPath))) return filePath
  const linkPath = path.join(workdir, `original${path.extname(filePath)}`)
  return fs.symlink(backupPath, linkPath).then(() => linkPath, () => backupPath)
}

const cutBreaks = async ({ filePath, workdir, breaks, recordingId }) => {
  const duration = await probeDuration(filePath)
  const segments = computeKeepSegments({ breaks, duration })
  if (segments.length === 0) throw new Error('breaks cover the entire recording')
  const segFiles = []
  for (const [i, seg] of segments.entries()) {
    setProgress(recordingId, {
      phase: 'cutting',
      percent: null,
      etaSeconds: null,
      etaLabel: null,
      detail: `segment ${i + 1}/${segments.length}`,
    })
    const segFile = `seg-${i}.ts`
    await execFileP('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-ss', String(seg.start), '-to', String(seg.end),
      '-i', filePath, '-map', '0:v', '-map', '0:a', '-map', '0:s?', '-c', 'copy',
      '-avoid_negative_ts', 'make_zero',
      path.join(workdir, segFile),
    ], { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: SPAWN_MAX_BUFFER })
    segFiles.push(segFile)
  }
  const listPath = path.join(workdir, 'list.txt')
  await fs.writeFile(listPath, segFiles.map((f) => `file '${f}'`).join('\n'))
  const outPath = path.join(workdir, 'out.ts')
  await execFileP('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', listPath,
    '-map', '0', '-c', 'copy', outPath,
  ], { cwd: workdir, timeout: FFMPEG_TIMEOUT_MS, maxBuffer: SPAWN_MAX_BUFFER })
  setProgress(recordingId, {
    phase: 'verifying',
    percent: null,
    etaSeconds: null,
    etaLabel: null,
    detail: null,
  })
  await verifyCut({ outPath, segments, boundaryCount: breaks.length * 2 })
  return outPath
}

const verifyCut = async ({ outPath, segments, boundaryCount }) => {
  const stat = await fs.stat(outPath)
  if (stat.size === 0) throw new Error('cut output is empty')
  const outDuration = await probeDuration(outPath)
  const keepDuration = segments.reduce((sum, s) => sum + (s.end - s.start), 0)
  const tolerance = cutVerificationTolerance(boundaryCount)
  const drift = Math.abs(outDuration - keepDuration)
  if (drift > tolerance) {
    throw new Error(`cut duration drift ${drift.toFixed(1)}s exceeds tolerance ${tolerance}s`)
  }
}

const probeDuration = async (filePath) => {
  const { stdout } = await execFileP('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath,
  ], { timeout: FFPROBE_TIMEOUT_MS })
  const duration = Number(stdout.trim())
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`ffprobe returned invalid duration for ${filePath}`)
  }
  return duration
}

const comskipFailureReason = ({ failure, timeout }) => {
  if (failure?.killed) return `comskip timed out after ${Math.round(timeout / 1000)}s`
  if (failure) return `comskip failed: ${failure.message.split('\n')[0]}`
  return 'comskip produced no EDL'
}

const totalBreakSeconds = (breaks) =>
  Math.round(breaks.reduce((sum, b) => sum + (b.end - b.start), 0))

const adWorkdir = (filePath) =>
  path.join(path.dirname(filePath), WORKDIR_NAME, path.basename(filePath))

const defaultTools = () => ({ detect: detectBreaks, cut: cutBreaks })

const sqliteUtc = (value) => {
  if (value == null) return ''
  const text = String(value)
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text) ? `${text.replace(' ', 'T')}Z` : text
}

const pathExists = (target) => fs.access(target).then(() => true).catch(() => false)

const execFileP = promisify(execFile)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_COMSKIP_INI = path.join(
  path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'config', 'state.db')),
  'comskip.ini',
)
const DEFAULT_COMSKIP_INI = path.join(__dirname, '..', 'assets', 'comskip.ini')

const WORKDIR_NAME = '.freetvarr-adcut'
const ORIG_SUFFIX = '.orig'
const EDL_COMMERCIAL_BREAK = 3
const STALE_MARKER_STATUSES = ['cut', 'no_breaks']
const DEFAULT_ORIG_RETENTION_DAYS = 7
const MIN_COMSKIP_TIMEOUT_MS = 60 * 60 * 1000
const MAX_COMSKIP_TIMEOUT_MS = 6 * 60 * 60 * 1000
const COMSKIP_TIMEOUT_PER_SECOND_MS = 1500
const SCAN_REALTIME_FACTOR = 0.5
const SCAN_TICK_MS = 1000
const FFMPEG_TIMEOUT_MS = 30 * 60 * 1000
const FFPROBE_TIMEOUT_MS = 60_000
const SPAWN_MAX_BUFFER = 16 * 1024 * 1024

const DAY_MS = 86_400_000

const scansInFlight = new Set()
