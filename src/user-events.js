import { showKeyOf } from './web/show-key.js'

export const FEEDBACK_KINDS = new Set([
  'suggestion_shown',
  'suggestion_accepted',
  'suggestion_dismissed',
  'not_interested',
  'thumb_up',
  'thumb_down',
  'programme_opened',
])

export const EVENT_KINDS = new Set([
  'watch_start',
  'watch_end',
  'record_request',
  'record_cancel',
  'series_stop',
  'series_pause',
  'series_resume',
  'recording_deleted',
  'not_interested_undo',
  ...FEEDBACK_KINDS,
])

export const VIEWING_HISTORY_KEY = 'viewing_history_enabled'
export const HISTORY_RETENTION_MS = 730 * 24 * 60 * 60 * 1000
export const MIN_LIVE_WATCH_S = 60
export const MAX_FEEDBACK_EVENTS = 50

export const viewingHistoryEnabledFrom = (stored) => stored !== 'false'

export const pruneCutoffOf = (nowMs) => nowMs - HISTORY_RETENTION_MS

export const seriesKeyOf = (title) => {
  const text = textOrNull(title)
  return text ? showKeyOf(text) : null
}

export const eventRowOf = ({ event, nowMs = Date.now() }) => {
  const title = textOrNull(event.title, MAX_TITLE_LENGTH)
  return {
    ts: wholeOrNull(event.ts) ?? nowMs,
    kind: event.kind,
    series_key: textOrNull(event.series_key, MAX_TITLE_LENGTH) ?? seriesKeyOf(title),
    title,
    programme_start: wholeOrNull(event.programme_start),
    channel_id: textOrNull(event.channel_id, MAX_ID_LENGTH),
    recording_id: textOrNull(event.recording_id, MAX_ID_LENGTH),
    duration_s: secondsOrNull(event.duration_s),
    position_s: secondsOrNull(event.position_s),
    programme_len_s: secondsOrNull(event.programme_len_s),
    source: textOrNull(event.source, MAX_ID_LENGTH),
    meta_json: hasKeys(event.meta) ? JSON.stringify(event.meta) : null,
  }
}

export const programmeAt = ({ programmes = [], atMs }) =>
  programmes.find((programme) => programme.start <= atMs && programme.end > atMs) || null

export const programmeFieldsOf = (programme) => (programme
  ? {
    title: programme.title,
    programme_start: programme.start,
    programme_len_s: (programme.end - programme.start) / 1000,
  }
  : {})

export const liveWatchEndsOf = ({
  channelId, startedAt, endedAt, programmes = [], minSeconds = MIN_LIVE_WATCH_S, meta = {},
}) => {
  if (!(endedAt > startedAt)) return []
  const watched = programmes
    .filter((programme) => programme.start < endedAt && programme.end > startedAt)
    .sort((a, b) => a.start - b.start)
    .map((programme) => liveWatchOf({ channelId, startedAt, endedAt, programme, meta }))
  if (watched.length) return watched.filter((event) => event.duration_s >= minSeconds)
  const seconds = (endedAt - startedAt) / 1000
  if (seconds < minSeconds) return []
  return [{ kind: 'watch_end', ts: endedAt, channel_id: channelId, duration_s: seconds, source: 'live', meta }]
}

export const positionProgressOf = ({ progress = EMPTY_PROGRESS, seconds, atMs, slackSeconds = POSITION_SLACK_S }) => {
  const next = { ...progress, lastSeconds: seconds, lastAt: atMs, seen: true }
  if (progress.lastSeconds == null) return next
  const moved = seconds - progress.lastSeconds
  const allowed = (atMs - progress.lastAt) / 1000 + slackSeconds
  if (moved <= 0 || moved > allowed) return next
  return { ...next, watchedSeconds: progress.watchedSeconds + moved }
}

export const resetPositionAnchor = (progress = EMPTY_PROGRESS) => ({ ...progress, lastSeconds: null, lastAt: null })

export const EMPTY_PROGRESS = Object.freeze({ watchedSeconds: 0, lastSeconds: null, lastAt: null, seen: false })

