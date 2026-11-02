import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createScrollMemory, entryStateWithKey, hashesMatch, canReachTop, restoreScrollTop } from '../src/web/scroll-memory.js'

const keysFrom = (...keys) => () => keys.shift()

test('createScrollMemory: a new history entry starts at the top with a fresh key', () => {
  const memory = createScrollMemory({ newKey: keysFrom('b') })
  memory.leave({ key: 'a', scrollY: 900 })
  assert.deepEqual(memory.arrive({ cameFrom: '#/home' }), { key: 'b', top: 0 })
})

test('createScrollMemory: a revisited entry returns to where it was left', () => {
  const memory = createScrollMemory({ newKey: keysFrom('b') })
  memory.leave({ key: 'a', scrollY: 1234.6 })
  assert.deepEqual(memory.arrive({ entryKey: 'a', cameFrom: null }), { key: 'a', top: 1235 })
})

test('createScrollMemory: a revisited entry with no remembered position starts at the top', () => {
  const memory = createScrollMemory()
  assert.deepEqual(memory.arrive({ entryKey: 'from-before-reload' }), { key: 'from-before-reload', top: 0 })
})

test('createScrollMemory: leaving again overwrites the remembered position and ignores negative overscroll', () => {
  const memory = createScrollMemory()
  memory.leave({ key: 'a', scrollY: 500 })
  memory.leave({ key: 'a', scrollY: -40 })
  assert.equal(memory.arrive({ entryKey: 'a' }).top, 0)
})

test('createScrollMemory: a null history state counts as a new entry', () => {
  const memory = createScrollMemory({ newKey: keysFrom('first') })
  assert.deepEqual(memory.arrive(null), { key: 'first', top: 0 })
})

test('createScrollMemory: the default keys are unique', () => {
  const memory = createScrollMemory()
  assert.notEqual(memory.arrive(null).key, memory.arrive(null).key)
})

test('entryStateWithKey: keeps the other state fields and only replaces when the key differs', () => {
  const state = { cameFrom: '#/home', overlayId: 3 }
  assert.deepEqual(entryStateWithKey({ state, key: 'k' }), { cameFrom: '#/home', overlayId: 3, entryKey: 'k' })
  const keyed = { entryKey: 'k' }
  assert.equal(entryStateWithKey({ state: keyed, key: 'k' }), keyed)
  assert.deepEqual(entryStateWithKey({ state: null, key: 'k' }), { entryKey: 'k' })
})

test('hashesMatch: the tab of the current section matches, ignoring case and a trailing slash', () => {
  assert.equal(hashesMatch('#/settings', '#/settings/'), true)
  assert.equal(hashesMatch('#/live', '#/Live'), true)
})

test('hashesMatch: a sub-page, a different section, or a query does not match', () => {
  assert.equal(hashesMatch('#/settings', '#/settings/player'), false)
  assert.equal(hashesMatch('#/recordings', '#/guide'), false)
  assert.equal(hashesMatch('#/recordings', '#/recordings?view=grid'), false)
})

test('hashesMatch: an empty or missing hash never matches', () => {
  assert.equal(hashesMatch('', ''), false)
  assert.equal(hashesMatch(null, '#/home'), false)
})

test('canReachTop: waits until the page is tall enough for the remembered position', () => {
  assert.equal(canReachTop({ top: 1200, maxScrollY: 300 }), false)
  assert.equal(canReachTop({ top: 1200, maxScrollY: 1200 }), true)
})

const restoreHarness = ({ heights, limitMs = 1500 }) => {
  const scrolls = []
  const queued = []
  let clock = 0
  let measured = 0
  const restore = (top) => restoreScrollTop({
    top,
    maxScrollY: () => heights[Math.min(measured++, heights.length - 1)],
    scrollTo: (target) => scrolls.push(target),
    nextAttempt: (run) => queued.push(run),
    now: () => clock,
    limitMs,
  })
  const tick = (ms) => {
    clock += ms
    queued.splice(0).forEach((run) => run())
  }
  return { restore, scrolls, queued, tick }
}

test('restoreScrollTop: scrolls at once when the page is already tall enough, without waiting for a frame', () => {
  const { restore, scrolls, queued } = restoreHarness({ heights: [1500] })
  assert.equal(restore(800).isDone(), true)
  assert.deepEqual(scrolls, [800])
  assert.equal(queued.length, 0)
})

test('restoreScrollTop: waits for the page to grow, then scrolls once', () => {
  const { restore, scrolls, tick } = restoreHarness({ heights: [200, 200, 1500] })
  restore(800)
  tick(16)
  assert.deepEqual(scrolls, [])
  tick(16)
  assert.deepEqual(scrolls, [800])
})

test('restoreScrollTop: gives up after the time limit and scrolls as far as the page allows', () => {
  const { restore, scrolls, tick } = restoreHarness({ heights: [200], limitMs: 100 })
  restore(800)
  tick(50)
  assert.deepEqual(scrolls, [])
  tick(60)
  assert.deepEqual(scrolls, [800])
})

test('restoreScrollTop: a cancel before the page grows leaves the scroll alone', () => {
  const { restore, scrolls, tick } = restoreHarness({ heights: [200, 1500] })
  restore(800).cancel()
  tick(16)
  assert.deepEqual(scrolls, [])
})

test('restoreScrollTop: a new entry goes to the top at once', () => {
  const { restore, scrolls } = restoreHarness({ heights: [0] })
  restore(0)
  assert.deepEqual(scrolls, [0])
})
