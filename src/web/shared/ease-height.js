import { prefersReducedMotion } from '/shared/utils.js'

export const HEIGHT_EASE_MS = 240
export const HEIGHT_EASING = 'cubic-bezier(0.2, 0, 0, 1)'

export const easeHeightChange = ({ el, fromHeight }) => {
  if (!el?.animate || !fromHeight || prefersReducedMotion()) return
  const toHeight = el.offsetHeight
  if (Math.abs(toHeight - fromHeight) < 1) return
  const clip = 'inset(0 -100vw)'
  el.animate(
    [{ height: `${fromHeight}px`, clipPath: clip }, { height: `${toHeight}px`, clipPath: clip }],
    { duration: HEIGHT_EASE_MS, easing: HEIGHT_EASING },
  )
}
