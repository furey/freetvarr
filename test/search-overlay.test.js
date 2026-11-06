import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createHistoryEntries, createOverlayLayer, createOverlayStack } from '../src/web/overlay-stack.js'
import { readFileSync } from 'node:fs'
import { guideSearchOutcomeOf, remainingBusyMs } from '../src/web/search-results.js'
import { OFFLINE_MESSAGE } from '../src/web/shared/request-errors.js'
import { watchForOfferOf } from '../src/web/watch-for.js'

const browserLike = () => {
  const states = [{}]
  const history = {
    get state() { return states.at(-1) },
    pushState: (state) => states.push(state),
    back: () => states.pop(),
  }
  const listeners = new Map()
  const target = {
    addEventListener: (type, fn) => listeners.set(type, [...(listeners.get(type) || []), fn]),
    removeEventListener: (type, fn) => listeners.set(type, (listeners.get(type) || []).filter((other) => other !== fn)),
    fire: (type) => (listeners.get(type) || []).forEach((fn) => fn()),
  }
  const entries = createHistoryEntries({ history, usesBackGesture: () => true, later: (run) => run() })
  const stack = entries.attach(createOverlayStack({ entries }))
  const popstate = () => {
    states.pop()
    entries.onPop()
  }
  return { stack, target, popstate, states }
}

const openSearch = ({ stack, target }) => {
  const search = { open: true }
  const layer = createOverlayLayer({
    stack,
    target,
    onClose: () => {
      search.open = false
      layer.release()
    },
  })
  layer.open()
  return { search, layer }
}

test('search overlay: Back on a phone closes search instead of leaving it open over the page behind', () => {
  const browser = browserLike()
  const { search, layer } = openSearch(browser)
  assert.equal(browser.states.length, 2)
  browser.popstate()
  assert.equal(search.open, false)
  assert.equal(layer.isOpen(), false)
  assert.equal(browser.stack.size(), 0)
})

test('search overlay: a page change closes search, and a closed search ignores later page changes', () => {
  const browser = browserLike()
  const { search, layer } = openSearch(browser)
  browser.target.fire('hashchange')
  assert.equal(search.open, false)
  assert.equal(layer.isOpen(), false)
  search.open = true
  browser.target.fire('hashchange')
  assert.equal(search.open, true)
})

test('guideSearchOutcomeOf: a failed search gives an error and no results, so no watchlist offer shows', async () => {
  const outcome = await guideSearchOutcomeOf(async () => { throw Object.assign(new Error('HTTP 503'), { status: 503 }) })
  assert.deepEqual(outcome, { results: [], failure: 'Could not search the guide: HTTP 503' })
  assert.equal(watchForOfferOf({ query: 'Utopia', failed: Boolean(outcome.failure), guideCount: 0 }), null)
})

test('guideSearchOutcomeOf: offline shows the offline message alone, and a good search passes its results', async () => {
  const offline = await guideSearchOutcomeOf(async () => { throw Object.assign(new Error(OFFLINE_MESSAGE), { code: 'offline' }) })
  assert.equal(offline.failure, OFFLINE_MESSAGE)
  assert.deepEqual(await guideSearchOutcomeOf(async () => ({ results: [{ title: 'Utopia' }] })), { results: [{ title: 'Utopia' }], failure: '' })
  assert.deepEqual(await guideSearchOutcomeOf(async () => ({ results: null })), { results: [], failure: '' })
})

test('remainingBusyMs: a Searching state holds for 0.8 s, then ends at once', () => {
  assert.equal(remainingBusyMs({ startedAt: 1000, nowMs: 1100 }), 700)
  assert.equal(remainingBusyMs({ startedAt: 1000, nowMs: 1800 }), 0)
  assert.equal(remainingBusyMs({ startedAt: 1000, nowMs: 9000 }), 0)
})

const overlaySource = readFileSync(new URL('../src/web/components/search-overlay.js', import.meta.url), 'utf8')

const blockFrom = (marker) => {
  const rest = overlaySource.slice(overlaySource.indexOf(marker))
  return rest.slice(0, rest.indexOf('\n    }'))
}

test('search overlay: a new query collapses every expanded group', () => {
  assert.match(blockFrom('watch(query, (text) => {'), /expandedGroups\.value = new Set\(\)/)
})

test('search overlay: Enter opens nothing while a search is running', () => {
  assert.match(blockFrom('const openFirstResult'), /if \(searching\.value\) return[\s\S]*\.click\(\)/)
})

test('search overlay: Show all moves focus to the first row it reveals and names its group for screen readers', () => {
  assert.match(blockFrom('const expand = async'), /await nextTick\(\)[\s\S]*\[GROUP_ROW_LIMIT\]\?\.focus\(\)/)
  assert.match(overlaySource, /:aria-label="group\.showAllLabel"/)
})
