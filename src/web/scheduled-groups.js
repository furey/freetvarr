import { localDayNumber, weekdayOfDayNumber } from './guide-time.js'
import { formatClock, formatDate } from './time-format.js'
import { showKeyOf } from './show-key.js'
import { showImageUrlOf } from './artwork-stamps.js'

const LATER_DAYS = 6
const MINUTE_MS = 60_000
const DAY_MS = 86_400_000
const THUMB_IMAGE_WIDTH = 384

export const SCHEDULED_SECTIONS = [
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'later', label: 'Later this week' },
]

export const groupScheduled = ({
  upcoming = [],
  skipped = [],
  repeats = [],
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
    ...repeats.map((entry) => ({ entry, state: 'repeat' })),
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
  for (const rows of Object.values(groups)) rows.sort(byScheduledOrder)
  return groups
}

export const byScheduledOrder = (a, b) =>
  a.startMs - b.startMs
  || naturalCompare(a.channelName, b.channelName)
  || naturalCompare(a.title, b.title)
  || naturalCompare(a.programId, b.programId)

const naturalCompare = (a, b) =>
  String(a ?? '').localeCompare(String(b ?? ''), 'en', { numeric: true, sensitivity: 'base' })

export const recordingNowRows = ({ active = [], nowMs = Date.now() } = {}) =>
  active.filter((r) => !r.failed).map((r) => ({
    key: r.uuid,
    programId: r.programId,
    title: r.title,
    showKey: showKeyOf(r.title),
    meta: [...episodeMetaParts(r), r.channelName, minutesLeftText({ stop: r.stop, nowMs })]
      .filter(Boolean).join(' · '),
    percent: progressPercent({ start: r.start, stop: r.stop, nowMs }),
    thumbSrc: thumbSrcOf(r),
  }))

export const watchingRows = ({ items = [], timeZone = 'UTC' } = {}) =>
  items.map((item) => ({
    key: String(item.id),
    id: item.id,
    title: item.title,
    unseen: item.unseen || 0,
    meta: watchingMeta({ item, timeZone }),
  }))

export const weekStrip = ({ groups, recordingNowCount = 0, clashDays = [], nowMs = Date.now(), timeZone = 'UTC' }) => {
  const today = localDayNumber({ ms: nowMs, timeZone })
  const clashDaySet = new Set(clashDays)
  const counts = new Map()
  for (const row of Object.values(groups).flat()) {
    if (isSkippedRow(row)) continue
    counts.set(row.dayNumber, (counts.get(row.dayNumber) || 0) + 1)
  }
  return Array.from({ length: LATER_DAYS + 1 }, (_, offset) => {
    const dayNumber = today + offset
    const count = (counts.get(dayNumber) || 0) + (offset === 0 ? recordingNowCount : 0)
    return {
      dayNumber,
      weekday: weekdayOfDayNumber(dayNumber),
      date: new Date(dayNumber * DAY_MS).getUTCDate(),
      count,
      countText: count ? `${count} rec` : '—',
      isToday: offset === 0,
      hasClash: clashDaySet.has(dayNumber),
    }
  })
}

export const durationText = ({ start, end }) => {
  const minutes = Math.round((Number(end) - Number(start)) / MINUTE_MS)
  if (!(minutes > 0)) return ''
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest}m`
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

export const scheduledCountOfState = ({ state, skipped = [], activeProgramIds = [], nowMs = Date.now(), timeZone = 'UTC' }) =>
  scheduledCount(groupScheduled({
    upcoming: state?.upcomingRecordings || [],
    skipped: [...(state?.skippedRecordings || []), ...skipped],
    repeats: state?.repeatRecordings || [],
    activeProgramIds: [...(state?.activeRecordingIds || []), ...activeProgramIds],
    nowMs,
    timeZone,
  }))

export const scheduledCount = (groups) =>
  Object.values(groups).flat().filter((row) => !isSkippedRow(row)).length

export const repeatCount = (groups) =>
  Object.values(groups).flat().filter((row) => row.state === 'repeat').length

export const repeatsChipOf = ({ loaded, total, showRepeats }) => {
  if (!loaded) return { kind: 'loading' }
  if (!total) {
    return { kind: 'chip', text: 'No repeats', countText: '', label: 'No repeats coming up', pressed: null, disabled: true }
  }
  const repeats = total === 1 ? '1 repeat' : `${total} repeats`
  return {
    kind: 'chip',
    text: 'Show repeats',
    countText: `(${total})`,
    label: `Show repeats, ${repeats}`,
    pressed: String(Boolean(showRepeats)),
    disabled: false,
  }
}

export const withoutRepeats = (groups) =>
  Object.fromEntries(Object.entries(groups).map(([key, rows]) => [key, rows.filter((row) => row.state !== 'repeat')]))

export const isSkippedRow = (row) => row.state === 'off' || row.state === 'repeat'

export const repeatOriginalText = ({ repeatOf, timeZone = 'UTC' }) => {
  if (!repeatOf) return ''
  if (repeatOf.status === 'recording') return 'recording now'
  return `${ORIGINAL_STATUS_WORDS[repeatOf.status] || 'scheduled'} ${airingWhenOf({ repeatOf, timeZone })}`
}

export const repeatSkippedText = ({ repeatOf, timeZone = 'UTC' }) => {
  if (!repeatOf) return 'already recorded'
  if (repeatOf.status === 'recording') return 'recording now'
  const when = airingWhenOf({ repeatOf, timeZone })
  if (repeatOf.status === 'skipped') return `already skipped ${when}`
  return repeatOf.status === 'recorded' ? `recorded ${when}` : `records ${when} instead`
}

const ORIGINAL_STATUS_WORDS = { recorded: 'recorded', skipped: 'skipped', scheduled: 'scheduled' }

export const repeatNoticeOf = ({ repeatOf, timeZone = 'UTC' }) => repeatOf?.status === 'skipped'
  ? `Repeat of the episode you skipped ${airingWhenOf({ repeatOf, timeZone })}, so it won't record.`
  : `Repeat of the episode ${repeatOriginalPhraseOf({ repeatOf, timeZone })}, so it won't record. If that one fails, this one records.`

const repeatOriginalPhraseOf = ({ repeatOf, timeZone }) => {
  if (!repeatOf) return 'already recorded'
  if (repeatOf.status === 'recording') return 'recording now'
  const when = airingWhenOf({ repeatOf, timeZone })
  return repeatOf.status === 'recorded' ? `recorded ${when}` : `scheduled for ${when}`
}

const airingWhenOf = ({ repeatOf, timeZone }) => {
  const startMs = Number(repeatOf.startDate)
  const day = formatDate(startMs, timeZone, { weekday: 'short' }).split(',')[0]
  return `${day} ${formatClock(startMs, timeZone)}`
}

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
    dayNumber: localDayNumber({ ms: startMs, timeZone }),
    day,
    thumbSrc: thumbSrcOf({ ...entry, title: entry.name }),
    key: `${entry.programId}-${rowKeySuffixOf(state)}`,
    programId: entry.programId,
    channelId: entry.channelId,
    channelName: entry.channelName || '',
    title: entry.name,
    showKey: showKeyOf(entry.name),
    startMs,
    time,
    period,
    state,
    repeatText: state === 'repeat' ? repeatSkippedText({ repeatOf: entry.repeatOf, timeZone }) : '',
    meta: [
      ...episodeMetaParts(entry),
      entry.channelName,
      durationText({ start: entry.startDate, end: entry.endDate }),
    ].filter(Boolean).join(' · '),
  }
}

