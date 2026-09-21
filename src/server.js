import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import { doubleCsrf } from 'csrf-csrf'

import { db, getSetting, setSetting } from './db.js'
import { matchShowFolder, listShowFolders } from './folder-matcher.js'
import { startSync, getActiveSyncId, getMediaRoot, getRecordingsRoot, getTvhRecordingsPath } from './sync.js'
import { startScheduler, getSchedulerExpression, stopScheduler } from './scheduler.js'
import {
  detectPlexTokenFromPreferences,
  listPlexSections,
  notifyPlexSectionRefresh,
  discoverLocalPlexServers,
  getPlexPrefsPath,
} from './plex.js'
import {
  testConnection as testTvheadendConnection,
  detectServers as detectTvheadendServers,
  deleteRecordings as deleteTvhRecordings,
  listFinished,
  resolveConnection,
  TvheadendError,
} from './tvheadend.js'
import {
  getGuideDay,
  searchGuide,
  getRecordingState,
  getChannelImage,
  recordProgram,
  cancelProgram,
  recordSeries,
  cancelSeries,
  setChannelPrefs,
  getOnNowForPinned,
} from './epg.js'
import {
  startManualAdScan,
  comskipIniOverrideExists,
  resetInterruptedScans,
  recoverInterruptedCuts,
} from './commercials.js'
import { snapshotProgress } from './progress.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PORT = Number(process.env.PORT || 8124)
const DEV_CSRF_SECRET = 'dev-only-csrf-secret-set-CSRF_SECRET-in-prod'
const CSRF_SECRET = process.env.CSRF_SECRET || DEV_CSRF_SECRET
const AD_REMOVAL_MODES = ['off', 'detect', 'cut']
const UNIMPORTED_STATUSES = ['failed', 'skipped']

if (process.env.NODE_ENV === 'production' && CSRF_SECRET === DEV_CSRF_SECRET) {
  console.error(
    '[server] CSRF_SECRET must be set when NODE_ENV=production. '
      + 'Generate one with `openssl rand -hex 32`.',
  )
  process.exit(1)
}
if (CSRF_SECRET.length < 32) {
  console.warn(`[server] CSRF_SECRET is only ${CSRF_SECRET.length} chars — use at least 32 bytes.`)
}

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
        'connect-src': ["'self'"],
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
  })
})

app.get('/api/syncs', async (req, res) => {
  const filterClause = SYNC_ACTIVITY_FILTERS[req.query.filter] || null
  const q = db('syncs').orderBy('started_at', 'desc').limit(20)
  if (filterClause) q.whereRaw(filterClause)
  const rows = await q
  res.json({
    syncs: rows.map((r) => ({ ...r, summary: safeJson(r.summary_json) })),
  })
})

const SYNC_ACTIVITY_FILTERS = {
  imports: `json_extract(summary_json, '$.imported') > 0`,
  fails: `status IN ('error', 'partial')`,
  deletes: `json_extract(summary_json, '$.delete.triggered') = 1`,
  empty: `status = 'ok'`
    + ` AND coalesce(json_extract(summary_json, '$.imported'), 0) = 0`
    + ` AND coalesce(json_extract(summary_json, '$.failed'), 0) = 0`
    + ` AND coalesce(json_extract(summary_json, '$.delete.triggered'), 0) = 0`,
  manual: `json_extract(summary_json, '$.trigger') LIKE 'manual%'`,
  cron: `json_extract(summary_json, '$.trigger') = 'cron'`,
}

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
      return res.status(409).json({ error: 'recording already marked deleted from TVHeadend' })
    }
    try {
      await deleteTvhRecordings({ recordingIds: [recordingId] })
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
    try {
      await fs.access(row.file_path)
    } catch {
      return res.status(409).json({ error: 'recording file missing on disk' })
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
  const n = await db('recordings')
    .whereNotNull('deleted_from_tvh_at')
    .whereNull('purged_at')
    .update({ purged_at: new Date().toISOString() })
  res.json({ ok: true, deleted: n })
})

app.delete('/api/recordings/:recording_id', doubleCsrfProtection, async (req, res) => {
  const recordingId = req.params.recording_id
  const row = await db('recordings').where({ recording_id: recordingId }).first()
  if (!row) return res.status(404).json({ error: 'recording not found' })
  const isUnimported = UNIMPORTED_STATUSES.includes(row.status)
  if (!row.deleted_from_tvh_at && !isUnimported) {
    return res.status(409).json({ error: 'recording still in TVHeadend — delete it there first' })
  }
  await db('recordings')
    .where({ recording_id: recordingId })
    .update({ purged_at: new Date().toISOString() })
  res.json({ ok: true })
})

