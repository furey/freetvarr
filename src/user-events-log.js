import { db, getSetting, setSetting } from './db.js'
import { getGuideSnapshot } from './epg.js'
import { mergeGuidePrograms, savedProgramFor } from './guide-history.js'
import { listAutorecs, resolveConnection } from './tvheadend.js'
import { createEventWriter } from './user-event-writer.js'
import { createWatchTracker } from './watch-tracker.js'
import {
  VIEWING_HISTORY_KEY,
  backfillEventsOf,
  eventRowOf,
  feedbackEventsFrom,
  positionPingOf,
  pruneCutoffOf,
  routeEventsOf,
  routeOf,
  seriesBackfillEventsOf,
  viewingHistoryEnabledFrom,
} from './user-events.js'

const passThrough = (req, res, next) => next()

export const BACKFILL_KEY = 'user_events_backfilled_at'
export const SERIES_BACKFILL_KEY = 'user_events_series_backfilled_at'

export const mountUserEvents = ({ app, csrf, limiter = passThrough }) => {
  app.get('/api/events/settings', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const [enabled, summary] = await Promise.all([isViewingHistoryEnabled(), historySummary()])
    res.json({ viewing_history_enabled: enabled, ...summary })
  })

  app.put('/api/events/settings', limiter, csrf, async (req, res) => {
    const enabled = req.body?.viewing_history_enabled
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'viewing_history_enabled must be true or false' })
    }
    await setViewingHistoryEnabled(enabled)
    res.json({ ok: true, viewing_history_enabled: enabled })
  })

  app.post('/api/events/feedback', limiter, csrf, (req, res) => {
    const { events, error } = feedbackEventsFrom(req.body)
    if (error) return res.status(400).json({ error })
    const logged = events.filter((event) => writer.log(event)).length
    res.status(202).json({ ok: true, logged })
  })

  app.delete('/api/events', limiter, csrf, async (req, res) => {
    try {
      writer.discard()
      await writer.flush()
      const deleted = await db('user_events').delete()
      await markBackfilled()
      res.json({ ok: true, deleted })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })
}

export const observeUserEvents = (req, res, next) => {
  const ping = positionPingOf({ method: req.method, path: req.path, body: req.body })
  const route = ping ? null : routeOf({ method: req.method, path: req.path })
  if ((!ping && !route) || !writer.isEnabled()) return next()
  captureJson(res)
  beforeContextFor({ route, path: req.path })
    .catch(() => ({}))
    .then((before) => {
      res.once('finish', () => {
        if (res.statusCode >= 300) return
        if (ping) return tracker.positionSaved(ping)
        logRouteEvents({ req, res, route, before }).catch((err) => console.warn(`[events] ${err.message}`))
      })
      next()
    })
}

export const liveSessionHooks = () => ({ onStart: tracker.liveStarted, onEnd: tracker.liveEnded })

export const playbackSessionHooks = () => ({ onStart: tracker.playStarted, onEnd: tracker.playEnded })

export const startUserEvents = async () => {
  writer.setEnabled(await isViewingHistoryEnabled())
  writer.start()
  backfillUserEvents().catch((err) => console.warn(`[events] backfill failed: ${err.message}`))
}

export const stopUserEvents = async () => {
  await tracker.settle()
  await writer.stop()
}

export const pruneUserEvents = async ({ nowMs = Date.now() } = {}) => {
  const removed = await db('user_events').where('ts', '<', pruneCutoffOf(nowMs)).delete()
  if (removed) console.log(`[events] pruned ${removed} event(s) older than two years`)
  return removed
}

export const backfillUserEvents = async ({ nowMs = Date.now(), loadAutorecs = autorecsFromTvheadend } = {}) => {
  if (!(await isViewingHistoryEnabled())) return { core: 0, series: 0 }
  const core = (await getSetting(BACKFILL_KEY)) ? 0 : await backfillFromState({ nowMs })
  const series = (await getSetting(SERIES_BACKFILL_KEY)) ? 0 : await backfillFromSeries({ nowMs, loadAutorecs })
  if (core || series) console.log(`[events] seeded viewing history with ${core + series} event(s)`)
  return { core, series }
}

export const flushUserEvents = () => writer.flush()

export const logUserEvent = (event) => writer.log(event)

export const isViewingHistoryEnabled = async () => viewingHistoryEnabledFrom(await getSetting(VIEWING_HISTORY_KEY))

