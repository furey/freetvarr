import { RESUME_END_MARGIN_S } from './playback.js'
import { showKeyOf } from './show-key.js'
import { localDayNumber } from './guide-time.js'
import { programmeProgress } from './live-info.js'

export const TONIGHT_LIMIT = 3
export const NEW_RECORDINGS_LIMIT = 12

const DONE_STATUSES = ['done', 'partial']

export const inLibrary = (recording) =>
  recording.status !== 'failed'
  && !recording.purged_at
  && (DONE_STATUSES.includes(recording.status) || !recording.deleted_from_tvh_at)

export const isWatched = (recording) =>
  Boolean(recording.watched_at)
  || recording.playback_position_s != null
  && Boolean(recording.duration_s)
  && recording.playback_position_s >= recording.duration_s - RESUME_END_MARGIN_S

export const isInProgress = (recording) =>
  (recording.playback_position_s ?? 0) > 0 && !isWatched(recording)

const playedAtMs = (recording) => Date.parse(recording.played_at?.includes('T')
  ? recording.played_at
  : `${String(recording.played_at).replace(' ', 'T')}Z`) || 0

export const continueWatchingOf = (recordings) => recordings
  .filter((r) => inLibrary(r) && r.playable !== false && isInProgress(r))
  .sort((a, b) => playedAtMs(b) - playedAtMs(a))[0] ?? null

export const newRecordingsOf = (recordings, limit = NEW_RECORDINGS_LIMIT) => recordings
  .filter((r) => inLibrary(r) && r.played_at == null && !isWatched(r))
  .sort((a, b) => (b.aired_at ?? 0) - (a.aired_at ?? 0))
  .slice(0, limit)

export const episodeCodeOf = ({ season, episode }) => {
  const parts = [season != null ? `S${season}` : '', episode != null ? `E${episode}` : '']
  return parts.filter(Boolean).join(' ')
}

export const minutesLeftOf = (recording) => {
  const left = (recording.duration_s ?? 0) - (recording.playback_position_s ?? 0)
  return Math.max(1, Math.ceil(left / 60))
}

export const watchedFractionOf = (recording) => {
  if (!recording.duration_s) return 0
  return Math.min(1, Math.max(0, (recording.playback_position_s ?? 0) / recording.duration_s))
}

const dayWord = ({ ms, nowMs, timeZone }) => {
  const daysAgo = localDayNumber({ ms: nowMs, timeZone }) - localDayNumber({ ms, timeZone })
  if (daysAgo <= 0) return 'Today'
  if (daysAgo === 1) return 'Yesterday'
  return null
}

const weekdayOf = ({ ms, timeZone }) =>
  new Intl.DateTimeFormat('en-AU', { weekday: 'short', timeZone }).format(ms)

export const airedWhenOf = ({ recording, nowMs, timeZone }) => {
  if (!recording.aired_at) return ''
  const ms = recording.aired_at
  const word = dayWord({ ms, nowMs, timeZone })
  if (word) return word
  const daysAgo = localDayNumber({ ms: nowMs, timeZone }) - localDayNumber({ ms, timeZone })
  if (daysAgo < 7) return weekdayOf({ ms, timeZone })
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', timeZone }).format(ms)
}

export const newCardMetaOf = ({ recording, nowMs, timeZone }) => [
  episodeCodeOf(recording),
  recording.channel_name,
  airedWhenOf({ recording, nowMs, timeZone }),
].filter(Boolean).join(' · ')

export const showHrefOfRecording = (recording) => `#/recordings/show/${showKeyOf(recording.title)}`

export const greetingFor = ({ nowMs, timeZone }) => {
  const hour = Number(new Intl.DateTimeFormat('en-AU', {
    hour: 'numeric', hourCycle: 'h23', timeZone,
  }).format(nowMs))
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export const favouriteOnNowOf = ({ entries, nowMs }) => (entries ?? [])
  .filter((e) => e.channel?.pinned && !e.channel.offAir && e.now && e.now.end > nowMs)
  .map((e) => ({
    channel: e.channel,
    program: e.now,
    percent: programmeProgress({ program: e.now, atMs: nowMs }),
    minutesLeft: Math.max(0, Math.ceil((e.now.end - nowMs) / 60_000)),
  }))

export const onNowMetaOf = ({ item }) =>
  `${item.channel.name} · ${item.minutesLeft} min left`

export const tonightOf = ({ upcoming, activeProgramIds, nowMs, timeZone }) => {
  const today = localDayNumber({ ms: nowMs, timeZone })
  const active = new Set((activeProgramIds ?? []).map(String))
  return (upcoming ?? [])
    .filter((u) => u.endDate > nowMs
      && localDayNumber({ ms: u.startDate, timeZone }) === today
      && !active.has(String(u.programId)))
    .sort((a, b) => a.startDate - b.startDate)
    .slice(0, TONIGHT_LIMIT)
}

export const tonightMetaOf = (item) => [
  episodeCodeOf({ season: item.season ?? item.seriesNo ?? null, episode: item.episodeNo ?? null }),
  item.channelName,
].filter(Boolean).join(' · ')

export const splitClock = (text) => {
  const [, time = String(text), period = ''] = String(text).trim().match(/^(.*?)\s*([ap]m)?$/i) ?? []
  return { time, period: period.toLowerCase() }
}
