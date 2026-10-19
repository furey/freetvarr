import { SKIP_STEP_S } from './double-tap.js'

export const behindPillText = (seconds) => {
  const whole = Math.max(1, Math.round(seconds))
  return whole < 60 ? `${whole} SEC BEHIND` : `${Math.round(whole / 60)} MIN BEHIND`
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
