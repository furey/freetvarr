import { localDayNumber } from './guide-time.js'
import { formatClock, formatDate } from './time-format.js'
import { showKeyOf } from './show-key.js'

const LATER_DAYS = 6
const MINUTE_MS = 60_000

export const SCHEDULED_SECTIONS = [
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'later', label: 'Later this week' },
]

export const groupScheduled = ({
  upcoming = [],
  skipped = [],
  activeProgramIds = [],
  nowMs = Date.now(),
  timeZone = 'UTC',
} = {}) => {
  const recordingNowIds = new Set(activeProgramIds.map(String))
  const today = localDayNumber({ ms: nowMs, timeZone })
  const groups = { today: [], tomorrow: [], later: [] }
  const seen = new Set()
  const entries = [
    ...upcoming.map((entry) => ({ entry, state: entryStateOf(entry) })),
    ...skipped.map((entry) => ({ entry, state: 'off' })),
  ]
  for (const { entry, state } of entries) {
    const id = String(entry.programId)
    if (recordingNowIds.has(id) || seen.has(id)) continue
    if (Number(entry.endDate) <= nowMs) continue
    const daysAhead = localDayNumber({ ms: Number(entry.startDate), timeZone }) - today
    const group = groupKeyOf(daysAhead)
    if (!group) continue
    seen.add(id)
    groups[group].push(rowOf({ entry, state, timeZone, showDay: group === 'later' }))
  }
  for (const rows of Object.values(groups)) rows.sort((a, b) => a.startMs - b.startMs)
  return groups
}

export const recordingNowRows = ({ active = [], nowMs = Date.now() } = {}) =>
  active.filter((r) => !r.failed).map((r) => ({
    key: r.uuid,
    programId: r.programId,
    title: r.title,
    showKey: showKeyOf(r.title),
    meta: [seasonEpisodeText(r), r.episodeTitle, r.channelName, minutesLeftText({ stop: r.stop, nowMs })]
      .filter(Boolean).join(' · '),
    percent: progressPercent({ start: r.start, stop: r.stop, nowMs }),
    imageProgramId: r.hasImage ? r.programId : null,
  }))

export const watchingRows = ({ items = [], timeZone = 'UTC' } = {}) =>
  items.map((item) => ({
    key: String(item.id),
    id: item.id,
    title: item.title,
    unseen: item.unseen || 0,
    meta: watchingMeta({ item, timeZone }),
  }))

export const scheduledCount = (groups) =>
  Object.values(groups).flat().filter((row) => row.state !== 'off').length

export const progressPercent = ({ start, stop, nowMs }) => {
  const span = Number(stop) - Number(start)
  if (!(span > 0)) return 0
  return Math.min(100, Math.max(0, Math.round(((nowMs - Number(start)) / span) * 100)))
}

export const minutesLeftText = ({ stop, nowMs }) => {
  const minutes = Math.ceil((Number(stop) - nowMs) / MINUTE_MS)
  if (!Number.isFinite(minutes) || minutes <= 0) return ''
  return `${minutes} min left`
}

const groupKeyOf = (daysAhead) => {
  if (daysAhead < 0) return null
  if (daysAhead === 0) return 'today'
  if (daysAhead === 1) return 'tomorrow'
  return daysAhead <= LATER_DAYS ? 'later' : null
}

const entryStateOf = (entry) => entry.source === 'series' ? 'expected' : 'on'

const rowOf = ({ entry, state, timeZone, showDay }) => {
  const startMs = Number(entry.startDate)
  const clock = formatClock(startMs, timeZone)
  const [, time, period] = clock.match(/^(.+?)(am|pm)$/i) || [null, clock, '']
  const day = showDay ? formatDate(startMs, timeZone, { weekday: 'short' }).split(',')[0] : ''
  return {
    key: `${entry.programId}-${state === 'expected' ? 'series' : 'timer'}`,
    programId: entry.programId,
    channelId: entry.channelId,
    title: entry.name,
    showKey: showKeyOf(entry.name),
    startMs,
    time,
    period,
    state,
    meta: [day, seasonEpisodeText(entry), entry.episodeTitle, entry.channelName].filter(Boolean).join(' · '),
  }
}

const seasonEpisodeText = ({ season, episode, seriesNo, episodeNo }) => {
  const s = season ?? seriesNo
  const e = episode ?? episodeNo
  if (s == null && e == null) return ''
  return `${s != null ? `S${String(s).padStart(2, '0')}` : ''}${e != null ? `E${String(e).padStart(2, '0')}` : ''}`
}

const watchingMeta = ({ item, timeZone }) => {
  const mode = item.mode === 'record' ? 'record automatically' : 'notify me'
  const start = item.nextMatch?.start
  if (start == null) return `Not in the guide yet · ${mode}`
  const when = `${formatDate(Number(start), timeZone, { weekday: 'short' }).split(',')[0]} ${formatClock(Number(start), timeZone)}`
  const channel = item.nextMatch.channelName
  return [`Next ${when}`, channel, mode].filter(Boolean).join(' · ')
}
