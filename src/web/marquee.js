export const MARQUEE_SPEED_PX_S = 30
export const MARQUEE_HOLD_MS = 2_000
export const MARQUEE_FADE_MS = 300
export const MARQUEE_MIN_OVERFLOW_PX = 2

export const marqueePlanOf = ({ contentWidth, boxWidth, reducedMotion = false }) => {
  const shiftPx = Math.ceil(contentWidth - boxWidth)
  if (reducedMotion || !(boxWidth > 0) || !(shiftPx >= MARQUEE_MIN_OVERFLOW_PX)) return null
  return {
    shiftPx,
    scrollMs: Math.round((shiftPx / MARQUEE_SPEED_PX_S) * 1000),
    holdMs: MARQUEE_HOLD_MS,
    fadeMs: MARQUEE_FADE_MS,
  }
}

export const MARQUEE_MAX_CYCLES = 3

export const marqueeKeepsGoing = ({ cyclesDone }) => cyclesDone < MARQUEE_MAX_CYCLES

export const marqueeTextChangeOf = ({ running, contentWidth, boxWidth }) => {
  if (!running) return 'now'
  return marqueePlanOf({ contentWidth, boxWidth }) ? 'at-reset' : 'now'
}
