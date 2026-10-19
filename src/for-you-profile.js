import { showKeyOf } from './web/show-key.js'
import { msOf } from './user-events.js'

export const HALF_LIFE_DAYS = 60
export const LIKED_AFFINITY = 0.25
export const COMPLETE_FRACTION = 0.8
export const ABANDON_MIN_STARTS = 3
export const ABANDON_MAX_RATIO = 0.15
export const NOT_INTERESTED_DAYS = 90
export const DISMISS_WINDOW_DAYS = 30

export const decayOf = ({ ts, nowMs, halfLifeDays = HALF_LIFE_DAYS }) => {
  if (!Number.isFinite(ts)) return 0.5
  const ageDays = Math.max(0, (nowMs - ts) / DAY_MS)
  return 0.5 ** (ageDays / halfLifeDays)
}

export const createKeyResolver = (knownKeys = new Set()) => (title) => {
  const key = showKeyOf(title)
  if (knownKeys.has(key)) return key
  const prefix = String(title || '').split(/\s+[-–:]\s+/)[0]
  const prefixKey = showKeyOf(prefix)
  return prefix !== title && knownKeys.has(prefixKey) ? prefixKey : key
}

export const profileOf = ({ events = [], recordings = [], nowMs = Date.now(), keyOf = showKeyOf, hourOf = localHourOf }) => {
  const shows = new Map()
  const habits = { channels: new Map(), channelHours: new Map(), hours: new Map(), total: 0, sessions: 0 }
  const showFor = (key, title) => {
    if (!shows.has(key)) shows.set(key, emptyShow({ key, title }))
    const show = shows.get(key)
    if (title && (!show.title || (showKeyOf(show.title) !== key && showKeyOf(title) === key))) show.title = title
    return show
  }

  for (const row of recordings) {
    const key = keyOf(row.title)
    const show = showFor(key, displayTitleOf({ title: row.title, key }))
    const airedAt = Number(row.aired_at) || msOf(row.imported_at) || null
    show.recordings += 1
    show.recordingTimes.push(airedAt)
    if (Number(row.season) > 0) show.maxSeason = Math.max(show.maxSeason ?? 0, Number(row.season))
    const length = Number(row.duration_s) || null
    const position = Number(row.playback_position_s) || 0
    const fraction = row.watched_at ? 1 : (length ? position / length : 0)
    if (row.watched_at || position > 0) {
      noteEpisode({ show, episodeKey: `rec:${row.recording_id}`, fraction, ts: msOf(row.watched_at) ?? msOf(row.played_at) ?? airedAt })
    }
  }

  const ordered = [...events].sort((a, b) => Number(a.ts) - Number(b.ts))
  for (const event of ordered) {
    const title = event.title || null
    const key = title ? keyOf(title) : event.series_key
    if (!key) continue
    const show = showFor(key, title && displayTitleOf({ title, key }))
    const ts = Number(event.ts)
    const meta = parseMeta(event.meta_json ?? event.meta)
    show.lastEventTs = Math.max(show.lastEventTs ?? 0, ts)
    if (event.kind === 'watch_start') {
      show.starts += 1
      continue
    }
    if (event.kind === 'watch_end') {
      const fraction = watchFractionOf({ event, meta })
      const episodeKey = event.recording_id ? `rec:${event.recording_id}` : `live:${event.channel_id}|${event.programme_start ?? ts}`
      noteEpisode({ show, episodeKey, fraction, ts, seconds: Number(event.duration_s) || 0 })
      noteHabit({ habits, event, ts, nowMs, hourOf })
      continue
    }
    if (event.kind === 'record_request') {
      const type = meta?.type || 'episode'
      show.requests.push({ ts, type })
      continue
    }
    if (event.kind === 'record_cancel') show.cancels.push(ts)
    if (event.kind === 'series_stop') show.stops.push(ts)
    if (event.kind === 'recording_deleted' && !meta?.watched) show.unwatchedDeletes.push(ts)
    if (event.kind === 'thumb_up') show.thumbsUp.push(ts)
    if (event.kind === 'thumb_down') show.thumbsDown.push(ts)
    if (event.kind === 'not_interested') show.notInterested.push(ts)
    if (event.kind === 'not_interested_undo') show.notInterested = []
    if (event.kind === 'suggestion_dismissed') show.dismissed.push(ts)
    if (event.kind === 'suggestion_accepted') show.accepted.push(ts)
    if (event.kind === 'suggestion_shown') show.shown.push(ts)
  }

  for (const show of shows.values()) scoreShow({ show, nowMs })
  return { shows, habits }
}