const rowKeySuffixOf = (state) => {
  if (state === 'expected') return 'series'
  if (state === 'repeat') return 'repeat'
  return 'timer'
}

const PLACEHOLDER_EPISODE_TITLE = /^\s*episode\s+(\d+)(?:\s+of\s+season\s+(\d+))?\s*$/i

export const isPlaceholderEpisodeTitle = (title) => PLACEHOLDER_EPISODE_TITLE.test(String(title ?? ''))

export const episodeMetaParts = ({ season, episode, seriesNo, episodeNo, episodeTitle } = {}) => {
  const placeholder = String(episodeTitle ?? '').match(PLACEHOLDER_EPISODE_TITLE)
  const s = season ?? seriesNo ?? (placeholder?.[2] != null ? Number(placeholder[2]) : null)
  const e = episode ?? episodeNo ?? (placeholder ? Number(placeholder[1]) : null)
  return [seasonEpisodeText({ season: s, episode: e }), placeholder ? null : episodeTitle].filter(Boolean)
}

const seasonEpisodeText = ({ season, episode }) =>
  [season != null ? `S${season}` : '', episode != null ? `E${episode}` : ''].filter(Boolean).join(' ')

const watchingMeta = ({ item, timeZone }) => {
  const mode = item.mode === 'record' ? 'record automatically' : 'list only'
  const padding = item.mode === 'record' ? watchPaddingText(item) : ''
  const start = item.nextMatch?.start
  if (start == null) return ['Not in the guide yet', mode, padding].filter(Boolean).join(' · ')
  const when = `${formatDate(Number(start), timeZone, { weekday: 'short' }).split(',')[0]} ${formatClock(Number(start), timeZone)}`
  const channel = item.nextMatch.channelName
  return [`Next ${when}`, channel, mode, padding].filter(Boolean).join(' · ')
}

const watchPaddingText = ({ leadTime, lagTime }) => [
  leadTime != null && `starts ${leadTime}m early`,
  lagTime != null && `finishes ${lagTime}m late`,
].filter(Boolean).join(', ')

export const thumbSrcOf = ({ hasImage, programId, title }) => (hasImage && programId != null
  ? `/api/epg/image/${encodeURIComponent(programId)}?w=${THUMB_IMAGE_WIDTH}`
  : showImageUrlOf({ title, width: THUMB_IMAGE_WIDTH }))
