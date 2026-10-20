export const IMAGES_SLIDE_MS = 300
export const IMAGES_STAGGER_SPAN_MS = 100
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
const THUMB_HIDDEN = { opacity: 0, transform: 'translateX(-24px) scale(0.86)' }
const THUMB_SHOWN = { opacity: 1, transform: 'none' }
const TEXT_SELECTOR = '.epg-cell:is(.with-thumb, .maybe-thumb) .epg-cell-text'

export const staggerDelayOf = ({ rect, view, spanMs = IMAGES_STAGGER_SPAN_MS }) => {
  const reach = view.width + view.height
  if (reach <= 0) return 0
  const along = (rect.left - view.left) + (rect.top - view.top)
  return Math.min(spanMs, Math.max(0, (along / reach) * spanMs))
}

export const animateImagesToggle = async ({ scrollEl, flip, settle }) => {
  if (!scrollEl || prefersReducedMotion()) {
    await flip()
    return
  }
  scrollEl.getAnimations({ subtree: true }).forEach((a) => a.cancel())
  const before = new Map(visibleTexts(scrollEl).map(({ el, rect }) => [el, rect.left]))
  const goingOff = await flip()
  const view = scrollEl.getBoundingClientRect()
  const animations = [...before].filter(([el]) => el.isConnected).flatMap(([el, oldLeft]) => {
    const rect = el.getBoundingClientRect()
    const delay = staggerDelayOf({ rect, view })
    const dx = oldLeft - rect.left
    const thumb = el.parentElement.querySelector(':scope > .programme-image.cell')
    return [
      Math.abs(dx) > 0.5 ? slideText({ el, dx, delay }) : null,
      thumb ? fadeThumb({ el: thumb, goingOff, delay }) : null,
    ].filter(Boolean)
  })
  await Promise.allSettled(animations.map((a) => a.finished))
  animations.forEach((a) => { if (a.effect?.target?.matches('.programme-image')) a.cancel() })
  settle()
}

const visibleTexts = (scrollEl) => {
  const view = scrollEl.getBoundingClientRect()
  return [...scrollEl.querySelectorAll(TEXT_SELECTOR)]
    .map((el) => ({ el, rect: el.getBoundingClientRect() }))
    .filter(({ rect }) => isOnScreen(rect, view))
}

const isOnScreen = (rect, view) =>
  rect.right > view.left && rect.left < view.right && rect.bottom > view.top && rect.top < view.bottom

const slideText = ({ el, dx, delay }) => el.animate(
  [{ transform: `translateX(${dx}px)` }, { transform: 'none' }],
  { duration: IMAGES_SLIDE_MS, delay, easing: EASE, fill: 'backwards' },
)

const fadeThumb = ({ el, goingOff, delay }) => el.animate(
  goingOff ? [THUMB_SHOWN, THUMB_HIDDEN] : [THUMB_HIDDEN, THUMB_SHOWN],
  { duration: goingOff ? IMAGES_SLIDE_MS * 0.7 : IMAGES_SLIDE_MS, delay, easing: EASE, fill: 'both' },
)

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
