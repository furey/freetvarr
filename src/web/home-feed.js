import { localDayNumber } from './guide-time.js'
import { programmeProgress } from './live-info.js'

export const TONIGHT_LIMIT = 3
export const NEW_RECORDINGS_LIMIT = 12

export const continueWatchingUrl = '/api/library/episodes?state=in-progress&limit=1'
export const newRecordingsUrl = `/api/library/episodes?state=new&limit=${NEW_RECORDINGS_LIMIT}`

export const episodeCodeOf = ({ season, episode }) => {
  const parts = [season != null ? `S${season}` : '', episode != null ? `E${episode}` : '']
  return parts.filter(Boolean).join(' ')
}

export const minutesLeftOf = (episode) => {
  const left = (episode.durationS ?? 0) - (episode.positionS ?? 0)
  return Math.max(1, Math.ceil(left / 60))
}

export const watchedFractionOf = (episode) => {
  if (!episode.durationS) return 0
  return Math.min(1, Math.max(0, (episode.positionS ?? 0) / episode.durationS))
}

const dayWord = ({ ms, nowMs, timeZone }) => {
  const daysAgo = localDayNumber({ ms: nowMs, timeZone }) - localDayNumber({ ms, timeZone })
  if (daysAgo <= 0) return 'Today'
  if (daysAgo === 1) return 'Yesterday'
  return null
}

const weekdayOf = ({ ms, timeZone }) =>
  new Intl.DateTimeFormat('en-AU', { weekday: 'short', timeZone }).format(ms)

export const airedWhenOf = ({ episode, nowMs, timeZone }) => {
  if (!episode.airedAt) return ''
  const ms = episode.airedAt
  const word = dayWord({ ms, nowMs, timeZone })
  if (word) return word
  const daysAgo = localDayNumber({ ms: nowMs, timeZone }) - localDayNumber({ ms, timeZone })
  if (daysAgo < 7) return weekdayOf({ ms, timeZone })
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', timeZone }).format(ms)
}

export const newCardMetaOf = ({ episode, nowMs, timeZone }) => [
  episodeCodeOf(episode),
  episode.channelName,
  airedWhenOf({ episode, nowMs, timeZone }),
].filter(Boolean).join(' · ')

export const showHrefOf = (episode) => `#/recordings/show/${episode.showKey}`

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
