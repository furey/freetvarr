import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import helmet from 'helmet'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import { doubleCsrf } from 'csrf-csrf'

import { db, getSetting, setSetting } from './db.js'
import { resolveCsrfSecret } from './csrf-secret.js'
import { applyStoredTimeZone, currentTimeZone, isKnownTimeZone, resolveTimeZone, timeZoneFromEnv } from './time-zone.js'
import { matchShowFolder, listShowFolders } from './folder-matcher.js'
import {
  startSync,
  getActiveSyncId,
  getMediaRoot,
  getOneOffRoot,
  getMoviesRoot,
  getRecordingsRoot,
  getTvhRecordingsPath,
  forgetRecordingArtwork,
  rebaseFilePaths,
  resetInterruptedImports,
  matchShow,
  createValidFilename,
} from './sync.js'
import { findArtwork, saveArtwork, shrinkStoredArtwork } from './artwork.js'
import { startScheduler, getSchedulerExpression, getSchedulerNextRun, stopScheduler } from './scheduler.js'
import {
  detectPlexTokenFromPreferences,
  listPlexSections,
  planPlexLibraries,
  createPlexLibraries,
  notifyPlexSectionRefresh,
  discoverLocalPlexServers,
  getPlexPrefsPath,
} from './plex.js'
import {
  testConnection as testTvheadendConnection,
  detectServers as detectTvheadendServers,
  removeRecordings as removeTvhRecordings,
  listFinished,
  resolveConnection,
  listChannels,
  getRecordingStorage,
  getServerVersion as getTvheadendVersion,
  tvhRead,
  tvhWrite,
  verifyLogin as verifyTvheadendLogin,
  TvheadendError,
} from './tvheadend.js'
import {
  applyBootstrap,
  detectFreshInstance,
  planBootstrap,
  suggestLanPrefixes,
  undoBootstrap,
  validateBootstrapInput,
} from './tvheadend-bootstrap.js'
import {
  applyChannelSetup,
  inspectSetup,
  listTransmitters,
  planChannelSetup,
  readTunerAddress,
  saveTunerAddress,
  suggestChannelSetup,
  tunerAddressConfig,
} from './tvheadend-setup.js'
import {
  applyGuideSetup,
  inspectGuide,
  linkChannelsByHand,
  readGuideLinks,
  planGuideSetup,
  suggestGuide,
} from './tvheadend-guide.js'
import { checkRecordingsFolder, checkMediaRoot, compareRecordingPaths } from './path-check.js'
import { applyDefaultFavourites } from './default-favourites.js'
import { countryForTimeZone } from './zone-countries.js'
import {
  getGuideDay,
  searchGuide,
  getRecordingState,
  getChannelImage,
  getProgrammeImage,
  recordProgram,
  cancelProgram,
  recordSeries,
  cancelSeries,
  pauseSeries,
  setChannelPrefs,
  getChannelPrefs,
  getOnNowForPinned,
  getOnNowAll,
  clearGuideCache,
} from './epg.js'
import {
  startManualAdScan,
  comskipIniOverrideExists,
  resetInterruptedScans,
  recoverInterruptedCuts,
} from './commercials.js'
import { snapshotProgress } from './progress.js'
import { getRecordingNow, recordingImageSource } from './recording-now.js'
import {
  LIVE_ROOT,
  LiveTvError,
  liveBufferMinutesFrom,
  createLiveSessions,
  preflightChannel,
  startLiveChannel,
  describeStallFor,
  openUpstreamFor,
} from './live-tv.js'
import { detectLiveEncoder, describeLiveEncoder, DEFAULT_VAAPI_DEVICE } from './live-encoder.js'
import {
  createPlaybackSessions,
  playbackCandidates,
  resolvePlaybackFile,
  probeRecording,
  durationFrom,
  planForFile,
  resumeStartFor,
  startOffsetFor,
  positionFrom,
  view as playbackView,
} from './playback.js'
import { BUILD_HEADER, readBuildId, stampIndexHtml } from './build-id.js'
import { getDoctorReport } from './doctor.js'
import { detectDockerVm } from './docker-host.js'
import { getSeries } from './series.js'
import { listSyncs, syncPageParams } from './sync-history.js'
import { createTvLogin, TvLoginError } from './tv-login.js'
import { transmitterLabel } from './web/transmitter-label.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WEB_ROOT = path.join(__dirname, 'web')
const { version: APP_VERSION } = JSON.parse(await fs.readFile(path.join(__dirname, '..', 'package.json'), 'utf8'))
const BUILD_ID = await readBuildId({ webRoot: WEB_ROOT, version: APP_VERSION })
const STARTUP_TIME_ZONE = await applyStoredTimeZone({ getSetting })
console.log(`[server] time zone ${STARTUP_TIME_ZONE.zone} (${STARTUP_TIME_ZONE.source})`)

const PORT = Number(process.env.PORT || 3733)
const CONFIG_DIR = path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'config', 'state.db'))
const loadCsrfSecret = async () => {
  try {
    const { secret, source, file } = await resolveCsrfSecret({ envSecret: process.env.CSRF_SECRET, configDir: CONFIG_DIR })
    if (source === 'generated') console.log(`[server] generated a CSRF secret in ${file}`)
    if (source === 'env' && secret.length < 32) {
      console.warn(`[server] CSRF_SECRET is only ${secret.length} chars — use at least 32 bytes.`)
    }
    return secret
  } catch (err) {
    console.error(
      `[server] cannot save the CSRF secret in ${CONFIG_DIR} (${err.code || err.message}). `
        + 'Check that the host folder behind CONFIG_PATH is owned by PUID:PGID, or set CSRF_SECRET.',
    )
    process.exit(1)
  }
}
const CSRF_SECRET = await loadCsrfSecret()
const AD_REMOVAL_MODES = ['off', 'detect', 'cut']
const UNIMPORTED_STATUSES = ['failed', 'skipped', 'not_imported']
const LIBRARY_CHOICES = ['include', 'exclude']
const LIVE_TV_MAX_SESSIONS = Math.max(1, Number(process.env.LIVE_TV_MAX_SESSIONS) || 2)
const LIVE_TV_BUFFER_MINUTES = liveBufferMinutesFrom(process.env.LIVE_TV_BUFFER_MINUTES)
const liveEncoderReady = detectLiveEncoder({
  mode: (process.env.LIVE_TV_TRANSCODE || 'auto').trim().toLowerCase(),
  device: process.env.LIVE_TV_VAAPI_DEVICE || DEFAULT_VAAPI_DEVICE,
}).then((encoder) => {
  console.log(`[live] video ${describeLiveEncoder(encoder)}`)
  return encoder
})
const LIVE_REAPER_MS = 5_000
const GUIDE_IMPORT_SETTLE_MS = 2 * 60_000

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 'loopback')

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'self'"],
        // Vue's in-browser template compiler uses Function() — needs 'unsafe-eval'.
        // To drop it, move to a build step (Vite) that pre-compiles templates.
        'script-src': ["'self'", "'unsafe-eval'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:'],
        'media-src': ["'self'", 'blob:'],
        'worker-src': ["'self'", 'blob:'],
        'connect-src': ["'self'", 'https://api.github.com'],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    // Disabled because freetvarr serves plain HTTP on the LAN. Enabling HSTS would
    // tell browsers to refuse HTTP for max-age=1y. Re-enable when fronted by TLS.
    hsts: false,
  }),
)

app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow')
  next()
})

app.use('/api', (req, res, next) => {
  res.setHeader(BUILD_HEADER, BUILD_ID)
  next()
})

app.use(compression())
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser(CSRF_SECRET))

const { doubleCsrfProtection, generateToken } = doubleCsrf({
  getSecret: () => CSRF_SECRET,
  // Authless LAN service — no per-user session. req.ip flaps under Docker bridge
  // networking (different gateway between GET that mints and POST that validates),
  // which breaks CSRF in browsers while loopback curl still works.
  getSessionIdentifier: () => 'freetvarr',
  // `__Host-` prefix requires Secure (HTTPS). LAN deploy is HTTP-only for now.
  // Switch to `__Host-freetvarr.x-csrf` + secure:true when fronted by TLS.
  cookieName: 'freetvarr.x-csrf',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'strict',
    secure: false,
    path: '/',
  },
  size: 32,
})

const syncLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
})

app.get('/healthz', (req, res) => res.json({ ok: true }))

const readTvheadendVersion = async () => {
  try {
    return (await getTvheadendVersion()) || null
  } catch {
    return null
  }
}

app.get('/api/version', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  const about = { version: APP_VERSION, build: BUILD_ID, node: process.version }
  if (req.query.tvheadend !== '1') return res.json(about)
  res.json({ ...about, tvheadend: await readTvheadendVersion() })
})

app.get('/api/csrf-token', (req, res) => {
  // overwrite=true forces a fresh token. Without it, csrf-csrf tries to reuse
  // any existing cookie value and throws 403 if validation fails (e.g. server
  // restarted with a new CSRF_SECRET, stale browser cookie).
  const token = generateToken(req, res, true)
  res.json({ token })
})

