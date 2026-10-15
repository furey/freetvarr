export const SCROLL_TOLERANCE_PX = 1
export const NUDGE_DELAY_MS = 700
export const NUDGE_DISTANCE_PX = 80
export const NUDGE_OUT_MS = 260
export const NUDGE_BACK_MS = 340

export const fadeEdges = ({ scrollLeft, scrollWidth, clientWidth }) => {
  const hiddenRight = scrollWidth - clientWidth - scrollLeft
  return {
    left: scrollLeft > SCROLL_TOLERANCE_PX,
    right: hiddenRight > SCROLL_TOLERANCE_PX,
  }
}

export const nudgeDecision = ({ alreadyShown, reducedMotion, userTouched, scrollLeft, scrollWidth, clientWidth }) => {
  if (alreadyShown) return 'skip'
  if (userTouched) return 'mark'
  if (reducedMotion) return 'skip'
  if (scrollLeft > SCROLL_TOLERANCE_PX) return 'skip'
  if (!fadeEdges({ scrollLeft, scrollWidth, clientWidth }).right) return 'skip'
  return 'run'
}

export const nudgeOffsetAt = ({ elapsedMs, distancePx = NUDGE_DISTANCE_PX }) => {
  if (elapsedMs <= 0) return 0
  if (elapsedMs < NUDGE_OUT_MS) return distancePx * easeOutCubic(elapsedMs / NUDGE_OUT_MS)
  const backMs = elapsedMs - NUDGE_OUT_MS
  if (backMs >= NUDGE_BACK_MS) return 0
  return distancePx * (1 - easeInOutCubic(backMs / NUDGE_BACK_MS))
}

export const NUDGE_TOTAL_MS = NUDGE_OUT_MS + NUDGE_BACK_MS

const easeOutCubic = (t) => 1 - (1 - t) ** 3

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2)