export const watchFractionOf = ({ event, meta = null }) => {
  if (meta?.watched === true) return 1
  const length = Number(event.programme_len_s)
  if (!(length > 0)) return Number(event.duration_s) >= 20 * 60 ? 1 : Math.min(1, (Number(event.duration_s) || 0) / (30 * 60))
  const byPosition = (Number(event.position_s) || 0) / length
  const byDuration = (Number(event.duration_s) || 0) / length
  return Math.min(1, event.source === 'live' ? byDuration : Math.max(byPosition, byDuration))
}

export const likedShowsOf = (profile) => [...profile.shows.values()]
  .filter((show) => show.affinity >= LIKED_AFFINITY && !show.abandoned && !show.hidden)
  .sort((a, b) => b.affinity - a.affinity)

export const engagedShowCountOf = (profile) => [...profile.shows.values()]
  .filter((show) => show.recordings > 0 || show.episodesStarted > 0 || show.requests.length > 0 || show.thumbsUp.length > 0)
  .length

export const isHiddenShow = ({ show, nowMs }) => {
  if (!show) return false
  if (show.thumbsDown.length && Math.max(...show.thumbsDown) > Math.max(0, ...show.thumbsUp)) return true
  return show.notInterested.some((ts) => nowMs - ts < NOT_INTERESTED_DAYS * DAY_MS)
}

export const channelHabitOf = ({ habits, channelId, hour }) => {
  const exact = habits.channelHours.get(`${channelId}|${hour}`) || 0
  const near = (habits.channelHours.get(`${channelId}|${(hour + 23) % 24}`) || 0) + (habits.channelHours.get(`${channelId}|${(hour + 1) % 24}`) || 0)
  return { sessions: exact + near * 0.5, channelShare: habits.total ? (habits.channels.get(channelId) || 0) / habits.total : 0 }
}

export const hourHabitOf = ({ habits, hour }) => {
  if (!habits.total) return 0
  const peak = Math.max(...habits.hours.values())
  return peak ? (habits.hours.get(hour) || 0) / peak : 0
}

export const hiddenShowsOf = ({ profile, nowMs }) => [...profile.shows.values()]
  .filter((show) => show.notInterested.some((ts) => nowMs - ts < NOT_INTERESTED_DAYS * DAY_MS))
  .map((show) => {
    const hiddenAt = Math.max(...show.notInterested)
    return { seriesKey: show.key, title: show.title || show.key, hiddenAt, until: hiddenAt + NOT_INTERESTED_DAYS * DAY_MS }
  })
  .sort((a, b) => b.hiddenAt - a.hiddenAt)

export const localHourOf = (ms) => new Date(ms).getHours()

const displayTitleOf = ({ title, key }) => {
  if (showKeyOf(title) === key) return title
  const prefix = String(title).split(/\s+[-–:]\s+/)[0]
  return showKeyOf(prefix) === key ? prefix : title
}

const emptyShow = ({ key, title }) => ({
  key,
  title: title || null,
  recordings: 0,
  recordingTimes: [],
  maxSeason: null,
  starts: 0,
  episodes: new Map(),
  episodesStarted: 0,
  episodesCompleted: 0,
  requests: [],
  cancels: [],
  stops: [],
  unwatchedDeletes: [],
  thumbsUp: [],
  thumbsDown: [],
  notInterested: [],
  dismissed: [],
  accepted: [],
  shown: [],
  lastEventTs: null,
  lastActivityTs: null,
  affinity: 0,
  raw: 0,
  abandoned: false,
  hidden: false,
})