app.post('/api/sync', syncLimiter, doubleCsrfProtection, async (req, res) => {
  try {
    const showIdRaw = req.body?.show_id
    const showId = showIdRaw == null || showIdRaw === '' ? null : Number(showIdRaw)
    if (showId != null && !Number.isInteger(showId)) {
      return res.status(400).json({ error: 'show_id must be an integer' })
    }
    const result = await startSync({
      trigger: showId == null ? 'manual' : 'manual-single',
      showId,
    })
    res.status(result.alreadyRunning ? 200 : 202).json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/sync-status', (req, res) => {
  res.json({
    activeSyncId: getActiveSyncId(),
    cron: getSchedulerExpression(),
    nextRunAt: getSchedulerNextRun(),
  })
})

app.get('/api/syncs', async (req, res) => {
  const { syncs, total } = await listSyncs({ db, ...syncPageParams(req.query) })
  res.json({
    syncs: syncs.map((r) => ({ ...r, summary: safeJson(r.summary_json) })),
    total,
  })
})

app.delete('/api/syncs', doubleCsrfProtection, async (req, res) => {
  const activeId = getActiveSyncId()
  const q = db('syncs')
  if (activeId) q.whereNot({ id: activeId })
  const n = await q.delete()
  res.json({ ok: true, deleted: n })
})

app.delete('/api/syncs/:id', doubleCsrfProtection, async (req, res) => {
  const id = Number(req.params.id)
  if (id === getActiveSyncId()) {
    return res.status(409).json({ error: 'cannot delete an active sync' })
  }
  const n = await db('syncs').where({ id }).delete()
  if (n === 0) return res.status(404).json({ error: 'not found' })
  res.json({ ok: true })
})

app.post(
  '/api/recordings/:recording_id/delete-from-tvh',
  syncLimiter,
  doubleCsrfProtection,
  async (req, res) => {
    const recordingId = req.params.recording_id
    const row = await db('recordings').where({ recording_id: recordingId }).first()
    if (!row) return res.status(404).json({ error: 'recording not found' })
    if (row.deleted_from_tvh_at) {
      return res.status(409).json({ error: 'recording already marked removed from TVHeadend' })
    }
    try {
      await removeTvhRecordings({ recordingIds: [recordingId] })
      const now = new Date().toISOString()
      await db('recordings')
        .where({ recording_id: recordingId })
        .update({ deleted_from_tvh_at: now })
      res.json({ ok: true, deleted_from_tvh_at: now })
    } catch (err) {
      const stage = err instanceof TvheadendError ? err.stage : 'unknown'
      const code = err instanceof TvheadendError ? err.code : undefined
      console.error(`[tvheadend] delete-from-tvh failed for ${recordingId} (stage ${stage}): ${err.message}`)
      res.status(502).json({ ok: false, error: err.message, stage, code })
    }
  },
)

app.post(
  '/api/recordings/:recording_id/ad-scan',
  syncLimiter,
  doubleCsrfProtection,
  async (req, res) => {
    const recordingId = req.params.recording_id
    const row = await db('recordings').where({ recording_id: recordingId }).first()
    if (!row) return res.status(404).json({ error: 'recording not found' })
    if (row.status !== 'done') {
      return res.status(409).json({ error: 'recording is not imported' })
    }
    if (!row.file_path) return res.status(409).json({ error: 'recording has no file path' })
    if (!(await isLibraryFilePresent(row.file_path))) {
      return res.status(409).json({
        error: 'the library file is gone. Something outside Freetvarr replaced or removed it.',
      })
    }
    const show = row.show_id
      ? await db('shows').where({ id: row.show_id }).first()
      : null
    const showMode = show?.ad_removal || 'off'
    const mode = showMode === 'off' ? 'detect' : showMode
    const started = startManualAdScan({
      filePath: row.file_path,
      mode,
      recordingId,
    })
    if (!started) return res.status(409).json({ error: 'an ad scan is already running' })
    res.status(202).json({ started: true, mode })
  },
)

app.delete('/api/recordings', doubleCsrfProtection, async (req, res) => {
  if (req.query.deleted !== 'true') {
    return res.status(400).json({ error: 'refusing bulk delete without ?deleted=true' })
  }
  const ids = await db('recordings')
    .whereNotNull('deleted_from_tvh_at')
    .whereNull('purged_at')
    .pluck('recording_id')
  if (ids.length) {
    await db('recordings')
      .whereIn('recording_id', ids)
      .update({ purged_at: new Date().toISOString() })
  }
  res.json({ ok: true, deleted: ids.length, ids })
})

app.post('/api/recordings/restore', doubleCsrfProtection, async (req, res) => {
  const ids = req.body?.ids
  const isIdList = Array.isArray(ids) && ids.length > 0 && ids.every((id) => typeof id === 'string')
  if (!isIdList) return res.status(400).json({ error: 'ids must be a non-empty list of recording ids' })
  const restored = await db('recordings')
    .whereIn('recording_id', ids)
    .whereNotNull('deleted_from_tvh_at')
    .whereNotNull('purged_at')
    .update({ purged_at: null })
  res.json({ ok: true, restored })
})

app.delete('/api/recordings/:recording_id', doubleCsrfProtection, async (req, res) => {
  const recordingId = req.params.recording_id
  const row = await db('recordings').where({ recording_id: recordingId }).first()
  if (!row) return res.status(404).json({ error: 'recording not found' })
  const isUnimported = UNIMPORTED_STATUSES.includes(row.status)
  if (!row.deleted_from_tvh_at && !isUnimported) {
    return res.status(409).json({ error: 'recording still in TVHeadend. Remove it there first.' })
  }
  await db('recordings')
    .where({ recording_id: recordingId })
    .update({ purged_at: new Date().toISOString() })
  await forgetRecordingArtwork(recordingId)
  res.json({ ok: true })
})

app.post('/api/recordings/:recording_id/library', syncLimiter, doubleCsrfProtection, async (req, res) => {
  const recordingId = req.params.recording_id
  const choice = req.body?.choice
  if (!LIBRARY_CHOICES.includes(choice)) {
    return res.status(400).json({ error: `choice must be one of ${LIBRARY_CHOICES.join(', ')}` })
  }
  const row = await db('recordings').where({ recording_id: recordingId }).first()
  if (!row) return res.status(404).json({ error: 'recording not found' })
  if (['done', 'importing'].includes(row.status)) {
    return res.status(409).json({ error: 'recording is already in the library' })
  }
  await db('recordings').where({ recording_id: recordingId }).update({
    library_choice: choice,
    ...(choice === 'include' ? { status: 'pending', error: null } : {}),
  })
  const sync = choice === 'include' ? await startSync({ trigger: 'manual:import' }) : null
  res.json({ ok: true, choice, syncId: sync?.syncId ?? null })
})

app.get('/api/recordings/:recording_id/image', async (req, res) => {
  const image = await findArtwork({ kind: 'recording', id: req.params.recording_id }).catch(() => null)
  if (!image) return res.status(404).end()
  res.setHeader('Content-Type', image.contentType)
  res.setHeader('Cache-Control', 'public, max-age=86400')
  res.send(image.body)
})

app.get('/api/recordings', async (req, res) => {
  const SORT_COLUMNS = {
    imported_at: 'recordings.imported_at',
    size: 'recordings.size',
    status: 'recordings.status',
    title: 'recordings.title',
    show_pattern: 'shows.show_pattern',
  }
  const STATUS_VALUES = ['done', 'partial', 'failed', 'skipped', 'importing', 'not_imported', 'pending']
  const SINCE_INTERVALS = {
    '1h':  '-1 hours',
    '24h': '-24 hours',
    '7d':  '-7 days',
    '30d': '-30 days',
    '90d': '-90 days',
  }
  const DELETED_FILTERS = {
    on_tvh: 'recordings.deleted_from_tvh_at IS NULL',
    deleted:  'recordings.deleted_from_tvh_at IS NOT NULL',
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || 1)
  const pageSize = Math.min(200, Math.max(10, parseInt(req.query.pageSize, 10) || 50))
  const sortColumn = SORT_COLUMNS[req.query.sort] || SORT_COLUMNS.imported_at
  const sortDir = req.query.dir === 'asc' ? 'asc' : 'desc'
  const statusFilter = STATUS_VALUES.includes(req.query.status) ? req.query.status : null
  const showIdRaw = req.query.show_id ? Number(req.query.show_id) : null
  const showIdFilter = Number.isInteger(showIdRaw) ? showIdRaw : null
  const sinceInterval = SINCE_INTERVALS[req.query.since] || null
  const deletedClause = DELETED_FILTERS[req.query.deleted] || null
  const groupTombstonesLast = req.query.deleted !== 'deleted'

  const applyFilters = (q) => {
    q.whereNull('recordings.purged_at')
    if (statusFilter) {
      q.where('recordings.status', statusFilter)
    }
    if (showIdFilter != null) q.where('recordings.show_id', showIdFilter)
    if (sinceInterval) {
      q.where('recordings.imported_at', '>=', db.raw(`datetime('now', '${sinceInterval}')`))
    }
    if (deletedClause) q.whereRaw(deletedClause)
    return q
  }

  const totalQuery = applyFilters(
    db('recordings').leftJoin('shows', 'recordings.show_id', 'shows.id'),
  ).count({ count: 'recordings.recording_id' }).first()

  const rowsQuery = applyFilters(
    db('recordings').leftJoin('shows', 'recordings.show_id', 'shows.id'),
  )
    .select(
      'recordings.*',
      'shows.show_pattern as show_pattern',
      'shows.dest_folder as show_dest_folder',
    )
  if (groupTombstonesLast) {
    rowsQuery.orderByRaw('(recordings.deleted_from_tvh_at IS NULL) DESC')
  }
  rowsQuery
    .orderBy(sortColumn, sortDir)
    .orderBy('recordings.season', 'desc')
    .orderBy('recordings.episode', 'desc')
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const clearableQuery = db('recordings')
    .whereNotNull('deleted_from_tvh_at')
    .whereNull('purged_at')
    .count({ count: 'recording_id' })
    .first()

  const [totalRow, rows, clearableRow] = await Promise.all([totalQuery, rowsQuery, clearableQuery])
  const progress = snapshotProgress(rows.map((r) => r.recording_id))
  const sources = await playbackSourceResolver()
  const [playable, libraryFilePresent] = await Promise.all([
    Promise.all(rows.map(async (r) => Boolean(await sources(r)))),
    Promise.all(rows.map((r) => isLibraryFilePresent(r.file_path))),
  ])
  res.json({
    recordings: rows.map((r, i) => ({
      ...r,
      progress: progress[r.recording_id] ?? null,
      playable: playable[i],
      library_file_present: libraryFilePresent[i],
    })),
    total: Number(totalRow?.count) || 0,
    clearable: Number(clearableRow?.count) || 0,
    page,
    pageSize,
  })
})

const epgLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
})

