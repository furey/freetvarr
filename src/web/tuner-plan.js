import { zoneOffsetMs, localDayNumber } from './guide-time.js'
import { formatClock } from './time-format.js'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const WINDOW_LEAD_MS = 90 * MINUTE_MS
const WINDOW_SPAN_MS = 5 * HOUR_MS
const EVENING_HOUR = 17
const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth']
const NUMBER_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

export const planTuners = ({ recordings = [], tunerCount } = {}) => {
  if (!(tunerCount > 0)) return null
  const lanes = Array.from({ length: tunerCount }, () => [])
  const clashes = []
  for (const recording of sortedRecordings(recordings)) {
    const laneIndex = lanes.findIndex((lane) => laneAccepts({ lane, recording }))
    if (laneIndex >= 0) {
      lanes[laneIndex].push(recording)
      continue
    }
    const { index, freeAt } = earliestFreeLane({ lanes, recording })
    const to = Math.min(freeAt, recording.end)
    clashes.push({ ...recording, from: recording.start, to })
    if (to < recording.end) lanes[index].push({ ...recording, start: to, joinedLate: true })
  }
  return { tunerCount, lanes, clashes: withTunersNeeded({ clashes, tunerCount }) }
}

export const tunerRecordingsOf = ({ futureRecordings = [], upcoming = [], seriesTags = [], skippedIds = [] } = {}) => {
  const skipped = new Set(skippedIds.map(String))
  const tagByLink = new Map(seriesTags.map((tag) => [String(tag.seriesLinkId), tag]))
  const timers = futureRecordings.map((r) => ({
    id: String(r.programId ?? r.uuid),
    title: r.name,
    start: Number(r.paddedStartDate ?? r.startDate),
    end: Number(r.paddedEndDate ?? r.endDate),
    mux: r.mux ?? null,
  }))
  const expected = upcoming.filter((entry) => entry.source === 'series').map((entry) => {
    const tag = tagByLink.get(String(entry.seriesLinkId))
    return {
      id: String(entry.programId),
      title: entry.name,
      start: Number(entry.startDate) - (tag?.leadTime || 0) * MINUTE_MS,
      end: Number(entry.endDate) + (tag?.lagTime || 0) * MINUTE_MS,
      mux: entry.mux ?? null,
    }
  })
  return [...timers, ...expected].filter((r) => !skipped.has(r.id))
}

export const clashById = (plan) => new Map((plan?.clashes || []).map((clash) => [String(clash.id), clash]))

export const clashRangeText = ({ clash, timeZone, joiner = '–' }) =>
  clockRangeText({ from: clash.from, to: clash.to, timeZone, joiner })

export const clashSentence = ({ clash, timeZone }) => {
  const needed = clash.tunersNeeded
  const range = clashRangeText({ clash, timeZone, joiner: ' to ' })
  const lead = `${clash.title} needs a ${ordinalOf(needed)} tuner from ${range}.`
  const skip = `Skip one of the ${numberWordOf(needed)}`
  if (clash.to >= clash.end) return `${lead} ${skip}, or it does not record at all.`
  return `${lead} ${skip}, or it misses its first ${minutesText(clash.to - clash.from)}.`
}

export const tonightTimeline = ({ plan, nowMs, timeZone }) => {
  if (!plan) return null
  const anchorMs = timelineAnchor({ plan, nowMs, timeZone })
  const start = floorToHour({ ms: anchorMs, timeZone }) - WINDOW_LEAD_MS
  const end = start + WINDOW_SPAN_MS
  const place = placerFor({ start, end, nowMs })
  const lanes = plan.lanes.map((lane, index) => ({
    key: `tuner-${index + 1}`,
    label: `Tuner ${index + 1}`,
    bars: lane.filter((r) => !r.joinedLate).map(place).filter(Boolean),
  }))
  const clashBars = plan.clashes.map(place).filter(Boolean)
  const clashes = plan.clashes.filter((clash) => clash.end > start && clash.start < end)
  return {
    lanes,
    clashBars,
    clashes,
    isEmpty: clashBars.length === 0 && lanes.every((lane) => lane.bars.length === 0),
    nowPercent: nowMs >= start && nowMs <= end ? percentOf({ ms: nowMs, start, end }) : null,
    ticks: hourTicks({ start, end, timeZone }),
    title: timelineTitle({ anchorMs, nowMs, timeZone }),
  }
}

export const timelineTitle = ({ anchorMs, nowMs, timeZone }) => {
  const daysAhead = localDayNumber({ ms: anchorMs, timeZone }) - localDayNumber({ ms: nowMs, timeZone })
  if (daysAhead === 0) return localHourOf({ ms: anchorMs, timeZone }) >= EVENING_HOUR ? "Tonight's tuners" : "Today's tuners"
  if (daysAhead === 1) return "Tomorrow's tuners"
  return `${longWeekdayOf({ ms: anchorMs, timeZone })}'s tuners`
}

