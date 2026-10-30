export const PULL_SLOP_PX = 6
export const PULL_VERTICAL_RATIO = 2
export const PULL_RUBBER_SPAN_PX = 600
export const PULL_RUBBER_COEFFICIENT = 0.6
export const PULL_REVEAL_OFFSET_PX = 32
export const PULL_COMMIT_OFFSET_PX = 80

const rubberBandOf = (dragged) => {
  const stretch = (dragged * PULL_RUBBER_COEFFICIENT) / PULL_RUBBER_SPAN_PX
  return (1 - 1 / (stretch + 1)) * PULL_RUBBER_SPAN_PX
}

export const pullMoveOf = ({ dx, dy, claimed, cancelable = true }) => {
  if (claimed) return 'pull'
  if (!cancelable) return 'abandon'
  const isDownward = dy > 0 && dy > PULL_VERTICAL_RATIO * Math.abs(dx)
  const insideSlop = Math.abs(dx) < PULL_SLOP_PX && Math.abs(dy) < PULL_SLOP_PX
  if (insideSlop) return isDownward ? 'hold' : 'wait'
  return isDownward ? 'pull' : 'abandon'
}

export const pullOffsetOf = (dy) => rubberBandOf(Math.max(0, dy - PULL_SLOP_PX))

export const pullProgressOf = (offset) => {
  const span = PULL_COMMIT_OFFSET_PX - PULL_REVEAL_OFFSET_PX
  return Math.min(1, Math.max(0, (offset - PULL_REVEAL_OFFSET_PX) / span))
}

export const isPullCommitted = (offset) => offset >= PULL_COMMIT_OFFSET_PX