const epgError = (res, err, context) => {
  const stage = err instanceof TvheadendError ? err.stage : 'unknown'
  const code = err instanceof TvheadendError ? err.code : undefined
  console.error(`[epg] ${context} failed (stage ${stage}): ${err.message}`)
  res.status(502).json({ ok: false, error: err.message, stage, code })
}

app.get('/api/epg/guide', async (req, res) => {
  const day = Number(req.query.day ?? 0)
  if (!Number.isInteger(day) || day < 0 || day > 6) {
    return res.status(400).json({ error: 'day must be an integer 0–6' })
  }
  try {
    res.json(await getGuideDay({ day }))
  } catch (err) {
    epgError(res, err, 'guide')
  }
})

app.get('/api/epg/search', async (req, res) => {
  try {
    res.json(await searchGuide({ q: String(req.query.q || '') }))
  } catch (err) {
    epgError(res, err, 'search')
  }
})

app.get('/api/epg/state', async (req, res) => {
  try {
    res.json(await getRecordingState({ fresh: req.query.fresh === '1' }))
  } catch (err) {
    epgError(res, err, 'state')
  }
})

const serveImage = (loadImage) => async (req, res) => {
  try {
    const image = await loadImage(req.params)
    if (!image) return res.status(404).end()
    res.setHeader('Content-Type', image.contentType)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.send(image.body)
  } catch {
    res.status(404).end()
  }
}

app.get('/api/epg/logo/:channelId', serveImage(({ channelId }) => getChannelImage({ channelId })))
app.get('/api/epg/image/:eventId', serveImage(({ eventId }) =>
  getProgrammeImage({ eventId, fallbackSource: recordingImageSource(eventId) })))

app.post('/api/epg/record', epgLimiter, doubleCsrfProtection, async (req, res) => {
  const { channel_id, program_id, epg_program_id, lead_time, lag_time, add_to_library } = req.body || {}
  if (channel_id == null || program_id == null || epg_program_id == null) {
    return res.status(400).json({ error: 'channel_id, program_id and epg_program_id are required' })
  }
  try {
    const result = await recordProgram({
      channelId: channel_id,
      programId: program_id,
      epgProgramId: epg_program_id,
      ...(lead_time != null ? { leadTime: Number(lead_time) } : {}),
      ...(lag_time != null ? { lagTime: Number(lag_time) } : {}),
      addToLibrary: add_to_library !== false,
    })
    saveArtworkFromGuide({ recordingId: result.uuid, eventId: program_id })
    res.json({ ok: true, ...result })
  } catch (err) {
    epgError(res, err, 'record')
  }
})

app.post('/api/epg/cancel', epgLimiter, doubleCsrfProtection, async (req, res) => {
  const { program_id } = req.body || {}
  if (program_id == null) return res.status(400).json({ error: 'program_id is required' })
  try {
    res.json({ ok: true, ...(await cancelProgram({ programId: program_id })) })
  } catch (err) {
    epgError(res, err, 'cancel')
  }
})

app.post('/api/epg/record-series', epgLimiter, doubleCsrfProtection, async (req, res) => {
  const {
    series_link, channel_id, epg_program_id, program_id,
    lead_time, lag_time, episodes_to_keep, add_show_rule,
  } = req.body || {}
  if (series_link == null || channel_id == null || program_id == null || epg_program_id == null) {
    return res.status(400).json({
      error: 'series_link, channel_id, program_id and epg_program_id are required',
    })
  }
  try {
    const result = await recordSeries({
      seriesLink: series_link,
      channelId: channel_id,
      epgProgramId: epg_program_id,
      programId: program_id,
      ...(lead_time != null ? { leadTime: Number(lead_time) } : {}),
      ...(lag_time != null ? { lagTime: Number(lag_time) } : {}),
      ...(episodes_to_keep != null ? { episodesToKeep: Number(episodes_to_keep) } : {}),
    })
    const showRule = add_show_rule === false ? null : await ensureShowRule(result.title)
    res.json({ ok: true, ...result, showRule })
  } catch (err) {
    epgError(res, err, 'record-series')
  }
})

const saveArtworkFromGuide = async ({ recordingId, eventId }) => {
  const image = await getProgrammeImage({ eventId }).catch(() => null)
  if (image) await saveArtwork({ kind: 'recording', id: recordingId, image }).catch(() => null)
}

const ensureShowRule = async (title) => {
  const shows = await db('shows').where({ enabled: true })
  const existing = matchShow(shows, title)
  if (existing) return { created: false, show_pattern: existing.show_pattern, dest_folder: existing.dest_folder }
  const folders = await listShowFolders(await getMediaRoot()).catch(() => [])
  const rule = {
    show_pattern: title.trim(),
    dest_folder: existingFolderFor({ title, folders }) || createValidFilename(title) || 'Recordings',
  }
  await db('shows').insert(rule)
  return { created: true, ...rule }
}

const existingFolderFor = ({ title, folders }) => {
  const wanted = createValidFilename(title).toLowerCase()
  return folders.find((f) => f.toLowerCase() === wanted)
    || folders.find((f) => f.toLowerCase().startsWith(`${wanted} (`))
}

app.post('/api/epg/cancel-series', epgLimiter, doubleCsrfProtection, async (req, res) => {
  const { program_id, series_link_id } = req.body || {}
  if (series_link_id == null) return res.status(400).json({ error: 'series_link_id is required' })
  try {
    res.json({
      ok: true,
      ...(await cancelSeries({ programId: program_id, seriesLinkId: series_link_id })),
    })
  } catch (err) {
    epgError(res, err, 'cancel-series')
  }
})

app.post('/api/epg/pause-series', epgLimiter, doubleCsrfProtection, async (req, res) => {
  const { series_link_ids, paused } = req.body || {}
  if (!Array.isArray(series_link_ids) || series_link_ids.length === 0) {
    return res.status(400).json({ error: 'series_link_ids must be a non-empty array' })
  }
  if (typeof paused !== 'boolean') return res.status(400).json({ error: 'paused must be true or false' })
  try {
    res.json(await pauseSeries({ seriesLinkIds: series_link_ids, paused }))
  } catch (err) {
    epgError(res, err, 'pause-series')
  }
})

app.put('/api/epg/channel-prefs', doubleCsrfProtection, async (req, res) => {
  const { pinned_ids, hidden_ids, sort, hide_sd_simulcasts } = req.body || {}
  if (pinned_ids != null && !Array.isArray(pinned_ids)) {
    return res.status(400).json({ error: 'pinned_ids must be an array' })
  }
  if (hidden_ids != null && !Array.isArray(hidden_ids)) {
    return res.status(400).json({ error: 'hidden_ids must be an array' })
  }
  if (sort != null && !['default', 'number', 'name'].includes(sort)) {
    return res.status(400).json({ error: 'sort must be default, number or name' })
  }
  const prefs = await setChannelPrefs({
    ...(pinned_ids != null ? { pinnedIds: pinned_ids } : {}),
    ...(hidden_ids != null ? { hiddenIds: hidden_ids } : {}),
    ...(sort != null ? { sort } : {}),
    ...(hide_sd_simulcasts != null ? { hideSdSimulcasts: Boolean(hide_sd_simulcasts) } : {}),
  })
  res.json({ ok: true, ...prefs })
})

