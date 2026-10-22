export const PULL_SLOP_PX = 6

export const pullMoveOf = ({ dx, dy, claimed }) => {
  if (claimed) return 'pull'
  const isDownward = dy > 0 && dy >= Math.abs(dx)
  const insideSlop = Math.abs(dx) < PULL_SLOP_PX && Math.abs(dy) < PULL_SLOP_PX
  if (insideSlop) return isDownward ? 'hold' : 'wait'
  return isDownward ? 'pull' : 'abandon'
}
