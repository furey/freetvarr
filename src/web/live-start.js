export const LIVE_START_BUFFER_S = 3
export const LIVE_START_MAX_WAIT_MS = 4_000
export const SEEK_FLOOR_MARGIN_S = 4

export const bufferedAhead = ({ ranges, position }) => {
  const range = ranges.find(([start, end]) => start - GAP_TOLERANCE_S <= position && position < end)
  return range ? range[1] - Math.max(position, range[0]) : 0
}

export const isReadyToStart = ({ ranges, position, waitedMs }) =>
  waitedMs >= LIVE_START_MAX_WAIT_MS || bufferedAhead({ ranges, position }) >= LIVE_START_BUFFER_S

export const seekFloorOf = ({ oldest, target }) => {
  if (oldest == null) return null
  const floor = oldest + SEEK_FLOOR_MARGIN_S
  if (target == null) return floor
  return Math.max(oldest, Math.min(floor, target - SEEK_FLOOR_MARGIN_S))
}

const GAP_TOLERANCE_S = 0.5