export const setViewingHistoryEnabled = async (enabled) => {
  await setSetting(VIEWING_HISTORY_KEY, enabled ? 'true' : 'false')
  writer.setEnabled(enabled)
}

const insertRows = (rows) => db('user_events').insert(rows)

const writer = createEventWriter({ insertRows })

const programmesFor = async ({ channelId, fromMs, toMs }) => {
  const [guide, savedRows] = await Promise.all([
    getGuideSnapshot().catch(() => null),
    db('guide_programs')
      .where({ channel_id: String(channelId) })
      .andWhere('end', '>', fromMs)
      .andWhere('start', '<', toMs)
      .catch(() => []),
  ])
  const overlaps = (programme) => programme.start < toMs && programme.end > fromMs
  const live = (guide?.programsByChannel?.[String(channelId)] || []).filter(overlaps)
  const saved = savedRows.map((row) => JSON.parse(row.program_json)).filter(overlaps)
  return mergeGuidePrograms({ live, saved })
}

const recordingFor = (recordingId) => db('recordings').where({ recording_id: recordingId }).first()

const tracker = createWatchTracker({ log: writer.log, programmesFor, recordingFor })

const historySummary = async () => {
  const row = await db('user_events').count({ count: '*' }).min({ oldest: 'ts' }).first()
  return { event_count: Number(row?.count) || 0, oldest_event_at: row?.oldest ?? null }
}

const markBackfilled = async () => {
  const stamp = String(Date.now())
  await setSetting(BACKFILL_KEY, stamp)
  await setSetting(SERIES_BACKFILL_KEY, stamp)
}

const backfillFromState = async ({ nowMs }) => {
  const [recordings, watchlist] = await Promise.all([
    db('recordings').whereNotNull('watched_at').orWhere('playback_position_s', '>', 0),
    db('watchlist'),
  ])
  const written = await insertEvents({ events: backfillEventsOf({ recordings, watchlist, nowMs }), nowMs })
  await setSetting(BACKFILL_KEY, String(nowMs))
  return written
}

const backfillFromSeries = async ({ nowMs, loadAutorecs }) => {
  let autorecs
  try {
    autorecs = await loadAutorecs()
  } catch {
    return 0
  }
  const written = await insertEvents({ events: seriesBackfillEventsOf({ autorecs, nowMs }), nowMs })
  await setSetting(SERIES_BACKFILL_KEY, String(nowMs))
  return written
}

const insertEvents = async ({ events, nowMs }) => {
  const rows = events.map((event) => eventRowOf({ event, nowMs }))
  for (let i = 0; i < rows.length; i += BACKFILL_CHUNK) await insertRows(rows.slice(i, i + BACKFILL_CHUNK))
  return rows.length
}

const autorecsFromTvheadend = async () => listAutorecs(await resolveConnection())

const captureJson = (res) => {
  const send = res.json.bind(res)
  res.json = (payload) => {
    res.locals.userEventPayload = payload
    return send(payload)
  }
}

const beforeContextFor = async ({ route, path }) => {
  if (route?.needs !== 'watchlist') return {}
  const id = Number(path.split('/').at(-1))
  return { watchlist: (await db('watchlist').where({ id }).first()) || null }
}

const logRouteEvents = async ({ req, res, route, before }) => {
  const response = res.locals.userEventPayload || {}
  const context = { ...before, ...(await afterContextFor({ route, req, response })) }
  routeEventsOf({ method: req.method, path: req.path, body: req.body, response, context }).forEach(writer.log)
}

const afterContextFor = async ({ route, req, response }) => {
  if (route.needs === 'programme') return { programme: await programmeById(req.body?.program_id) }
  if (route.needs !== 'recordings') return {}
  const ids = Array.isArray(response.results)
    ? response.results.map((result) => result.recordingId)
    : [decodeURIComponent(req.path.split('/').at(-2))]
  const rows = await db('recordings').whereIn('recording_id', ids.filter(Boolean))
  return { recordings: new Map(rows.map((row) => [row.recording_id, row])) }
}

const programmeById = async (programId) => {
  if (programId == null) return null
  const guide = await getGuideSnapshot().catch(() => null)
  return guide?.programByEventId?.get(String(programId))
    || (await savedProgramFor({ programId: String(programId) }).catch(() => null))
}

const BACKFILL_CHUNK = 200
