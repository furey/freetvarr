export const FINISHING_TEXT = 'finishing'
export const UNDER_A_MINUTE_TEXT = 'less than a minute left'

export const recordingEndMsOf = ({ stop, stopPadded } = {}) => msOf(stopPadded) ?? msOf(stop)

export const recordingLeftText = ({ recording, nowMs, minutesText = shortMinutesText }) => {
  const endMs = recordingEndMsOf(recording)
  if (endMs == null || !Number.isFinite(nowMs)) return ''
  const leftMs = endMs - nowMs
  if (leftMs <= 0) return FINISHING_TEXT
  if (leftMs < MINUTE_MS) return UNDER_A_MINUTE_TEXT
  return `${minutesText(Math.ceil(leftMs / MINUTE_MS))} left`
}

const shortMinutesText = (count) => `${count} min`

const msOf = (value) => {
  if (value == null || value === '') return null
  const ms = typeof value === 'number' ? value : Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

const MINUTE_MS = 60_000
