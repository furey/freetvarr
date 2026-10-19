import { seekFloorOf } from './live-start.js'

export const NATIVE_LIVE_HOLD_BACK_S = 6
export const MIN_REWIND_S = 4

export const rangesOf = (timeRanges) => (timeRanges
  ? Array.from({ length: timeRanges.length }, (_, i) => [timeRanges.start(i), timeRanges.end(i)])
  : [])

export const videoLiveInputOf = (video) => ({
  seekable: rangesOf(video.seekable),
  duration: video.duration,
  currentTime: video.currentTime,
})

export const EDGE_DRIFT_PER_S = 0.02
export const EDGE_RESET_S = 30

export const liveWindowOf = (input) => windowOf({ ...input, ...liveEdgesOf(input) })

export const steadyLiveWindowOf = ({ anchor = null, wallS, ...input }) => {
  const nextAnchor = steadyAnchorOf({ anchor, ...liveEdgesOf(input), wallS })
  if (!nextAnchor) return { ...liveWindowOf(input), anchor: null }
  return { ...windowOf({ ...input, ...edgesAt({ anchor: nextAnchor, wallS }) }), anchor: nextAnchor }
}

export const steadyAnchorOf = ({ anchor = null, target, oldest, wallS }) => {
  if (target == null || !Number.isFinite(wallS)) return null
  const sample = { targetOffset: target - wallS, oldestOffset: oldest == null ? null : oldest - wallS, wallS }
  if (!anchor || Math.abs(sample.targetOffset - anchor.targetOffset) > EDGE_RESET_S) return sample
  const drift = Math.max(0, wallS - anchor.wallS) * EDGE_DRIFT_PER_S
  return {
    targetOffset: Math.max(sample.targetOffset, anchor.targetOffset - drift),
    oldestOffset: lowerOffsetOf({ sample: sample.oldestOffset, held: anchor.oldestOffset, drift }),
    wallS,
  }
}

export const canRewind = ({ span }) => span >= MIN_REWIND_S

const liveEdgesOf = ({ seekable = [], duration = NaN, hlsSyncPosition = null, hlsOldestSecond = null }) => {
  const edge = seekableEndOf({ seekable, duration })
  return {
    target: liveTargetOf({ edge, seekable, hlsSyncPosition }),
    oldest: finiteOrNull(hlsOldestSecond) ?? seekableStartOf(seekable),
  }
}

const windowOf = ({ target, oldest, currentTime = 0, fromStart = false, bufferSeconds = 0 }) => {
  const floor = fromStart ? 0 : bufferFloorOf({ floor: seekFloorOf({ oldest, target }), target, bufferSeconds })
  const behind = target == null ? 0 : Math.max(0, target - currentTime)
  return { target, floor, behind, span: rewindSpanOf({ floor, target }) }
}

const edgesAt = ({ anchor, wallS }) => ({
  target: anchor.targetOffset + wallS,
  oldest: anchor.oldestOffset == null ? null : anchor.oldestOffset + wallS,
})

const lowerOffsetOf = ({ sample, held, drift }) => {
  if (sample == null || held == null || sample - held > EDGE_RESET_S) return sample
  return Math.min(sample, held + drift)
}

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
