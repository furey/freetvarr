import { test } from 'node:test'
import assert from 'node:assert/strict'

const createdObservers = []

globalThis.document = { nodeName: '#document' }
globalThis.IntersectionObserver = class {
  constructor(callback, options) {
    this.callback = callback
    this.options = options
    this.observed = new Set()
    createdObservers.push(this)
  }
  observe(el) { this.observed.add(el) }
  unobserve(el) { this.observed.delete(el) }
  report(entries) { this.callback(entries) }
}

const {
  observeInScroller,
  unobserveInScroller,
  railEdgeDirective,
  GUIDE_SCROLL_SELECTOR,
  NEAR_VIEW_MARGIN,
  RAIL_EDGE_MARGIN,
  RAIL_EDGE_ATTRIBUTE,
} = await import('../src/web/shared/scroll-proximity.js')

const fakeElementIn = (root) => {
  const attributes = new Set()
  return {
    closest: () => root,
    toggleAttribute: (name, on) => (on ? attributes.add(name) : attributes.delete(name)),
    hasAttribute: (name) => attributes.has(name),
  }
}

const observerWatching = (el) => createdObservers.find((o) => o.observed.has(el))

test('elements in one scroller with the same margin share one observer', () => {
  const root = {}
  const first = fakeElementIn(root)
  const second = fakeElementIn(root)
  observeInScroller({ el: first, rootSelector: GUIDE_SCROLL_SELECTOR, rootMargin: NEAR_VIEW_MARGIN, onChange: () => {} })
  observeInScroller({ el: second, rootSelector: GUIDE_SCROLL_SELECTOR, rootMargin: NEAR_VIEW_MARGIN, onChange: () => {} })
  assert.equal(observerWatching(first), observerWatching(second))
  assert.equal(observerWatching(first).options.root, root)
  assert.equal(observerWatching(first).options.rootMargin, NEAR_VIEW_MARGIN)
})

test('each element hears only its own intersection changes', () => {
  const root = {}
  const heard = []
  const near = fakeElementIn(root)
  const far = fakeElementIn(root)
  observeInScroller({ el: near, rootSelector: GUIDE_SCROLL_SELECTOR, rootMargin: NEAR_VIEW_MARGIN, onChange: (on) => heard.push(['near', on]) })
  observeInScroller({ el: far, rootSelector: GUIDE_SCROLL_SELECTOR, rootMargin: NEAR_VIEW_MARGIN, onChange: (on) => heard.push(['far', on]) })
  observerWatching(near).report([{ target: near, isIntersecting: true }, { target: far, isIntersecting: false }])
  assert.deepEqual(heard, [['near', true], ['far', false]])
})

test('an unobserved element stops hearing changes', () => {
  const root = {}
  let calls = 0
  const el = fakeElementIn(root)
  observeInScroller({ el, rootSelector: GUIDE_SCROLL_SELECTOR, rootMargin: NEAR_VIEW_MARGIN, onChange: () => { calls += 1 } })
  const observer = observerWatching(el)
  unobserveInScroller(el)
  observer.report([{ target: el, isIntersecting: true }])
  assert.equal(calls, 0)
  assert.equal(observer.observed.has(el), false)
})

test('the rail edge directive marks only cells inside the edge band', () => {
  const root = {}
  const cell = fakeElementIn(root)
  railEdgeDirective.mounted(cell)
  const observer = observerWatching(cell)
  assert.equal(observer.options.rootMargin, RAIL_EDGE_MARGIN)
  observer.report([{ target: cell, isIntersecting: true }])
  assert.equal(cell.hasAttribute(RAIL_EDGE_ATTRIBUTE), true)
  observer.report([{ target: cell, isIntersecting: false }])
  assert.equal(cell.hasAttribute(RAIL_EDGE_ATTRIBUTE), false)
  railEdgeDirective.unmounted(cell)
  assert.equal(observer.observed.has(cell), false)
})
