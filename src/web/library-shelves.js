import { durationText } from './recording-info.js'
import { dateFormat, formatClock } from './time-format.js'

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
  if (!total) return firstEpisodeText({ nextAiring: show.nextAiring, timeZone, short: true })
  return [countText(total, 'episode'), fresh ? `${fresh} new` : ''].filter(Boolean).join(' · ')
}

export const firstEpisodeText = ({ nextAiring, timeZone, short = false }) => {
  if (!nextAiring) return 'Not in the guide yet'
  const when = weekdayClockOf({ ms: nextAiring.startDate, timeZone })
  return short ? `First episode ${when}` : `First episode records ${when}`
}

export const movieMetaOf = ({ show }) => [
  show.latest?.channelName,
  durationText(show.latest?.durationS),
].filter(Boolean).join(' · ')

export const oneOffMetaOf = ({ show, timeZone }) => [
  show.latest?.channelName,
  show.latest?.airedAt ? dayMonthOf({ ms: show.latest.airedAt, timeZone }) : '',
].filter(Boolean).join(' · ')

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

const hasUnwatched = (show) => show.counts.unwatched > 0

const countText = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

const compareTitles = (a, b) =>
  collator.compare(titleSortKey(a), titleSortKey(b)) || collator.compare(String(a || ''), String(b || ''))
