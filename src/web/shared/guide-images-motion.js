export const IMAGES_SLIDE_MS = 300
export const IMAGES_STAGGER_SPAN_MS = 100
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
const THUMB_HIDDEN = { opacity: 0, transform: 'translateX(-24px) scale(0.86)' }
const THUMB_SHOWN = { opacity: 1, transform: 'none' }
const GUIDE_TEXT_SELECTOR = '.epg-cell:is(.with-thumb, .maybe-thumb) .epg-cell-text'
const guideThumbOf = (text) => text.parentElement.querySelector(':scope > .programme-image.cell')

export const staggerDelayOf = ({ rect, view, spanMs = IMAGES_STAGGER_SPAN_MS }) => {
  const reach = view.width + view.height
  if (reach <= 0) return 0
  const along = (rect.left - view.left) + (rect.top - view.top)
  return Math.min(spanMs, Math.max(0, (along / reach) * spanMs))
}

export const LIST_STAGGER_SPAN_MS = 160
export const LIST_JITTER_MS = 24

export const rowStaggerDelaysOf = ({ tops, spanMs = LIST_STAGGER_SPAN_MS, jitterMs = LIST_JITTER_MS }) => {
  const order = [...new Set(tops)].sort((a, b) => a - b)
  const last = Math.max(1, order.length - 1)
  return tops.map((top, index) => {
    const rank = order.indexOf(top)
    return Math.max(0, (rank / last) * spanMs + jitterOf(index) * jitterMs)
  })
}

const jitterOf = (index) => (((index * 7919) % 13) / 12) - 0.5

export const animateImagesToggle = async ({
  scrollEl,
  flip,
  settle,
  textSelector = GUIDE_TEXT_SELECTOR,
  thumbOf = guideThumbOf,
  viewOf = (el) => el.getBoundingClientRect(),
  stagger = 'diagonal',
}) => {
  if (!scrollEl || prefersReducedMotion()) {
    await flip()
    settle()
    return
  }
  scrollEl.getAnimations({ subtree: true }).forEach((a) => a.cancel())
  const before = new Map(visibleTexts({ scrollEl, textSelector, view: viewOf(scrollEl) }).map(({ el, rect }) => [el, rect.left]))
  const goingOff = await flip()
  const view = viewOf(scrollEl)
  const moved = [...before].filter(([el]) => el.isConnected).map(([el, oldLeft]) => ({ el, oldLeft, rect: el.getBoundingClientRect() }))
  const rowDelays = stagger === 'rows' ? rowStaggerDelaysOf({ tops: moved.map(({ rect }) => Math.round(rect.top)) }) : null
  const animations = moved.flatMap(({ el, oldLeft, rect }, index) => {
    const delay = rowDelays ? rowDelays[index] : staggerDelayOf({ rect, view })
    const dx = oldLeft - rect.left
    const thumb = thumbOf(el)
    return [
      Math.abs(dx) > 0.5 ? slideText({ el, dx, delay }) : null,
      thumb ? fadeThumb({ el: thumb, goingOff, delay }) : null,
    ].filter(Boolean)
  })
  await Promise.allSettled(animations.map((a) => a.finished))
  animations.forEach((a) => { if (a.effect?.target?.matches('.programme-image')) a.cancel() })
  settle()
}

export const viewportWithin = (el) => {
  const rect = el.getBoundingClientRect()
  const top = Math.max(rect.top, 0)
  const bottom = Math.min(rect.bottom, window.innerHeight)
  return { left: rect.left, right: rect.right, width: rect.width, top, bottom, height: Math.max(0, bottom - top) }
}

const visibleTexts = ({ scrollEl, textSelector, view }) => [...scrollEl.querySelectorAll(textSelector)]
  .map((el) => ({ el, rect: el.getBoundingClientRect() }))
  .filter(({ rect }) => isOnScreen(rect, view))

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
