import { seekFloorOf } from './live-start.js'

export const NATIVE_LIVE_HOLD_BACK_S = 6
export const MIN_REWIND_S = 4

export const rangesOf = (timeRanges) => (timeRanges
  ? Array.from({ length: timeRanges.length }, (_, i) => [timeRanges.start(i), timeRanges.end(i)])
  : [])

export const liveWindowOf = ({
  seekable = [],
  duration = NaN,
  currentTime = 0,
  hlsSyncPosition = null,
  hlsOldestSecond = null,
  fromStart = false,
  bufferSeconds = 0,
}) => {
  const edge = seekableEndOf({ seekable, duration })
  const target = liveTargetOf({ edge, seekable, hlsSyncPosition })
  const oldest = finiteOrNull(hlsOldestSecond) ?? seekableStartOf(seekable)
  const floor = fromStart ? 0 : bufferFloorOf({ floor: seekFloorOf({ oldest, target }), target, bufferSeconds })
  const behind = target == null ? 0 : Math.max(0, target - currentTime)
  return { target, floor, behind, span: rewindSpanOf({ floor, target }) }
}

export const canRewind = ({ span }) => span >= MIN_REWIND_S

const seekableEndOf = ({ seekable, duration }) => {
  const end = seekable.length ? finiteOrNull(seekable[seekable.length - 1][1]) : null
  return end ?? finiteOrNull(duration)
}

const seekableStartOf = (seekable) => (seekable.length ? finiteOrNull(seekable[0][0]) : null)

const liveTargetOf = ({ edge, seekable, hlsSyncPosition }) => {
  const synced = finiteOrNull(hlsSyncPosition)
  if (synced != null) return edge == null ? synced : Math.min(synced, edge)
  if (edge == null) return null
  const start = seekableStartOf(seekable) ?? 0
  return Math.max(start, edge - NATIVE_LIVE_HOLD_BACK_S)
}

const bufferFloorOf = ({ floor, target, bufferSeconds }) => {
  if (floor == null || target == null || !(bufferSeconds > 0)) return floor
  return Math.min(target, Math.max(floor, target - bufferSeconds))
}

const rewindSpanOf = ({ floor, target }) => (floor == null || target == null ? 0 : Math.max(0, target - floor))

const finiteOrNull = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null)