const noteEpisode = ({ show, episodeKey, fraction, ts, seconds = 0 }) => {
  const known = show.episodes.get(episodeKey)
  const next = {
    fraction: Math.max(known?.fraction ?? 0, fraction),
    ts: Math.max(known?.ts ?? 0, Number(ts) || 0) || null,
    seconds: (known?.seconds ?? 0) + seconds,
  }
  show.episodes.set(episodeKey, next)
}

const noteHabit = ({ habits, event, ts, nowMs, hourOf }) => {
  const seconds = Number(event.duration_s) || 0
  if (event.source !== 'live' || seconds < MIN_HABIT_SECONDS || !event.channel_id) return
  const weight = decayOf({ ts, nowMs })
  const channelId = String(event.channel_id)
  const hour = hourOf(Number(event.programme_start) || ts - seconds * 1000)
  habits.total += weight
  habits.sessions += 1
  habits.channels.set(channelId, (habits.channels.get(channelId) || 0) + weight)
  habits.channelHours.set(`${channelId}|${hour}`, (habits.channelHours.get(`${channelId}|${hour}`) || 0) + weight)
  habits.hours.set(hour, (habits.hours.get(hour) || 0) + weight)
}

const scoreShow = ({ show, nowMs }) => {
  const episodes = [...show.episodes.values()].filter((episode) => episode.fraction > 0.02 || episode.seconds >= 60)
  show.episodesStarted = episodes.length
  show.episodesCompleted = episodes.filter((episode) => episode.fraction >= COMPLETE_FRACTION).length
  const decay = (ts) => decayOf({ ts, nowMs })
  let raw = 0
  for (const episode of episodes) {
    raw += (episode.fraction >= COMPLETE_FRACTION ? 1 : 0.1 + 0.4 * episode.fraction) * decay(episode.ts)
  }
  for (const ts of show.recordingTimes) raw += 0.35 * decay(ts)
  for (const request of show.requests) raw += (REQUEST_WEIGHTS[request.type] ?? 0.6) * decay(request.ts)
  for (const ts of show.thumbsUp) raw += 2 * decay(ts)
  for (const ts of show.accepted) raw += 0.8 * decay(ts)
  for (const ts of show.unwatchedDeletes) raw -= 0.2 * decay(ts)
  show.raw = Math.max(0, raw)
  const ratio = show.episodesStarted ? show.episodesCompleted / show.episodesStarted : 0
  show.completionRatio = ratio
  show.abandoned = show.episodesStarted >= ABANDON_MIN_STARTS && ratio < ABANDON_MAX_RATIO && !show.thumbsUp.length
  const stopped = show.stops.some((ts) => nowMs - ts < NOT_INTERESTED_DAYS * DAY_MS)
  const base = 1 - Math.exp(-show.raw / 2)
  show.affinity = base * (show.abandoned ? ABANDON_PENALTY : 1) * (stopped ? 0.5 : 1)
  show.hidden = isHiddenShow({ show, nowMs })
  if (show.hidden) show.affinity = 0
  show.lastActivityTs = Math.max(
    0,
    ...episodes.map((episode) => episode.ts || 0),
    ...show.recordingTimes.map((ts) => ts || 0),
    ...show.requests.map((request) => request.ts),
    ...show.thumbsUp,
  ) || null
}

const parseMeta = (value) => {
  if (!value) return null
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

const REQUEST_WEIGHTS = { episode: 0.6, series: 1.2, record: 0.8, notify: 0.5 }
const ABANDON_PENALTY = 0.3
const MIN_HABIT_SECONDS = 5 * 60
const DAY_MS = 24 * 60 * 60 * 1000
