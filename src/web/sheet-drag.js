export const SHEET_DISMISS_SHARE = 0.25
export const SHEET_FLING_PX_PER_MS = 0.5
export const SHEET_DRAG_SLOP_PX = 6
export const SHEET_MAX_LIFT_PX = 16

export const sheetDragOffsetOf = (dy) => (dy >= 0 ? dy : -Math.min(SHEET_MAX_LIFT_PX, -dy / LIFT_RESISTANCE))

export const sheetDragStartOf = ({ dx, dy, fromHandle, scrolledFromTop }) => {
  if (Math.hypot(dx, dy) < SHEET_DRAG_SLOP_PX) return 'wait'
  const isVertical = Math.abs(dy) > Math.abs(dx)
  if (!isVertical) return 'ignore'
  if (fromHandle) return 'drag'
  return dy > 0 && !scrolledFromTop ? 'drag' : 'ignore'
}

export const sheetReleaseOf = ({ offset, height, velocity }) => {
  if (velocity >= SHEET_FLING_PX_PER_MS && offset > 0) return 'close'
  if (velocity <= -SHEET_FLING_PX_PER_MS) return 'stay'
  return height > 0 && offset >= height * SHEET_DISMISS_SHARE ? 'close' : 'stay'
}

export const releaseVelocityOf = (samples) => {
  const last = samples.at(-1)
  if (!last) return 0
  const first = samples.find((sample) => last.at - sample.at <= VELOCITY_WINDOW_MS) ?? last
  const ms = last.at - first.at
  return ms > 0 ? (last.y - first.y) / ms : 0
}

const LIFT_RESISTANCE = 4
const VELOCITY_WINDOW_MS = 100