app.get('/api/epg/now', async (req, res) => {
  try {
    res.json(await (req.query.all === '1' ? getOnNowAll() : getOnNowForPinned()))
  } catch (err) {
    epgError(res, err, 'now')
  }
})

app.get('/api/recording-now', async (req, res) => {
  try {
    res.json(await getRecordingNow())
  } catch (err) {
    epgError(res, err, 'recording-now')
  }
})

const liveSessions = createLiveSessions({
  openUpstream: openUpstreamFor,
  describeStall: describeStallFor,
  maxSessions: LIVE_TV_MAX_SESSIONS,
  streamsElsewhere: () => playbackSessions.labels(),
  bufferMinutes: LIVE_TV_BUFFER_MINUTES,
})

const playbackSessions = createPlaybackSessions({
  maxSessions: LIVE_TV_MAX_SESSIONS,
  streamsElsewhere: () => liveSessions.labels(),
})

const liveLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
})

const liveError = (res, err, context) => {
  if (err instanceof LiveTvError) {
    return res.status(err.status).json({ ok: false, error: err.message, code: err.code, ...err.details })
  }
  epgError(res, err, context)
}

app.post('/api/live', liveLimiter, doubleCsrfProtection, async (req, res) => {
  const channelId = String(req.body?.channel_id || '')
  if (!channelId) return res.status(400).json({ error: 'channel_id is required' })
  try {
    res.json({ ok: true, ...(await startLiveChannel({ channelId, sessions: liveSessions, encoder: await liveEncoderReady })) })
  } catch (err) {
    liveError(res, err, 'live start')
  }
})

app.get('/api/live/preflight', async (req, res) => {
  const channelId = String(req.query.channel || '')
  if (!channelId) return res.status(400).json({ error: 'channel is required' })
  if (req.query.session) liveSessions.touch(String(req.query.session))
  try {
    const [verdict, session] = await Promise.all([
      preflightChannel({ channelId }),
      liveSessions.statusForChannel(channelId),
    ])
    res.json({ ...verdict, session })
  } catch (err) {
    liveError(res, err, 'live preflight')
  }
})

app.get('/api/live/:session/:file', async (req, res) => {
  const { session: sessionId, file } = req.params
  const filePath = liveSessions.fileFor(sessionId, file)
  if (!filePath) return res.status(404).json({ error: 'not found' })
  liveSessions.touch(sessionId)
  const isPlaylist = file === 'index.m3u8'
  if (isPlaylist && !(await liveSessions.waitForPlaylist(sessionId))) {
    return res.status(404).json({ error: 'stream not ready' })
  }
  res.setHeader('Cache-Control', 'no-store')
  if (isPlaylist) {
    const playlist = await liveSessions.playlistFor(sessionId)
    if (playlist == null) return res.status(404).json({ error: 'stream not ready' })
    return res.type('application/vnd.apple.mpegurl').send(playlist)
  }
  res.type('video/mp2t')
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) res.status(404).end()
  })
})

app.post('/api/live/:session/hold', doubleCsrfProtection, async (req, res) => {
  const held = await liveSessions.hold(String(req.params.session))
  res.json({ ok: true, held })
})

app.delete('/api/live/:session', doubleCsrfProtection, async (req, res) => {
  const left = await liveSessions.leave(String(req.params.session))
  res.json({ ok: true, left })
})

const playLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
})

const playPingLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
})

const isLibraryFilePresent = async (filePath) => {
  if (!filePath) return false
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

const playbackSourceResolver = async () => {
  const [tvhRecordingsPath, recordingsRoot, mediaRoot, oneOffRoot, moviesRoot] = await Promise.all([
    getTvhRecordingsPath(),
    getRecordingsRoot(),
    getMediaRoot(),
    getOneOffRoot(),
    getMoviesRoot(),
  ])
  const roots = [mediaRoot, oneOffRoot, moviesRoot, recordingsRoot]
  return (row) => resolvePlaybackFile({
    candidates: playbackCandidates({ row, tvhRecordingsPath, recordingsRoot }),
    roots,
  })
}

const probeCache = new Map()

const probeOnce = async (file) => {
  const { size, mtimeMs } = await fs.stat(file)
  const key = `${file}|${size}|${mtimeMs}`
  if (!probeCache.has(key)) {
    probeCache.clear()
    probeCache.set(key, probeRecording(file))
  }
  return probeCache.get(key).catch((err) => {
    probeCache.delete(key)
    throw err
  })
}

const recordingLabel = (row) => `"${[row.title, row.episode_title].filter(Boolean).join(': ')}"`

app.post('/api/recordings/:recording_id/play', playLimiter, doubleCsrfProtection, async (req, res) => {
  const row = await db('recordings').where({ recording_id: req.params.recording_id }).first()
  if (!row) return res.status(404).json({ error: 'recording not found' })
  const file = await (await playbackSourceResolver())(row)
  if (!file) return res.status(410).json({ error: 'The recording file is not on disk.', code: 'missing' })
  try {
    const probe = await probeOnce(file)
    const duration = durationFrom(probe) ?? row.duration_s ?? null
    const resumed = req.body?.offset == null
    const offset = resumed
      ? resumeStartFor({ savedSeconds: row.playback_position_s, durationSeconds: duration })
      : startOffsetFor({ seconds: req.body.offset, duration })
    const plan = planForFile({ probe, encoder: await liveEncoderReady })
    const replace = typeof req.body?.replace === 'string' ? req.body.replace : null
    const session = await playbackSessions.start({
      recordingId: row.recording_id,
      label: recordingLabel(row),
      file,
      offset,
      duration,
      plan,
      replace,
    })
    if (session.status === 'ended') {
      return res.status(500).json({ error: `ffmpeg failed: ${session.reason?.detail || 'unknown error'}`, code: 'ffmpeg' })
    }
    res.json({ ok: true, session: playbackView(session), resumed: resumed && offset > 0 })
  } catch (err) {
    liveError(res, err, 'play start')
  }
})

app.post('/api/recordings/:recording_id/position', playPingLimiter, doubleCsrfProtection, async (req, res) => {
  const seconds = positionFrom(req.body?.seconds)
  if (seconds == null) return res.status(400).json({ error: 'seconds must be a number from 0 to 86400' })
  const n = await db('recordings')
    .where({ recording_id: req.params.recording_id })
    .update({ playback_position_s: seconds, played_at: new Date().toISOString() })
  if (n === 0) return res.status(404).json({ error: 'recording not found' })
  res.json({ ok: true, seconds })
})

app.get('/api/play/:session/:file', async (req, res) => {
  const { session: sessionId, file } = req.params
  const filePath = playbackSessions.fileFor(sessionId, file)
  if (!filePath) return res.status(404).json({ error: 'not found' })
  playbackSessions.touch(sessionId)
  res.setHeader('Cache-Control', 'no-store')
  if (file === 'index.m3u8') {
    const playlist = await playbackSessions.waitForPlaylist(sessionId)
    if (playlist == null) return res.status(404).json({ error: 'stream not ready' })
    return res.type('application/vnd.apple.mpegurl').send(playlist)
  }
  res.type('video/mp2t')
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) res.status(404).end()
  })
})

app.post('/api/play/:session/heartbeat', playPingLimiter, doubleCsrfProtection, async (req, res) => {
  const status = await playbackSessions.status(String(req.params.session))
  if (!status) return res.status(404).json({ error: 'session ended', code: 'gone' })
  res.json({ ok: true, session: status })
})

app.delete('/api/play/:session', doubleCsrfProtection, async (req, res) => {
  const stopped = await playbackSessions.stop(String(req.params.session))
  res.json({ ok: true, stopped })
})

const doctorLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
})

app.get('/api/doctor', doctorLimiter, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  try {
    res.json(await getDoctorReport({
      fresh: req.query.fresh === '1',
      deps: { liveEncoder: () => liveEncoderReady },
    }))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/series', async (req, res) => {
  res.json(await getSeries())
})

app.get('/api/shows', async (req, res) => {
  const rows = await db('shows').orderBy('created_at', 'desc')
  res.json({ shows: rows })
})

app.post('/api/shows', doubleCsrfProtection, async (req, res) => {
  const {
    show_pattern,
    dest_folder,
    season_template,
    enabled,
    delete_after_import,
    ad_removal,
  } = req.body || {}
  if (!show_pattern || !dest_folder) {
    return res.status(400).json({ error: 'show_pattern and dest_folder are required' })
  }
  if (ad_removal !== undefined && !AD_REMOVAL_MODES.includes(ad_removal)) {
    return res.status(400).json({ error: `ad_removal must be one of ${AD_REMOVAL_MODES.join(', ')}` })
  }
  for (const key of ['dest_folder', 'season_template']) {
    const value = key === 'dest_folder' ? dest_folder : season_template
    if (value !== undefined && escapesMediaRoot(String(value))) {
      return res.status(400).json({ error: `${key} must stay within the media root (no '..' or leading '/')` })
    }
  }
  const inserted = await db('shows').insert({
    show_pattern: String(show_pattern).trim(),
    dest_folder: String(dest_folder).trim(),
    season_template: season_template ? String(season_template).trim() : 'Season {season}',
    enabled: enabled !== false,
    delete_after_import: delete_after_import === true,
    ad_removal: ad_removal || 'off',
  }).returning('id')
  const row = inserted[0]
  const id = typeof row === 'object' ? row.id : row
  res.status(201).json({ id })
})