export const watchedSecondsOf = ({ progress = EMPTY_PROGRESS, wallMs = 0, lengthSeconds = null }) => {
  const seconds = progress.seen ? progress.watchedSeconds : wallMs / 1000
  return lengthSeconds > 0 ? Math.min(seconds, lengthSeconds) : seconds
}

export const seriesLinkParts = (seriesLinkId) => {
  const text = String(seriesLinkId ?? '')
  const split = text.indexOf('|')
  if (split < 0) return { channelId: null, title: textOrNull(text) }
  return { channelId: textOrNull(text.slice(0, split)), title: textOrNull(text.slice(split + 1)) }
}

export const routeOf = ({ method, path }) =>
  OBSERVED_ROUTES.find((route) => route.method === method && route.pattern.test(path)) || null

export const routeEventsOf = ({ method, path, body = {}, response = {}, context = {} }) => {
  const route = routeOf({ method, path })
  if (!route) return []
  const params = path.match(route.pattern).groups || {}
  return route.events({ params, body: body || {}, response: response || {}, context })
}

export const positionPingOf = ({ method, path, body }) => {
  if (method !== 'POST') return null
  const match = path.match(POSITION_PATH)
  const seconds = Number(body?.seconds)
  if (!match || !Number.isFinite(seconds)) return null
  return { recordingId: decodeURIComponent(match[1]), seconds }
}

export const feedbackEventsFrom = (body) => {
  const items = Array.isArray(body?.events) ? body.events : [body]
  if (!items.length || items.length > MAX_FEEDBACK_EVENTS) {
    return { error: `send between 1 and ${MAX_FEEDBACK_EVENTS} events` }
  }
  const events = []
  for (const item of items) {
    const { event, error } = feedbackEventOf(item)
    if (error) return { error }
    events.push(event)
  }
  return { events }
}

export const backfillEventsOf = ({ recordings = [], watchlist = [], nowMs = Date.now() }) => [
  ...recordings.map((row) => recordingBackfillOf({ row, nowMs })).filter(Boolean),
  ...watchlist.map((row) => ({
    kind: 'record_request',
    ts: msOf(row.created_at) ?? nowMs,
    title: row.title,
    channel_id: row.channel_id,
    source: 'watchlist',
    meta: { backfill: true, type: row.mode === 'record' ? 'record' : 'notify' },
  })),
]

export const seriesBackfillEventsOf = ({ autorecs = [], nowMs = Date.now() }) => autorecs
  .filter((autorec) => textOrNull(autorec.name))
  .map((autorec) => ({
    kind: 'record_request',
    ts: nowMs,
    title: autorec.name,
    channel_id: autorec.channelId || null,
    source: 'series',
    meta: { backfill: true, type: 'series', enabled: autorec.enabled !== false },
  }))

