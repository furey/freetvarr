import { PAGE_REVEAL, isRevealArrival, revealDelaysOf } from '/page-reveal.js'
import { latestArrival } from '/shared/router.js'
import { prefersReducedMotion } from '/shared/utils.js'

export const pageReveal = {
  mounted: (el, { value }) => requestReveal({ el, hold: holdOf(value) }),
  updated: (el, { value, oldValue }) => {
    if (keyOf(value) !== keyOf(oldValue)) requestReveal({ el, hold: holdOf(value) })
  },
}

const pending = []

const requestReveal = ({ el, hold }) => {
  const arrival = latestArrival()
  if (!isRevealArrival({ arrival, nowMs: performance.now() })) return
  pending.push({ el, hold: arrival.sameView ? hold : 0 })
  if (pending.length === 1) queueMicrotask(flushReveal)
}

const flushReveal = () => {
  latestArrival().revealed = true
  const targets = pending.splice(0)
  if (!canAnimate()) return
  const items = revealItemsOf(targets)
  const delays = revealDelaysOf({ boxes: items.map(boxOf), viewportHeight: window.innerHeight })
  items.forEach((item, index) => {
    if (delays[index] !== null) slideIn({ el: item, delay: delays[index] })
  })
  revealLateArrivals({ targets, startedAt: performance.now() })
}

const revealLateArrivals = ({ targets, startedAt }) => {
  const holds = new Map(targets.map(({ el, hold }) => [el, hold]))
  const observer = new MutationObserver((records) => records
    .flatMap(({ target, addedNodes }) => [...addedNodes].map((node) => ({ target, node })))
    .forEach(({ target, node }) => revealLateChild({ target, node, hold: holds.get(target) ?? 0, startedAt })))
  holds.forEach((_, el) => observer.observe(el, { childList: true }))
  setTimeout(() => observer.disconnect(), revealSpanMs())
}

const revealLateChild = ({ target, node, hold, startedAt }) => {
  if (!(node instanceof Element) || !node.isConnected || !isMovable(node)) return
  const index = [...target.children].indexOf(node) - hold
  if (index < 0) return
  const box = boxOf(node)
  if (revealDelaysOf({ boxes: [box], viewportHeight: window.innerHeight })[0] === null) return
  const planned = Math.min(index, PAGE_REVEAL.maxSteps) * PAGE_REVEAL.stepMs
  slideIn({ el: node, delay: Math.max(0, planned - (performance.now() - startedAt)) })
}

const revealSpanMs = () => PAGE_REVEAL.durationMs + PAGE_REVEAL.maxSteps * PAGE_REVEAL.stepMs

const canAnimate = () => !prefersReducedMotion()
  && !document.body.classList.contains('pull-refreshing')
  && !document.documentElement.classList.contains('is-brand-intro-active')

const revealItemsOf = (targets) => {
  const holds = new Map(targets.filter(({ el }) => el.isConnected).map(({ el, hold }) => [el, hold]))
  const outermost = [...holds.keys()].filter((el) => ![...holds.keys()].some((other) => other !== el && other.contains(el)))
  const expand = (el) => [...el.children].slice(holds.get(el) ?? 0)
    .flatMap((child) => (holds.has(child) ? expand(child) : [child]))
    .filter(isMovable)
  return outermost.flatMap(expand)
}

const isMovable = (el) => getComputedStyle(el).position !== 'fixed'

const boxOf = (el) => {
  const { top, height } = el.getBoundingClientRect()
  return { top: top + window.scrollY, height }
}

const slideIn = ({ el, delay }) => el.animate(
  [{ opacity: 0, translate: `0 ${PAGE_REVEAL.offsetPx}px` }, { opacity: 1, translate: '0 0' }],
  { duration: PAGE_REVEAL.durationMs, delay, easing: PAGE_REVEAL.easing, fill: 'backwards' },
)

const holdOf = (value) => value?.hold ?? 0

const keyOf = (value) => value?.key
