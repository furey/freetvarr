import { formatClock, dateFormat } from './time-format.js'
import { localDayNumber } from './guide-time.js'

export const syncWhen = ({ startedMs, finishedMs = null, nowMs, timeZone }) => {
  const startDay = dayLabel({ ms: startedMs, nowMs, timeZone })
  const startClock = formatClock(startedMs, timeZone)
  if (finishedMs == null) return `${startDay} ${startClock} – now`
  const finishClock = formatClock(finishedMs, timeZone)
  if (!isSameDay({ a: startedMs, b: finishedMs, timeZone })) {
    return `${startDay} ${startClock} – ${dayLabel({ ms: finishedMs, nowMs, timeZone })} ${finishClock}`
  }
  if (startClock === finishClock) return `${startDay} ${startClock}`
  return `${startDay} ${clockRange({ startClock, finishClock })}`
}

export const syncTook = (ms) => {
  if (!Number.isFinite(ms) || ms < 0) return ''
  const seconds = Math.round(ms / 1000)
  if (seconds < 1) return 'under 1s'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

const dayLabel = ({ ms, nowMs, timeZone }) => {
  const daysAgo = localDayNumber({ ms: nowMs, timeZone }) - localDayNumber({ ms, timeZone })
  if (daysAgo === 0) return 'Today'
  if (daysAgo === 1) return 'Yesterday'
  const sameYear = yearOf({ ms, timeZone }) === yearOf({ ms: nowMs, timeZone })
  const options = sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }
  return dateFormat(options, timeZone).format(new Date(ms))
}

const isSameDay = ({ a, b, timeZone }) => localDayNumber({ ms: a, timeZone }) === localDayNumber({ ms: b, timeZone })

const yearOf = ({ ms, timeZone }) => dateFormat({ year: 'numeric' }, timeZone).format(new Date(ms))

const clockRange = ({ startClock, finishClock }) => {
  const period = finishClock.slice(-2)
  const shortStart = startClock.endsWith(period) ? startClock.slice(0, -2) : startClock
  return `${shortStart}–${finishClock}`
}