app.patch('/api/shows/:id', doubleCsrfProtection, async (req, res) => {
  const id = Number(req.params.id)
  const patch = {}
  for (const key of ['show_pattern', 'dest_folder', 'season_template']) {
    if (req.body?.[key] === undefined) continue
    const value = String(req.body[key]).trim()
    if (key !== 'show_pattern' && escapesMediaRoot(value)) {
      return res.status(400).json({ error: `${key} must stay within the media root (no '..' or leading '/')` })
    }
    patch[key] = value
  }
  if (req.body?.enabled !== undefined) patch.enabled = Boolean(req.body.enabled)
  if (req.body?.delete_after_import !== undefined) {
    patch.delete_after_import = Boolean(req.body.delete_after_import)
  }
  if (req.body?.ad_removal !== undefined) {
    if (!AD_REMOVAL_MODES.includes(req.body.ad_removal)) {
      return res.status(400).json({ error: `ad_removal must be one of ${AD_REMOVAL_MODES.join(', ')}` })
    }
    patch.ad_removal = req.body.ad_removal
  }
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'no fields to update' })
  }
  const n = await db('shows').where({ id }).update(patch)
  if (n === 0) return res.status(404).json({ error: 'not found' })
  res.json({ ok: true })
})

app.delete('/api/shows/:id', doubleCsrfProtection, async (req, res) => {
  const id = Number(req.params.id)
  const n = await db('shows').where({ id }).delete()
  if (n === 0) return res.status(404).json({ error: 'not found' })
  res.json({ ok: true })
})

app.get('/api/folder-suggest', async (req, res) => {
  const show = req.query.show
  if (!show) return res.status(400).json({ error: 'show query param required' })
  try {
    const mediaRoot = await getMediaRoot()
    const match = await matchShowFolder(String(show), { mediaRoot })
    const folders = await listShowFolders(mediaRoot).catch(() => [])
    res.json({ match, folders })
  } catch (err) {
    res.json({ match: null, folders: [], error: err.message })
  }
})

app.post('/api/media-root-test', doubleCsrfProtection, async (req, res) => {
  res.json(await checkMediaRoot(req.body?.path))
})

app.post('/api/recordings-root-test', doubleCsrfProtection, async (req, res) => {
  const result = await checkRecordingsFolder({
    recordingsPath: (req.body?.path || '').trim() || (await getRecordingsRoot()),
    mediaRoot: (req.body?.media_root || '').trim() || (await getMediaRoot()),
  })
  res.json(result)
})

app.post('/api/tvh-recordings-path-check', syncLimiter, doubleCsrfProtection, async (req, res) => {
  try {
    const tvhStorage = await getRecordingStorage()
    res.json({ ok: true, ...compareRecordingPaths({ configured: req.body?.path, tvhStorage }) })
  } catch (err) {
    const status = err instanceof TvheadendError ? 502 : 500
    res.status(status).json({ ok: false, error: err.message })
  }
})

app.post('/api/tvh-shows', syncLimiter, doubleCsrfProtection, async (req, res) => {
  try {
    const conn = await resolveConnection()
    const finished = await listFinished(conn)
    const titles = [...new Set(finished.map((e) => e.name).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'en-AU', { sensitivity: 'base' }))
    res.json({ shows: titles.map((title) => ({ id: title, title })) })
  } catch (err) {
    const status = err instanceof TvheadendError ? 502 : 500
    res.status(status).json({ error: err.message })
  }
})

app.get('/api/settings', async (req, res) => {
  const [
    tvhUrl,
    tvhUsername,
    tvhPassword,
    recordingsRoot,
    tvhRecordingsPath,
    syncCron,
    plexUrl,
    plexToken,
    plexTvSectionId,
    deleteAfterPlexRefreshOnly,
    plexPrefsPath,
    mediaRoot,
    oneOffRoot,
    importUnmatched,
    plexOneOffSectionId,
    moviesRoot,
    plexMoviesSectionId,
    adRemovalEnabled,
    adOriginalRetentionDays,
    comskipIniOverride,
    tvhOpenEntryBackup,
    storedTimeZone,
  ] = await Promise.all([
    getSetting('tvh_url'),
    getSetting('tvh_username'),
    getSetting('tvh_password'),
    getRecordingsRoot(),
    getTvhRecordingsPath(),
    getSetting('sync_cron'),
    getSetting('plex_url'),
    getSetting('plex_token'),
    getSetting('plex_tv_section_id'),
    getSetting('delete_after_plex_refresh_only'),
    getPlexPrefsPath(),
    getMediaRoot(),
    getOneOffRoot(),
    getSetting('import_unmatched'),
    getSetting('plex_oneoff_section_id'),
    getMoviesRoot(),
    getSetting('plex_movies_section_id'),
    getSetting('ad_removal_enabled'),
    getSetting('ad_original_retention_days'),
    comskipIniOverrideExists(),
    getSetting(OPEN_ENTRY_BACKUP_KEY),
    getSetting('time_zone'),
  ])
  res.json({
    tvh_url: tvhUrl,
    tvh_username: tvhUsername,
    tvh_password_set: Boolean(tvhPassword),
    tvh_open_entry_backup_set: Boolean(tvhOpenEntryBackup),
    recordings_root: recordingsRoot,
    tvh_recordings_path: tvhRecordingsPath,
    sync_cron: syncCron,
    sync_cron_effective: getSchedulerExpression(),
    // The guide's day boundaries are computed in the server's local zone, so the
    // browser must format times in that same zone. Fall back to the zone the
    // process actually runs in, never a hardcoded UTC.
    tz: currentTimeZone(),
    time_zone: storedTimeZone || '',
    tz_source: resolveTimeZone({ envTz: timeZoneFromEnv(), stored: storedTimeZone, system: currentTimeZone() }).source,
    tz_env: timeZoneFromEnv(),
    plex_url: plexUrl,
    plex_token_set: Boolean(plexToken),
    plex_tv_section_id: plexTvSectionId,
    plex_prefs_path: plexPrefsPath,
    media_root: mediaRoot,
    oneoff_root: oneOffRoot,
    import_unmatched: importUnmatched !== 'false',
    plex_oneoff_section_id: plexOneOffSectionId,
    movies_root: moviesRoot,
    plex_movies_section_id: plexMoviesSectionId,
    // Default true: don't remove from TVHeadend unless Plex confirmed the file is in
    // its library. Safer baseline.
    delete_after_plex_refresh_only: deleteAfterPlexRefreshOnly == null
      ? true
      : deleteAfterPlexRefreshOnly !== 'false',
    // Default false: ad removal is opt-in.
    ad_removal_enabled: adRemovalEnabled === 'true',
    ad_original_retention_days: adOriginalRetentionDays || '7',
    comskip_ini_override: comskipIniOverride,
  })
})

app.post('/api/settings', doubleCsrfProtection, async (req, res) => {
  const body = req.body || {}
  const timeZone = body.time_zone === undefined ? undefined : String(body.time_zone).trim()
  if (timeZone !== undefined && !isKnownTimeZone(timeZone)) {
    return res.status(400).json({ error: `Unknown time zone "${timeZone}"` })
  }
  const writeString = async (key, value, { trim = false } = {}) => {
    if (value === undefined) return
    await setSetting(key, trim ? String(value).trim() : String(value))
  }
  await writeString('tvh_url', body.tvh_url, { trim: true })
  await writeString('tvh_username', body.tvh_username, { trim: true })
  if (body.tvh_password) await setSetting('tvh_password', String(body.tvh_password))
  await writeString('recordings_root', body.recordings_root, { trim: true })
  await writeString('tvh_recordings_path', body.tvh_recordings_path, { trim: true })
  await writeString('plex_url', body.plex_url, { trim: true })
  // Empty token/pin preserves the stored value.
  if (body.plex_token) await setSetting('plex_token', String(body.plex_token))
  await writeString('plex_tv_section_id', body.plex_tv_section_id, { trim: true })
  await writeString('plex_prefs_path', body.plex_prefs_path, { trim: true })
  await writeString('media_root', body.media_root, { trim: true })
  await writeString('oneoff_root', body.oneoff_root, { trim: true })
  await writeString('plex_oneoff_section_id', body.plex_oneoff_section_id, { trim: true })
  await writeString('movies_root', body.movies_root, { trim: true })
  await writeString('plex_movies_section_id', body.plex_movies_section_id, { trim: true })
  if (body.import_unmatched !== undefined) {
    await setSetting('import_unmatched', body.import_unmatched ? 'true' : 'false')
  }
  if (body.delete_after_plex_refresh_only !== undefined) {
    await setSetting(
      'delete_after_plex_refresh_only',
      body.delete_after_plex_refresh_only ? 'true' : 'false',
    )
  }
  if (body.ad_removal_enabled !== undefined) {
    await setSetting('ad_removal_enabled', body.ad_removal_enabled ? 'true' : 'false')
  }
  if (body.ad_original_retention_days !== undefined) {
    const days = Number(body.ad_original_retention_days)
    if (!Number.isInteger(days) || days <= 0) {
      return res.status(400).json({ error: 'ad_original_retention_days must be a positive integer' })
    }
    await setSetting('ad_original_retention_days', String(days))
  }
  if (timeZone !== undefined) {
    await setSetting('time_zone', timeZone)
    process.env.TZ = timeZone
    clearGuideCache()
  }
  if (body.sync_cron !== undefined) await setSetting('sync_cron', String(body.sync_cron))
  if (body.sync_cron !== undefined || timeZone !== undefined) await startScheduler()
  await rebaseFilePaths()
  res.json({ ok: true })
})

