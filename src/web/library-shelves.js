import { durationText } from './recording-info.js'
import { dateFormat, formatClock } from './time-format.js'
import { localDayNumber } from './guide-time.js'

export const LIBRARY_SORTS = [
  { key: 'recent', label: 'Recent' },
  { key: 'az', label: 'A–Z' },
]

export const FAILURE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export const shelvesOf = ({ shows = [], sort = 'recent', unwatchedOnly = false }) => {
  const visible = sortShows({ shows: shows.filter((s) => !unwatchedOnly || hasUnwatched(s)), sort })
  return {
    shows: visible.filter((s) => s.kind === 'show'),
    movies: visible.filter((s) => s.kind === 'movie'),
    oneoffs: visible.filter((s) => s.kind === 'oneoff'),
  }
}

export const sortShows = ({ shows, sort = 'recent' }) => [...shows].sort(sort === 'az'
  ? (a, b) => compareTitles(a.title, b.title)
  : (a, b) => (b.latestAt ?? -Infinity) - (a.latestAt ?? -Infinity) || compareTitles(a.title, b.title))

export const titleSortKey = (title) => String(title || '').trim().replace(/^the\s+/i, '')

export const posterMetaOf = ({ show, timeZone }) => {
  const { total, new: fresh } = show.counts
  if (!total && show.rule?.paused) return 'Paused'
  if (isScheduledOnly(show)) return scheduledShelfMetaOf({ show, timeZone })
  if (!total) return firstEpisodeText({ nextAiring: show.nextAiring, timeZone, short: true })
  return [countText(total, 'episode'), fresh ? `${fresh} new` : ''].filter(Boolean).join(' · ')
}

export const firstEpisodeText = ({ nextAiring, timeZone, short = false }) => {
  if (!nextAiring) return 'Not in the guide yet'
  const when = weekdayClockOf({ ms: nextAiring.startDate, timeZone })
  return short ? `First episode ${when}` : `First episode records ${when}`
}

export const movieMetaOf = ({ show, timeZone }) => scheduledShelfMetaOf({ show, timeZone }) || [
  show.latest?.channelName,
  durationText(show.latest?.durationS),
].filter(Boolean).join(' · ')

export const oneOffMetaOf = ({ show, timeZone }) => scheduledShelfMetaOf({ show, timeZone }) || [
  show.latest?.channelName,
  show.latest?.airedAt ? dayMonthOf({ ms: show.latest.airedAt, timeZone }) : '',
].filter(Boolean).join(' · ')

export const isScheduledOnly = (show) => !show.latest && !show.counts?.total && !show.rule && Boolean(show.nextAiring)

export const scheduledShelfMetaOf = ({ show, timeZone, nowMs = Date.now() }) => (isScheduledOnly(show)
  ? shortWhenOf({ ms: show.nextAiring.startDate, nowMs, timeZone })
  : '')

export const shortWhenOf = ({ ms, nowMs, timeZone }) => {
  const daysAhead = localDayNumber({ ms, timeZone }) - localDayNumber({ ms: nowMs, timeZone })
  if (daysAhead === 0) return scheduledWhenOf({ ms, nowMs, timeZone })
  if (daysAhead > 0 && daysAhead < 7) return weekdayClockOf({ ms, timeZone })
  return `${dateFormat({ weekday: 'short' }, timeZone).format(new Date(ms))} ${dayMonthOf({ ms, timeZone })}`
}

export const scheduledWhenOf = ({ ms, nowMs, timeZone }) => {
  const daysAhead = localDayNumber({ ms, timeZone }) - localDayNumber({ ms: nowMs, timeZone })
  const clock = formatClock(ms, timeZone)
  if (daysAhead === 0) return `${localHourOf({ ms, timeZone }) >= EVENING_HOUR ? 'Tonight' : 'Today'} ${clock}`
  if (daysAhead === 1) return `Tomorrow ${clock}`
  if (daysAhead > 1 && daysAhead < 7) return weekdayClockOf({ ms, timeZone })
  return `${dateFormat({ weekday: 'short' }, timeZone).format(new Date(ms))} ${dayMonthOf({ ms, timeZone })} ${clock}`
}

export const lowerDayWord = (text) => (/^(Tonight|Today|Tomorrow) /.test(text) ? text[0].toLowerCase() + text.slice(1) : text)


export const showsCountText = (shows) => {
  const episodes = shows.reduce((sum, s) => sum + s.counts.total, 0)
  return [countText(shows.length, 'show'), episodes ? countText(episodes, 'episode') : ''].filter(Boolean).join(' · ')
}

export const failedRecordingsOf = ({ rows = [], journeys = [], nowMs }) => {
  const recent = rows.filter((r) => Number(r.aired_at) >= nowMs - FAILURE_WINDOW_MS)
  const seen = new Set(recent.map((r) => String(r.recording_id)))
  const fromJourneys = journeys
    .filter((j) => j.failed && !seen.has(String(j.uuid)))
    .map((j) => ({ recording_id: j.uuid, title: j.title, aired_at: j.stopPadded, error: j.statusText }))
  return [...fromJourneys, ...recent]
}

export const failureBannerOf = ({ failed, timeZone, reasonOf = () => '' }) => {
  if (!failed.length) return null
  const first = failed[0]
  const headline = failed.length === 1 ? '1 recording failed' : `${failed.length} recordings failed`
  const when = first.aired_at ? weekdayClockOf({ ms: Number(first.aired_at), timeZone }) : ''
  const detail = [
    [first.title, when].filter(Boolean).join(', '),
    reasonOf(first.error),
  ].filter(Boolean).join(' · ')
  return { headline, detail }
}

export const weekdayClockOf = ({ ms, timeZone }) =>
  `${dateFormat({ weekday: 'short' }, timeZone).format(new Date(ms))} ${formatClock(ms, timeZone)}`

export const dayMonthOf = ({ ms, timeZone }) =>
  dateFormat({ day: 'numeric', month: 'short' }, timeZone).format(new Date(ms))

const localHourOf = ({ ms, timeZone }) => Number(dateFormat({ hour: 'numeric', hourCycle: 'h23' }, timeZone).format(new Date(ms)))

const EVENING_HOUR = 17

const hasUnwatched = (show) => show.counts.unwatched > 0

const countText = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

const compareTitles = (a, b) =>
  collator.compare(titleSortKey(a), titleSortKey(b)) || collator.compare(String(a || ''), String(b || ''))
