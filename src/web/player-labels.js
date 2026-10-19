import { SKIP_STEP_S } from './double-tap.js'

export const BEHIND_SHOWN_FROM_S = 15
export const LIVE_SHOWN_UNDER_S = 10
export const MINUTE_HYSTERESIS_S = 10

export const steadyBehindMinutesOf = ({ seconds, previous = 0 }) => {
  if (!Number.isFinite(seconds)) return previous
  if (previous === 0) return seconds >= BEHIND_SHOWN_FROM_S ? wholeMinutesOf(seconds) : 0
  if (seconds < LIVE_SHOWN_UNDER_S) return 0
  const distance = Math.abs(seconds - previous * 60)
  return distance <= 30 + MINUTE_HYSTERESIS_S ? previous : wholeMinutesOf(seconds)
}

export const behindPillText = (minutes) => `${Math.max(1, minutes)} MIN BEHIND`

export const behindLabelOf = (minutes) => `${Math.max(1, minutes)} min behind`

export const liveEdgeOf = ({ behindMinutes = 0, fromStart = false }) => {
  const behind = Boolean(fromStart) || behindMinutes > 0
  return behind
    ? { atEdge: false, label: behindLabelOf(behindMinutes) }
    : { atEdge: true, label: '' }
}

export const leftPillText = (seconds) => `${Math.max(1, Math.ceil(seconds / 60))} MIN LEFT`

export const liveHintText = (bufferSeconds) => {
  const skip = `Double-tap either side to skip ${SKIP_STEP_S} seconds.`
  const minutes = Math.floor(bufferSeconds / 60)
  return minutes > 0 ? `Pause or rewind up to ${minutes} minutes. ${skip}` : skip
}

export const percentWithin = ({ value, min, max }) => {
  if (!(max > min)) return 0
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
}

export const adMarkersOf = ({ breaks = [], duration }) => {
  if (!(duration > 0)) return []
  return breaks
    .filter((b) => b.end > b.start)
    .map((b) => {
      const left = percentWithin({ value: b.start, min: 0, max: duration })
      const right = percentWithin({ value: b.end, min: 0, max: duration })
      return { left, width: right - left }
    })
}

export const programmeRangeText = ({ program, clockText }) =>
  (program ? `${clockText(program.start)}–${clockText(program.end)}` : '')

export const joinedParts = (parts) => parts.filter(Boolean).join(' · ')

const wholeMinutesOf = (seconds) => Math.max(1, Math.round(seconds / 60))