app.post('/api/tvh-test', syncLimiter, doubleCsrfProtection, async (req, res) => {
  const { tvh_url, tvh_username, tvh_password } = req.body || {}
  try {
    const result = await testTvheadendConnection({
      url: tvh_url !== undefined ? String(tvh_url).trim() : undefined,
      username: tvh_username !== undefined ? String(tvh_username).trim() : undefined,
      password: tvh_password ? String(tvh_password) : undefined,
      persist: true,
    })
    res.json(result)
  } catch (err) {
    const stage = err instanceof TvheadendError ? err.stage : 'unknown'
    const code = err instanceof TvheadendError ? err.code : undefined
    res.status(502).json({ ok: false, error: err.message, stage, code })
  }
})

app.post('/api/tvh-detect', syncLimiter, doubleCsrfProtection, async (req, res) => {
  const result = await detectTvheadendServers({
    hintAddresses: [req.hostname, req.socket.localAddress],
  })
  res.status(result.ok ? 200 : 502).json(result)
})

const bootstrapLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
})

const bootstrapHttp = { get: tvhRead, post: tvhWrite, verifyLogin: verifyTvheadendLogin }
const OPEN_ENTRY_BACKUP_KEY = 'tvh_open_entry_backup'
let bootstrapRun = null

const bootstrapUrlFrom = async (raw) => {
  const url = String(raw ?? (await getSetting('tvh_url')) ?? '').trim().replace(/\/+$/, '')
  return /^https?:\/\/[^\s/]+/i.test(url) ? url : null
}

const bootstrapStore = {
  saveConnection: async ({ url, username, password }) => {
    await setSetting('tvh_url', url)
    await setSetting('tvh_username', username)
    await setSetting('tvh_password', password)
  },
  saveOpenEntryBackup: (backup) => setSetting(OPEN_ENTRY_BACKUP_KEY, JSON.stringify(backup)),
}

const readOpenEntryBackup = async () => {
  const raw = await getSetting(OPEN_ENTRY_BACKUP_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const bootstrapStatusLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
})

app.get('/api/tvh-bootstrap/status', bootstrapStatusLimiter, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  const url = await bootstrapUrlFrom(req.query.url)
  if (!url) return res.status(400).json({ ok: false, error: 'Enter the TVHeadend URL first, like http://192.168.1.10:9981.' })
  const suggestedPrefixes = suggestLanPrefixes()
  try {
    const status = await detectFreshInstance({ http: bootstrapHttp, url })
    res.json({
      ok: true,
      url,
      fresh: status.fresh,
      reason: status.reason,
      accessEntries: status.accessEntries,
      suggestedPrefixes,
      steps: planBootstrap({ lanPrefixes: suggestedPrefixes, adminUsername: 'admin' }).steps,
      undoAvailable: Boolean(await readOpenEntryBackup()),
    })
  } catch (err) {
    res.status(502).json({ ok: false, error: `Freetvarr could not reach TVHeadend at ${url}.` })
  }
})

app.get('/api/tvh-bootstrap/progress', (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.json({ running: Boolean(bootstrapRun?.running), steps: bootstrapRun?.steps || [] })
})

app.post('/api/tvh-bootstrap/apply', bootstrapLimiter, doubleCsrfProtection, async (req, res) => {
  const body = req.body || {}
  const url = await bootstrapUrlFrom(body.url)
  if (!url) return res.status(400).json({ ok: false, error: 'Enter the TVHeadend URL first, like http://192.168.1.10:9981.' })
  const input = validateBootstrapInput({
    adminUsername: body.admin_username,
    adminPassword: body.admin_password,
    prefixes: body.prefixes,
  })
  if (input.error) return res.status(400).json({ ok: false, error: input.error })
  if (bootstrapRun?.running) return res.status(409).json({ ok: false, error: 'Freetvarr is already securing TVHeadend.' })
  bootstrapRun = { running: true, steps: [] }
  try {
    const result = await applyBootstrap({
      http: bootstrapHttp,
      store: bootstrapStore,
      url,
      adminUsername: input.adminUsername,
      adminPassword: input.adminPassword,
      prefixes: input.prefixes,
      onProgress: (steps) => { bootstrapRun.steps = steps },
    })
    if (result.ok) {
      console.log(`[tvh-bootstrap] secured ${url}: created ${input.adminUsername} and freetvarr, removed the open entry`)
      return res.json(result)
    }
    console.warn(`[tvh-bootstrap] stopped at ${result.failedStep} for ${url}: ${result.error}`)
    res.status(result.code === 'not-fresh' ? 409 : 502).json({ ...result, ...bootstrapFailure(result) })
  } finally {
    bootstrapRun.running = false
  }
})

app.post('/api/tvh-bootstrap/undo', bootstrapLimiter, doubleCsrfProtection, async (req, res) => {
  const backup = await readOpenEntryBackup()
  if (!backup) return res.status(404).json({ ok: false, error: 'There is no saved open entry to restore.' })
  try {
    const result = await undoBootstrap({ http: bootstrapHttp, conn: await resolveConnection(), backup })
    await db('settings').where({ key: OPEN_ENTRY_BACKUP_KEY }).delete()
    console.log('[tvh-bootstrap] restored the open access entry')
    res.json(result)
  } catch (err) {
    res.status(502).json({ ok: false, error: `TVHeadend did not restore the open entry: ${err.message}` })
  }
})

app.get('/api/tv-login', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.json(await readTvLogin())
})

app.post('/api/tv-login', bootstrapLimiter, doubleCsrfProtection, async (req, res) => {
  try {
    const login = await createTvLogin({
      http: bootstrapHttp,
      conn: await resolveConnection(),
      username: req.body?.username,
      fallbackPrefix: suggestLanPrefixes().join(','),
    })
    await Promise.all(Object.entries(TV_LOGIN_KEYS).map(([field, key]) => setSetting(key, login[field])))
    console.log(`[tv-login] made the watch-only TVHeadend login ${login.username}`)
    res.json({ ok: true, ...login })
  } catch (err) {
    if (err instanceof TvLoginError) return res.status(err.code === 'taken' ? 409 : 400).json({ ok: false, error: err.message, code: err.code })
    res.status(502).json({ ok: false, error: `TVHeadend did not make the TV login: ${err.message}` })
  }
})

const TV_LOGIN_KEYS = { username: 'tv_login_username', password: 'tv_login_password', authCode: 'tv_login_auth_code' }

const readTvLogin = async () => {
  const entries = await Promise.all(Object.entries(TV_LOGIN_KEYS).map(async ([field, key]) => [field, (await getSetting(key)) || '']))
  const login = Object.fromEntries(entries)
  return login.username && login.authCode ? login : {}
}

const bootstrapFailure = ({ failedStep, code, rolledBack, error: raw }) => {
  const error = String(raw).replace(/HTTP (\d+)/g, 'status $1')
  const unchanged = rolledBack ? ' Freetvarr removed the logins it made, so TVHeadend is as it was.' : ''
  const messages = {
    'check-fresh': code === 'not-fresh'
      ? {
        error: 'TVHeadend already has logins.',
        next: 'Enter the login Freetvarr should use instead.',
      }
      : {
        error: `Freetvarr could not reach TVHeadend (${error}).`,
        next: 'Check the TVHeadend URL, then try again.',
      },
    'create-admin': {
      error: `TVHeadend did not create the admin login (${error}).${unchanged}`,
      next: 'Check that TVHeadend is running, then try again.',
    },
    'create-freetvarr': {
      error: `TVHeadend did not create the freetvarr login (${error}).${unchanged}`,
      next: 'Check that TVHeadend is running, then try again.',
    },
    'verify-freetvarr': {
      error: `TVHeadend did not accept the new freetvarr login.${unchanged}`,
      next: 'Make sure the allowed networks include the address of the Freetvarr host, then try again.',
    },
    'verify-admin': {
      error: `TVHeadend did not accept the new admin login.${unchanged}`,
      next: 'Make sure the allowed networks include the address of the Freetvarr host, then try again.',
    },
    'back-up-open-entry': {
      error: `Freetvarr could not keep a copy of the open entry (${error}).${unchanged}`,
      next: 'Try again.',
    },
    'save-connection': {
      error: `Freetvarr could not save its login (${error}).${unchanged}`,
      next: 'Check that the Freetvarr config folder is writable, then try again.',
    },
    'remove-open-entry': {
      error: 'The new logins work, but TVHeadend kept the open entry.',
      next: 'In TVHeadend, delete the Default access entry under Configuration → Users → Access Entries.',
    },
    'confirm-locked': {
      error: 'The open entry is gone, but TVHeadend still answers without a login.',
      next: 'In TVHeadend, look under Configuration → Users → Access Entries for another entry with username *.',
    },
  }
  return messages[failedStep] || { error, next: 'Try again.' }
}