export const msOf = (value) => {
  if (value == null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const text = String(value)
  const parsed = SQLITE_TIMESTAMP.test(text) ? Date.parse(`${text.replace(' ', 'T')}Z`) : Date.parse(text)
  return Number.isFinite(parsed) ? parsed : null
}

const liveWatchOf = ({ channelId, startedAt, endedAt, programme, meta }) => {
  const from = Math.max(programme.start, startedAt)
  const to = Math.min(programme.end, endedAt)
  return {
    kind: 'watch_end',
    ts: to,
    channel_id: channelId,
    ...programmeFieldsOf(programme),
    duration_s: (to - from) / 1000,
    position_s: (to - programme.start) / 1000,
    source: 'live',
    meta: { ...meta, program_id: programme.program_id ?? null },
  }
}

const recordingBackfillOf = ({ row, nowMs }) => {
  const watched = Boolean(row.watched_at)
  const position = Number(row.playback_position_s) || 0
  if (!watched && position <= 0) return null
  const length = Number(row.duration_s) || null
  return {
    kind: 'watch_end',
    ts: msOf(watched ? row.watched_at : row.played_at) ?? msOf(row.played_at) ?? nowMs,
    title: row.title,
    programme_start: row.aired_at,
    channel_id: row.channel_id,
    recording_id: row.recording_id,
    duration_s: watched ? (length ?? position) : position,
    position_s: watched ? (length ?? position) : position,
    programme_len_s: length,
    source: 'recording',
    meta: { backfill: true, watched },
  }
}

const feedbackEventOf = (item) => {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return { error: 'each event must be an object' }
  if (!FEEDBACK_KINDS.has(item.kind)) return { error: `kind must be one of ${[...FEEDBACK_KINDS].join(', ')}` }
  const title = optionalText(item.title, MAX_TITLE_LENGTH)
  if (title === INVALID) return { error: `title must be text up to ${MAX_TITLE_LENGTH} characters` }
  const seriesKey = item.series_key == null ? null : String(item.series_key)
  if (seriesKey != null && !SERIES_KEY_PATTERN.test(seriesKey)) return { error: 'series_key must be a show key' }
  if (!title && !seriesKey) return { error: 'title or series_key is required' }
  const programmeStart = item.programme_start == null ? null : Number(item.programme_start)
  if (programmeStart != null && !(Number.isInteger(programmeStart) && programmeStart >= 0)) {
    return { error: 'programme_start must be epoch milliseconds' }
  }
  const channelId = optionalText(item.channel_id, MAX_ID_LENGTH)
  const recordingId = optionalText(item.recording_id, MAX_ID_LENGTH)
  if (channelId === INVALID || recordingId === INVALID) {
    return { error: `channel_id and recording_id must be text up to ${MAX_ID_LENGTH} characters` }
  }
  const source = item.source == null ? 'ui' : String(item.source)
  if (!SOURCE_PATTERN.test(source)) return { error: 'source must be up to 40 lowercase letters, digits, - or _' }
  const meta = item.meta ?? null
  if (meta != null && !isPlainObject(meta)) return { error: 'meta must be an object' }
  if (meta != null && JSON.stringify(meta).length > MAX_META_LENGTH) {
    return { error: `meta must be under ${MAX_META_LENGTH} characters as JSON` }
  }
  return {
    event: {
      kind: item.kind,
      title,
      series_key: seriesKey,
      programme_start: programmeStart,
      channel_id: channelId,
      recording_id: recordingId,
      source,
      meta,
    },
  }
}

const recordingDeletedOf = ({ row, source }) => ({
  kind: 'recording_deleted',
  title: row.title,
  programme_start: row.aired_at,
  channel_id: row.channel_id,
  recording_id: row.recording_id,
  position_s: row.playback_position_s,
  programme_len_s: row.duration_s,
  source,
  meta: { watched: Boolean(row.watched_at) },
})

const guideEventOf = ({ kind, body, context, meta }) => ({
  kind,
  channel_id: body.channel_id ?? context.programme?.channel_id,
  ...programmeFieldsOf(context.programme),
  source: 'guide',
  meta: { ...meta, program_id: body.program_id ?? null },
})

const seriesEventOf = ({ kind, seriesLinkId, title, meta = {} }) => {
  const parts = seriesLinkParts(seriesLinkId)
  return {
    kind,
    title: title || parts.title,
    channel_id: parts.channelId,
    source: 'series',
    meta: { ...meta, series_link_id: String(seriesLinkId ?? '') },
  }
}

const watchlistEventOf = ({ kind, title, channelId, mode }) => ({
  kind,
  title,
  channel_id: channelId ?? null,
  source: 'watchlist',
  meta: { type: mode === 'record' ? 'record' : 'notify' },
})

const OBSERVED_ROUTES = [
  {
    method: 'POST',
    pattern: /^\/api\/epg\/record$/,
    needs: 'programme',
    events: ({ body, response, context }) => [guideEventOf({
      kind: 'record_request', body, context, meta: { type: 'episode', dvr_uuid: response.uuid ?? null },
    })],
  },
  {
    method: 'POST',
    pattern: /^\/api\/epg\/cancel$/,
    needs: 'programme',
    events: ({ body, context }) => [guideEventOf({ kind: 'record_cancel', body, context, meta: { type: 'episode' } })],
  },
  {
    method: 'POST',
    pattern: /^\/api\/epg\/record-series$/,
    needs: 'programme',
    events: ({ body, response, context }) => [{
      ...guideEventOf({
        kind: 'record_request',
        body,
        context,
        meta: { type: 'series', any_channel: body.any_channel === true, paused: body.paused === true },
      }),
      title: response.title ?? context.programme?.title,
    }],
  },
  {
    method: 'POST',
    pattern: /^\/api\/epg\/cancel-series$/,
    events: ({ response }) => (Array.isArray(response.cancelled) ? response.cancelled : [])
      .map((cancelled) => seriesEventOf({ kind: 'series_stop', seriesLinkId: cancelled.seriesLinkId, title: cancelled.title })),
  },
  {
    method: 'POST',
    pattern: /^\/api\/epg\/pause-series$/,
    events: ({ body }) => (Array.isArray(body.series_link_ids) ? body.series_link_ids : [])
      .map((seriesLinkId) => seriesEventOf({ kind: body.paused ? 'series_pause' : 'series_resume', seriesLinkId })),
  },
  {
    method: 'POST',
    pattern: /^\/api\/watchlist$/,
    events: ({ body, response }) => [watchlistEventOf({
      kind: 'record_request',
      title: response.item?.title ?? body.title,
      channelId: response.item?.channel_id ?? body.channel_id,
      mode: response.item?.mode ?? body.mode,
    })],
  },
  {
    method: 'PATCH',
    pattern: /^\/api\/watchlist\/(?<id>\d+)$/,
    needs: 'watchlist',
    events: ({ body, context }) => (body.mode === undefined || !context.watchlist ? [] : [watchlistEventOf({
      kind: 'record_request', title: context.watchlist.title, channelId: context.watchlist.channel_id, mode: body.mode,
    })]),
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/watchlist\/(?<id>\d+)$/,
    needs: 'watchlist',
    events: ({ context }) => (context.watchlist ? [watchlistEventOf({
      kind: 'record_cancel', title: context.watchlist.title, channelId: context.watchlist.channel_id, mode: context.watchlist.mode,
    })] : []),
  },
  {
    method: 'POST',
    pattern: /^\/api\/library\/delete$/,
    needs: 'recordings',
    events: ({ response, context }) => (Array.isArray(response.results) ? response.results : [])
      .filter((result) => result.ok && context.recordings?.has(result.recordingId))
      .map((result) => recordingDeletedOf({ row: context.recordings.get(result.recordingId), source: 'library' })),
  },
  {
    method: 'POST',
    pattern: /^\/api\/recordings\/(?<recordingId>[^/]+)\/delete-from-tvh$/,
    needs: 'recordings',
    events: ({ params, context }) => {
      const row = context.recordings?.get(decodeURIComponent(params.recordingId))
      return row ? [recordingDeletedOf({ row, source: 'tvheadend' })] : []
    },
  },
]

const textOrNull = (value, maxLength = Infinity) => {
  if (value == null) return null
  const text = String(value).trim()
  return text ? text.slice(0, maxLength) : null
}

const optionalText = (value, maxLength) => {
  if (value == null || value === '') return null
  if (typeof value !== 'string' && typeof value !== 'number') return INVALID
  const text = String(value).trim()
  if (text.length > maxLength) return INVALID
  return text || null
}

const wholeOrNull = (value) => {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? Math.round(number) : null
}

const secondsOrNull = (value) => {
  const whole = wholeOrNull(value)
  return whole == null ? null : Math.max(0, whole)
}

const hasKeys = (value) => isPlainObject(value) && Object.keys(value).length > 0

const isPlainObject = (value) => value != null && typeof value === 'object' && !Array.isArray(value)

const INVALID = Symbol('invalid')
const MAX_TITLE_LENGTH = 200
const MAX_ID_LENGTH = 100
const MAX_META_LENGTH = 2000
const POSITION_SLACK_S = 10
const SERIES_KEY_PATTERN = /^[a-z0-9-]{1,200}$/
const SOURCE_PATTERN = /^[a-z0-9_-]{1,40}$/
const SQLITE_TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/
const POSITION_PATH = /^\/api\/recordings\/([^/]+)\/position$/
