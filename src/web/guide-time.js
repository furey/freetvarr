export const zoneOffsetMs = ({ ms, timeZone }) => {
  const parts = Object.fromEntries(wallClockFormat(timeZone).formatToParts(new Date(ms))
    .map(({ type, value }) => [type, Number(value)]))
  const wallMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return wallMs - Math.floor(ms / 1000) * 1000
}

export const localDayNumber = ({ ms, timeZone }) =>
  Math.floor((ms + zoneOffsetMs({ ms, timeZone })) / DAY_MS)

export const weekdayOfDayNumber = (dayNumber) =>
  weekdayFormat.format(new Date(dayNumber * DAY_MS + DAY_MS / 2))

export const localClockMs = ({ dayStart, hour, timeZone }) => {
  const elapsedMs = dayStart + hour * HOUR_MS
  return elapsedMs + zoneOffsetMs({ ms: dayStart, timeZone }) - zoneOffsetMs({ ms: elapsedMs, timeZone })
}

export const dayLengthMin = ({ dayStart, dayEnd }) => (dayEnd - dayStart) / MINUTE_MS

export const rulerTickMinutes = ({ dayStart, dayEnd, stepMin }) =>
  Array.from({ length: Math.ceil(dayLengthMin({ dayStart, dayEnd }) / stepMin) }, (_, i) => i * stepMin)

const wallClockFormatters = new Map()

const wallClockFormat = (timeZone) => {
  if (!wallClockFormatters.has(timeZone)) {
    wallClockFormatters.set(timeZone, new Intl.DateTimeFormat('en-AU', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    }))
  }
  return wallClockFormatters.get(timeZone)
}

const weekdayFormat = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'short' })

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