const localHourOf = ({ ms, timeZone }) =>
  Math.floor((((ms + zoneOffsetMs({ ms, timeZone })) % DAY_MS) + DAY_MS) % DAY_MS / HOUR_MS)

const longWeekdayOf = ({ ms, timeZone }) =>
  new Intl.DateTimeFormat('en-AU', { weekday: 'long', timeZone }).format(new Date(ms))

const timelineAnchor = ({ plan, nowMs, timeZone }) => {
  const start = floorToHour({ ms: nowMs, timeZone }) - WINDOW_LEAD_MS
  const all = [...plan.lanes.flat(), ...plan.clashes]
  const firstClash = plan.clashes.find((clash) => clash.end > nowMs && clash.from < nowMs + DAY_MS)
  const clashInWindow = firstClash && firstClash.from < start + WINDOW_SPAN_MS - HOUR_MS
  if (firstClash && !clashInWindow) return firstClash.from + WINDOW_LEAD_MS - HOUR_MS
  if (all.some((r) => r.end > start && r.start < start + WINDOW_SPAN_MS)) return nowMs
  const next = all.filter((r) => r.start > nowMs && r.start < nowMs + DAY_MS).sort((a, b) => a.start - b.start)[0]
  return next ? next.start + WINDOW_LEAD_MS - HOUR_MS : nowMs
}

const sortedRecordings = (recordings) => recordings
  .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start)
  .sort((a, b) => a.start - b.start || a.end - b.end)

const laneAccepts = ({ lane, recording }) => lane
  .filter((other) => other.end > recording.start)
  .every((other) => recording.mux != null && other.mux === recording.mux)

const earliestFreeLane = ({ lanes, recording }) => lanes
  .map((lane, index) => ({
    index,
    freeAt: Math.max(...lane.filter((other) => other.end > recording.start).map((other) => other.end)),
  }))
  .reduce((best, lane) => lane.freeAt < best.freeAt ? lane : best)

const withTunersNeeded = ({ clashes, tunerCount }) => clashes.map((clash) => ({
  ...clash,
  tunersNeeded: tunerCount + clashes.filter((other) => other.from <= clash.from && other.to > clash.from).length,
}))

const placerFor = ({ start, end, nowMs }) => (recording) => {
  if (recording.end <= start || recording.start >= end) return null
  const left = percentOf({ ms: Math.max(recording.start, start), start, end })
  const right = percentOf({ ms: Math.min(recording.end, end), start, end })
  return {
    key: String(recording.id),
    title: recording.title,
    left,
    width: right - left,
    isRecording: recording.start <= nowMs && recording.end > nowMs,
  }
}

const percentOf = ({ ms, start, end }) =>
  Math.round(Math.min(100, Math.max(0, ((ms - start) / (end - start)) * 100)) * 100) / 100

const floorToHour = ({ ms, timeZone }) => {
  const offset = zoneOffsetMs({ ms, timeZone })
  return Math.floor((ms + offset) / HOUR_MS) * HOUR_MS - offset
}

const hourTicks = ({ start, end, timeZone }) => {
  const ticks = []
  for (let ms = floorToHour({ ms: start, timeZone }) + HOUR_MS; ms < end; ms += HOUR_MS) {
    ticks.push({ key: String(ms), label: hourLabel({ ms, timeZone }), percent: percentOf({ ms, start, end }) })
  }
  return ticks
}

const hourLabel = ({ ms, timeZone }) => spacedPeriod(formatClock(ms, timeZone).replace(':00', ''))

const clockRangeText = ({ from, to, timeZone, joiner }) => {
  const [fromTime, fromPeriod] = clockParts(formatClock(from, timeZone))
  const [toTime, toPeriod] = clockParts(formatClock(to, timeZone))
  const fromText = fromPeriod === toPeriod ? fromTime : `${fromTime} ${fromPeriod}`
  return `${fromText}${joiner}${toTime} ${toPeriod}`
}

const clockParts = (clock) => {
  const [, time, period] = clock.match(/^(.+?)\s?(am|pm)$/i) || [null, clock, '']
  return [time, period.toLowerCase()]
}

const spacedPeriod = (clock) => clockParts(clock).filter(Boolean).join(' ')

const minutesText = (ms) => {
  const minutes = Math.max(1, Math.round(ms / MINUTE_MS))
  return `${minutes} minute${minutes === 1 ? '' : 's'}`
}

const ordinalOf = (n) => ORDINALS[n - 1] || `${n}th`

const numberWordOf = (n) => NUMBER_WORDS[n - 1] || String(n)