const setupHttp = { get: tvhRead, post: tvhWrite }
let setupRun = null

const readChannelSetup = async () => {
  const conn = await resolveConnection()
  const inspection = await inspectSetup({ http: setupHttp, conn })
  const transmitters = inspection.deliverySystem
    ? await listTransmitters({ http: setupHttp, conn, scanType: inspection.deliverySystem.scanType })
    : []
  const suggestion = suggestChannelSetup({ inspection, transmitters, timeZone: currentTimeZone() })
  return { conn, inspection, transmitters, suggestion }
}

app.get('/api/tvh-setup/status', bootstrapStatusLimiter, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const { conn, inspection, transmitters, suggestion } = await readChannelSetup()
    res.json({
      ok: true,
      suggestion,
      tuners: inspection.tuners,
      networks: inspection.compatibleNetworks,
      channels: inspection.channels,
      recordingNow: inspection.recordingNow,
      transmitters,
      dockerVm: detectDockerVm(),
      tunerAddress: inspection.tuners.length ? null : await readTunerAddress({ http: setupHttp, conn }).catch(() => null),
      job: setupRun,
    })
  } catch (err) {
    res.status(502).json({ ok: false, error: `Freetvarr could not read TVHeadend (${err.message}).`, job: setupRun })
  }
})

app.get('/api/tvh-setup/progress', (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.json(setupRun || { running: false, steps: [], result: null })
})

app.post('/api/tvh-setup/tuner-address', bootstrapLimiter, doubleCsrfProtection, async (req, res) => {
  const body = req.body || {}
  const config = tunerAddressConfig({ address: body.address, hostAddress: body.host_address, dockerVm: detectDockerVm() })
  if (config.error) return res.status(400).json({ ok: false, error: config.error, field: config.field })
  try {
    const conn = await resolveConnection()
    await saveTunerAddress({ http: setupHttp, conn, node: config.node })
    console.log(`[tvh-setup] TVHeadend now looks for a tuner at ${config.node.hdhomerun_ip}`)
    res.json({ ok: true, address: config.node.hdhomerun_ip })
  } catch (err) {
    res.status(502).json({ ok: false, error: `TVHeadend did not save the tuner address (${err.message}).` })
  }
})

app.post('/api/tvh-setup/apply', bootstrapLimiter, doubleCsrfProtection, async (req, res) => {
  if (setupRun?.running) return res.status(409).json({ ok: false, error: 'Freetvarr is already setting up channels.' })
  const body = req.body || {}
  const tunerIds = Array.isArray(body.tuner_ids) ? body.tuner_ids.map(String) : []
  const networkId = body.network_id ? String(body.network_id) : null
  if (!tunerIds.length) return res.status(400).json({ ok: false, error: 'Choose at least one tuner.' })
  let setup
  try {
    setup = await readChannelSetup()
  } catch (err) {
    return res.status(502).json({ ok: false, error: `Freetvarr could not read TVHeadend (${err.message}).` })
  }
  const transmitter = setup.transmitters.find((t) => t.key === body.transmitter_key) || null
  if (!networkId && !transmitter) return res.status(400).json({ ok: false, error: 'Choose a transmitter.' })
  const steps = planChannelSetup({ networkId }).steps.map((step) => ({ ...step, status: 'pending', detail: null }))
  setupRun = { running: true, steps, result: null }
  res.status(202).json({ ok: true, steps })
  const result = await applyChannelSetup({
    http: setupHttp,
    conn: setup.conn,
    tunerIds,
    networkId,
    transmitter,
    onProgress: (latest) => { setupRun.steps = latest },
  }).catch((err) => ({ ok: false, failedStep: null, code: null, error: err.message, steps: setupRun.steps }))
  const outcome = result.ok
    ? { ...result, favourites: await defaultFavouritesAfterScan(setup.conn) }
    : { ...result, ...setupFailure({ ...result, transmitter }) }
  if (result.ok) console.log(`[tvh-setup] ${result.mapped.ok} channels added on network ${result.networkId}`)
  else console.warn(`[tvh-setup] stopped at ${result.failedStep}: ${result.error}`)
  setupRun = { running: false, steps: result.steps, result: outcome }
})

const defaultFavouritesAfterScan = async (conn) => {
  try {
    const favourites = await applyDefaultFavourites({
      country: countryForTimeZone(currentTimeZone()),
      listChannels: () => listChannels(conn),
      getChannelPrefs,
      setChannelPrefs,
      getSetting,
      setSetting,
    })
    if (favourites.length) console.log(`[tvh-setup] favourites set to ${favourites.map((f) => f.name).join(', ')}`)
    return favourites
  } catch (err) {
    console.warn(`[tvh-setup] could not set the default favourites: ${err.message}`)
    return []
  }
}

const setupFailure = ({ failedStep, code, error: raw, transmitter }) => {
  const error = String(raw).replace(/HTTP (\d+)/g, 'status $1')
  const from = transmitter ? ` from ${transmitterLabel(transmitter.name)}` : ''
  const messages = {
    'no-tuner': {
      error: 'Freetvarr cannot see the chosen tuner now.',
      next: 'Check that the tuner is on and connected, then press TRY AGAIN.',
    },
    'no-signal': {
      error: `The tuner received no channels${from}.`,
      next: 'Check the antenna cable, check that no other app is using the tuner, and pick the transmitter your antenna points at. Then try again.',
    },
    'scan-timeout': {
      error: 'The channel scan did not finish in 30 minutes.',
      next: 'Check the antenna cable and that the tuner is on, then press TRY AGAIN. If live TV or a recording was using every tuner, wait until one is free.',
    },
    'map-empty': {
      error: 'No channels could be added, because none of them played during the check.',
      next: 'Check the antenna cable, then try again.',
    },
    'map-timeout': {
      error: 'Adding channels did not finish in 20 minutes.',
      next: 'Try again when no tuner is in use.',
    },
  }
  const byStep = {
    network: { error: `TVHeadend did not set up the TV network (${error}).`, next: 'Try again.' },
    tuners: { error: `TVHeadend did not turn on the tuners (${error}).`, next: 'Try again.' },
    recording: {
      error: `The channels are ready, but Freetvarr could not check the recording settings (${error}).`,
      next: 'Continue. The Doctor checks the recording settings later.',
    },
  }
  return messages[code] || byStep[failedStep] || { error, next: 'Try again.' }
}

let guideRun = null

const refreshGuideAfterLinks = () => {
  clearGuideCache()
  setTimeout(clearGuideCache, GUIDE_IMPORT_SETTLE_MS).unref()
}

app.get('/api/tvh-guide/status', bootstrapStatusLimiter, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const inspection = await inspectGuide({ http: setupHttp, conn: await resolveConnection() })
    res.json({ ok: true, suggestion: suggestGuide({ inspection, timeZone: currentTimeZone() }), job: guideRun })
  } catch (err) {
    res.status(502).json({ ok: false, error: `Freetvarr could not read TVHeadend (${err.message}).`, job: guideRun })
  }
})

app.get('/api/tvh-guide/progress', (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.json(guideRun || { running: false, steps: [], result: null })
})

app.post('/api/tvh-guide/apply', bootstrapLimiter, doubleCsrfProtection, async (req, res) => {
  if (guideRun?.running) return res.status(409).json({ ok: false, error: 'Freetvarr is already setting up the guide.' })
  const url = String(req.body?.url ?? '').trim()
  if (!/^https?:\/\/[^\s]+$/i.test(url)) {
    return res.status(400).json({ ok: false, error: 'Enter a guide address that starts with http:// or https://.' })
  }
  let conn
  try {
    conn = await resolveConnection()
  } catch (err) {
    return res.status(502).json({ ok: false, error: `Freetvarr could not read TVHeadend (${err.message}).` })
  }
  const steps = planGuideSetup().steps.map((step) => ({ ...step, status: 'pending', detail: null }))
  guideRun = { running: true, steps, result: null }
  res.status(202).json({ ok: true, steps })
  const result = await applyGuideSetup({
    http: setupHttp,
    conn,
    url,
    onProgress: (latest) => { guideRun.steps = latest },
  }).catch((err) => ({ ok: false, failedStep: null, code: null, error: err.message, steps: guideRun.steps }))
  if (result.ok) refreshGuideAfterLinks()
  if (result.ok) console.log(`[tvh-guide] ${url}: ${result.linked} of ${result.total} channels have a guide`)
  else console.warn(`[tvh-guide] stopped at ${result.failedStep}: ${result.error}`)
  guideRun = { running: false, steps: result.steps, result: result.ok ? result : { ...result, ...guideFailure(result) } }
})

