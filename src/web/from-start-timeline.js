export const OVERRUN_STEP_S = 10 * 60

export const scheduledSecondsOf = ({ startedAtMs, scheduledEndMs }) => {
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(scheduledEndMs)) return null
  const seconds = (scheduledEndMs - startedAtMs) / 1000
  return seconds > 0 ? seconds : null
}

export const fromStartScaleOf = ({ scheduledSeconds = null, edgeSeconds = 0, heldSeconds = null, finished = false }) => {
  const edge = finiteAtLeastZero(edgeSeconds)
  if (finished) return Math.max(edge, 1)
  const base = Math.max(finiteAtLeastZero(scheduledSeconds), finiteAtLeastZero(heldSeconds))
  if (edge < base) return base
  return edge + OVERRUN_STEP_S
}

export const fromStartTimelineOf = ({ position = 0, edgeSeconds = 0, scaleSeconds }) => {
  const scale = Math.max(finiteAtLeastZero(scaleSeconds), 1)
  const edge = Math.min(finiteAtLeastZero(edgeSeconds), scale)
  const shown = clampFromStartSeek({ value: position, edgeSeconds: edge })
  return {
    position: shown,
    playedPercent: percentOf(shown, scale),
    availablePercent: percentOf(edge, scale),
    edgePercent: percentOf(edge, scale),
  }
}

export const clampFromStartSeek = ({ value, edgeSeconds }) =>
  Math.max(0, Math.min(finiteAtLeastZero(value), finiteAtLeastZero(edgeSeconds)))

export const fromStartEndMsOf = ({ startedAtMs, scaleSeconds }) =>
  (Number.isFinite(startedAtMs) && Number.isFinite(scaleSeconds) ? startedAtMs + scaleSeconds * 1000 : null)

const percentOf = (value, scale) => Math.round((value / scale) * 100_000) / 1000

const finiteAtLeastZero = (value) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0)