app.get('/api/recordings', async (req, res) => {
  const SORT_COLUMNS = {
    imported_at: 'recordings.imported_at',
    size: 'recordings.size',
    status: 'recordings.status',
    title: 'recordings.title',
    show_pattern: 'shows.show_pattern',
  }
  const STATUS_VALUES = ['done', 'partial', 'failed', 'skipped', 'importing']
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

  const [totalRow, rows] = await Promise.all([totalQuery, rowsQuery])
  const progress = snapshotProgress(rows.map((r) => r.recording_id))
  res.json({
    recordings: rows.map((r) => ({ ...r, progress: progress[r.recording_id] ?? null })),
    total: Number(totalRow?.count) || 0,
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

const serveChannelImage = (kind) => async (req, res) => {
  try {
    const image = await getChannelImage({ channelId: req.params.channelId, kind })
    if (!image) return res.status(404).end()
    res.setHeader('Content-Type', image.contentType)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.send(image.body)
  } catch {
    res.status(404).end()
  }
}

app.get('/api/epg/logo/:channelId', serveChannelImage('logo'))
app.get('/api/epg/artwork/:channelId', serveChannelImage('thumb'))

app.post('/api/epg/record', epgLimiter, doubleCsrfProtection, async (req, res) => {
  const { channel_id, program_id, epg_program_id, lead_time, lag_time } = req.body || {}
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
    })
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
    lead_time, lag_time, episodes_to_keep,
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
    res.json({ ok: true, ...result })
  } catch (err) {
    epgError(res, err, 'record-series')
  }
})

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
    res.json(await getOnNowForPinned())
  } catch (err) {
    epgError(res, err, 'now')
  }
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
  const probePath = (req.body?.path || '').trim()
  if (!probePath) return res.status(400).json({ ok: false, error: 'path is required' })
  if (!probePath.startsWith('/')) {
    return res.status(400).json({ ok: false, error: 'path must be absolute (start with /)' })
  }
  try {
    const stat = await fs.stat(probePath)
    if (!stat.isDirectory()) {
      return res.json({ ok: false, error: `${probePath} exists but is not a directory` })
    }
    await fs.access(probePath, fs.constants.W_OK)
    res.json({ ok: true, path: probePath })
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.json({ ok: false, error: `${probePath} does not exist inside the container` })
    }
    if (err.code === 'EACCES') {
      return res.json({ ok: false, error: `${probePath} is not writable by the container user` })
    }
    res.json({ ok: false, error: `${err.code || 'error'}: ${err.message}` })
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
    adRemovalEnabled,
    adOriginalRetentionDays,
    comskipIniOverride,
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
    getSetting('ad_removal_enabled'),
    getSetting('ad_original_retention_days'),
    comskipIniOverrideExists(),
  ])
  res.json({
    tvh_url: tvhUrl,
    tvh_username: tvhUsername,
    tvh_password_set: Boolean(tvhPassword),
    recordings_root: recordingsRoot,
    tvh_recordings_path: tvhRecordingsPath,
    sync_cron: syncCron,
    sync_cron_effective: getSchedulerExpression(),
    // The guide's day boundaries are computed in the server's local zone, so the
    // browser must format times in that same zone. Fall back to the zone the
    // process actually runs in, never a hardcoded UTC.
    tz: process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    plex_url: plexUrl,
    plex_token_set: Boolean(plexToken),
    plex_tv_section_id: plexTvSectionId,
    plex_prefs_path: plexPrefsPath,
    media_root: mediaRoot,
    // Default true: don't delete from TVHeadend unless Plex confirmed the file is in
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
  if (body.sync_cron !== undefined) {
    await setSetting('sync_cron', String(body.sync_cron))
    await startScheduler()
  }
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
  const result = await detectTvheadendServers({ hintAddress: req.socket.localAddress })
  res.status(result.ok ? 200 : 502).json(result)
})

app.post('/api/plex-detect-token', doubleCsrfProtection, async (req, res) => {
  const result = await detectPlexTokenFromPreferences()
  res.status(result.ok ? 200 : 502).json(result)
})

app.post('/api/nuke-state', doubleCsrfProtection, async (req, res) => {
  if (getActiveSyncId()) {
    return res.status(409).json({ error: 'cannot nuke while a sync is running' })
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
    console.warn('[nuke] scheduler restart failed:', err.message)
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

app.use(express.static(path.join(__dirname, 'web')))

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'web', 'index.html'))
})

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

const shutdown = async () => {
  stopScheduler()
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
