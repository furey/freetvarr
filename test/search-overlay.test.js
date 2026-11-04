import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { createHistoryEntries, createOverlayStack } from '../src/web/overlay-stack.js'

const overlay = readFileSync(new URL('../src/web/components/search-overlay.js', import.meta.url), 'utf8')

test('search overlay: Back closes search, because the open search is a layer on the overlay stack', () => {
  assert.match(overlay, /layer = overlayStack\.push\(\{ onBack: close \}\)/)
  assert.match(overlay, /if \(!isOpen\) \{\n\s*releaseLayer\(\)/)
  assert.match(overlay, /window\.addEventListener\('hashchange', close\)/)
  assert.match(overlay, /if \(event\.key === 'Tab' && panel\.value\) return keepFocusInside\(\{ event, root: panel\.value \}\)/)
  const states = [{}]
  const history = {
    get state() { return states.at(-1) },
    pushState: (state) => states.push(state),
    back: () => states.pop(),
  }
  const entries = createHistoryEntries({ history, usesBackGesture: () => true, later: (run) => run() })
  const stack = entries.attach(createOverlayStack({ entries }))
  let open = true
  stack.push({ onBack: () => { open = false } })
  states.pop()
  entries.onPop()
  assert.equal(open, false)
})

test('search overlay: a failed guide search says so and hides the watchlist offer', () => {
  assert.match(overlay, /<p v-if="guideFailure" class="ui-search-hint">Could not search the guide: \{\{ guideFailure \}\}<\/p>/)
  assert.match(overlay, /\.catch\(\(err\) => \(\{ results: \[\], failure: err\.message \}\)\)/)
  assert.match(overlay, /failed: Boolean\(guideFailure\.value\)/)
})
