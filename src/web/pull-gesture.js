export const PULL_SLOP_PX = 6
export const PULL_DEADZONE_PX = 45
export const PULL_TRIGGER_TRAVEL_PX = 70
export const PULL_VERTICAL_RATIO = 2

const rubberBandOf = (dragged, span) => (1 - 1 / ((dragged * 0.55) / span + 1)) * span

export const pullMoveOf = ({ dx, dy, claimed, cancelable = true }) => {
  if (claimed) return 'pull'
  if (!cancelable) return 'abandon'
  const isDownward = dy > 0 && dy > PULL_VERTICAL_RATIO * Math.abs(dx)
  const insideSlop = Math.abs(dx) < PULL_SLOP_PX && Math.abs(dy) < PULL_SLOP_PX
  if (insideSlop) return isDownward ? 'hold' : 'wait'
  return isDownward ? 'pull' : 'abandon'
}

export const pullTravelOf = (dy) => Math.max(0, dy - PULL_SLOP_PX - PULL_DEADZONE_PX)

export const pullProgressOf = (dy) => Math.min(1, pullTravelOf(dy) / PULL_TRIGGER_TRAVEL_PX)

export const pullOffsetOf = ({ dy, span }) => rubberBandOf(pullTravelOf(dy), span)

export const isPullCommitted = (dy) => pullTravelOf(dy) >= PULL_TRIGGER_TRAVEL_PX