app.get('/api/tvh-guide/links', bootstrapStatusLimiter, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const links = await readGuideLinks({ http: setupHttp, conn: await resolveConnection() })
    res.json({ ok: true, ready: links.options.length > 0, ...links })
  } catch (err) {
    res.status(502).json({ ok: false, error: `Freetvarr could not read TVHeadend (${err.message}).` })
  }
})

app.post('/api/tvh-guide/links', bootstrapLimiter, doubleCsrfProtection, async (req, res) => {
  const links = (Array.isArray(req.body?.links) ? req.body.links : [])
    .map((l) => ({ channelId: String(l?.channel_id || ''), guideId: String(l?.guide_id || '') }))
    .filter((l) => l.channelId)
  if (!links.length) return res.json({ ok: true, linked: 0, saved: 0 })
  try {
    const result = await linkChannelsByHand({ http: setupHttp, conn: await resolveConnection(), links })
    if (result.saved) refreshGuideAfterLinks()
    if (guideRun?.result?.ok) {
      const done = new Set(links.filter((l) => l.guideId).map((l) => l.channelId))
      const unmatched = guideRun.result.unmatched.filter((c) => !done.has(c.id))
      guideRun.result = { ...guideRun.result, unmatched, linked: guideRun.result.linked + result.linked }
    }
    res.json({ ok: true, ...result })
  } catch (err) {
    res.status(502).json({ ok: false, error: `TVHeadend did not save the guide links (${err.message}).` })
  }
})

const guideFailure = ({ code, error }) => ({
  'no-grabber': {
    error: 'This TVHeadend cannot download a guide from an address.',
    next: 'Use the guide that comes with the broadcast, or set up a guide in TVHeadend.',
  },
  'feed-unreachable': {
    error: `${error} Your TV still works; recording by show needs the guide.`,
    next: 'Check the guide address, then try again.',
  },
  'feed-empty': {
    error: 'The guide address returned no channels.',
    next: 'Check the guide address, then try again.',
  },
  'download-timeout': {
    error: 'TVHeadend did not finish loading the guide in 5 minutes.',
    next: 'Try again. If it still fails, check that TVHeadend can reach the guide address.',
  },
})[code] || { error, next: 'Try again.' }

app.post('/api/plex-detect-token', doubleCsrfProtection, async (req, res) => {
  const result = await detectPlexTokenFromPreferences()
  res.status(result.ok ? 200 : 502).json(result)
})

app.post('/api/reset', doubleCsrfProtection, async (req, res) => {
  if (getActiveSyncId()) {
    return res.status(409).json({ error: 'Freetvarr cannot reset while a sync is running.' })
  }
  await db.transaction(async (trx) => {
    await trx('recordings').delete()
    await trx('syncs').delete()
    await trx('shows').delete()
    await trx('settings').delete()
  })
  try {
    await startScheduler()
  } catch (err) {
    console.warn('[reset] scheduler restart failed:', err.message)
  }
  res.json({ ok: true })
})

app.post('/api/discover-plex', syncLimiter, doubleCsrfProtection, async (req, res) => {
  try {
    const servers = await discoverLocalPlexServers()
    res.json({ servers })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/plex-sections', doubleCsrfProtection, async (req, res) => {
  const { plex_url, plex_token } = req.body || {}
  try {
    const sections = await listPlexSections({
      url: plex_url ? String(plex_url).trim() : undefined,
      token: plex_token ? String(plex_token) : undefined,
    })
    res.json({ sections })
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

app.post('/api/plex-libraries', doubleCsrfProtection, async (req, res) => {
  try {
    const connection = plexConnectionFrom(req.body)
    const [sections, tv, oneoff, movies] = await Promise.all([
      listPlexSections(connection),
      getMediaRoot(),
      getOneOffRoot(),
      getMoviesRoot(),
    ])
    res.json({ libraries: planPlexLibraries({ sections, roots: { tv, oneoff, movies } }) })
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

app.post('/api/plex-libraries/create', syncLimiter, doubleCsrfProtection, async (req, res) => {
  const libraries = Array.isArray(req.body?.libraries) ? req.body.libraries : []
  if (!libraries.length) return res.status(400).json({ error: 'libraries is required' })
  try {
    const results = await createPlexLibraries({ ...plexConnectionFrom(req.body), libraries })
    const selected = {}
    for (const { kind, key } of results) {
      if (!key || !PLEX_SECTION_SETTINGS[kind]) continue
      await setSetting(PLEX_SECTION_SETTINGS[kind], key)
      selected[kind] = key
    }
    res.json({ results, selected })
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

const plexConnectionFrom = (body = {}) => ({
  url: body.plex_url ? String(body.plex_url).trim() : undefined,
  token: body.plex_token ? String(body.plex_token) : undefined,
})

const PLEX_SECTION_SETTINGS = {
  tv: 'plex_tv_section_id',
  oneoff: 'plex_oneoff_section_id',
  movies: 'plex_movies_section_id',
}

app.post('/api/plex-refresh', doubleCsrfProtection, async (req, res) => {
  const { plex_url, plex_token, plex_tv_section_id } = req.body || {}
  const result = await notifyPlexSectionRefresh({
    url: plex_url ? String(plex_url).trim() : undefined,
    token: plex_token ? String(plex_token) : undefined,
    sectionId: plex_tv_section_id ? String(plex_tv_section_id).trim() : undefined,
  })
  res.json(result)
})

app.get('/vendor/vue.esm-browser.prod.js', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'node_modules', 'vue', 'dist', 'vue.esm-browser.prod.js'))
})

app.get('/vendor/hls.mjs', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'node_modules', 'hls.js', 'dist', 'hls.light.min.mjs'))
})

app.get('/vendor/hls.worker.js', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'node_modules', 'hls.js', 'dist', 'hls.worker.js'))
})

app.get(['/', '/index.html'], async (req, res) => {
  const html = await fs.readFile(path.join(WEB_ROOT, 'index.html'), 'utf8')
  res.setHeader('Cache-Control', 'no-cache')
  res.type('html').send(stampIndexHtml({ html, build: BUILD_ID }))
})

app.use(express.static(WEB_ROOT, { index: false }))

// Terminal error handler: return the message only, never a stack trace, and never
// fall through to Express' development-mode handler (which leaks node_modules paths
// and dependency versions when NODE_ENV isn't 'production').
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err)
  const status = err.statusCode || err.status || 500
  res.status(status).json({ error: err.message || 'internal error' })
})

const safeJson = (s) => {
  if (!s) return null
  try { return JSON.parse(s) } catch { return null }
}

const escapesMediaRoot = (value) =>
  value.startsWith('/')
  || value.startsWith('\\')
  || value.split(/[/\\]+/).includes('..')

const server = app.listen(PORT, async () => {
  console.log(`freetvarr listening on http://0.0.0.0:${PORT}`)
  await fs.rm(LIVE_ROOT, { recursive: true, force: true }).catch(() => {})
  try {
    const moved = await rebaseFilePaths()
    if (moved) console.log(`[sync] moved ${moved} recording path(s) to the new media folders`)
    await resetInterruptedImports()
    shrinkStoredArtwork().then((n) => n && console.log(`[artwork] shrank ${n} saved image(s)`)).catch(() => {})
  } catch (err) {
    console.error('[sync] failed to reconcile recording paths:', err.message)
  }
  try {
    await recoverInterruptedCuts()
    await resetInterruptedScans()
  } catch (err) {
    console.error('[ads] failed to reconcile interrupted ad processing:', err.message)
  }
  try {
    await startScheduler()
  } catch (err) {
    console.error('[scheduler] failed to start:', err.message)
  }
})

const liveReaper = setInterval(() => {
  liveSessions.tick().catch((err) => console.error('[live] reaper failed:', err.message))
  playbackSessions.tick().catch((err) => console.error('[play] reaper failed:', err.message))
}, LIVE_REAPER_MS)

const shutdown = async () => {
  stopScheduler()
  clearInterval(liveReaper)
  await liveSessions.stopAll().catch(() => {})
  await playbackSessions.stopAll().catch(() => {})
  server.close()
  await db.destroy()
  process.exit(0)
}

// Express 4 does not route rejections from async route handlers to the error
// middleware, so a bare `await db(...)` that rejects surfaces here. Log and keep
// the daemon alive rather than letting Node's default terminate it mid-sync.
process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandled rejection:', reason instanceof Error ? reason.stack : reason)
})

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
