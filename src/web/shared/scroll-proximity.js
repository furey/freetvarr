export const GUIDE_SCROLL_SELECTOR = '.epg-scroll'
export const NEAR_VIEW_MARGIN = '100% 50%'
export const RAIL_EDGE_MARGIN = '50% -25% 50% 0px'
export const RAIL_EDGE_ATTRIBUTE = 'data-at-rail-edge'

export const observeInScroller = ({ el, rootSelector, rootMargin, onChange }) => {
  if (!el) return
  const observer = observerFor({ root: el.closest(rootSelector), rootMargin })
  targets.set(el, { observer, onChange })
  observer.observe(el)
}

export const unobserveInScroller = (el) => {
  targets.get(el)?.observer.unobserve(el)
  targets.delete(el)
}

export const railEdgeDirective = {
  mounted: (el) => observeInScroller({
    el,
    rootSelector: GUIDE_SCROLL_SELECTOR,
    rootMargin: RAIL_EDGE_MARGIN,
    onChange: (atEdge) => el.toggleAttribute(RAIL_EDGE_ATTRIBUTE, atEdge),
  }),
  unmounted: (el) => unobserveInScroller(el),
}

const observers = new WeakMap()
const targets = new WeakMap()

const observerFor = ({ root, rootMargin }) => {
  const key = root || document
  if (!observers.has(key)) observers.set(key, new Map())
  const byMargin = observers.get(key)
  if (!byMargin.has(rootMargin)) {
    byMargin.set(rootMargin, new IntersectionObserver(notifyTargets, { root, rootMargin }))
  }
  return byMargin.get(rootMargin)
}

const notifyTargets = (entries) => {
  for (const entry of entries) targets.get(entry.target)?.onChange(entry.isIntersecting)
}
