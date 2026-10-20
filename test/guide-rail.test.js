import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  GUIDE_RAIL_MIN_PX,
  GUIDE_RAIL_MAX_PX,
  canEditOrderOf,
  clampRailPx,
  railLayoutOf,
  railShownPxOf,
} from '../src/web/guide-rail.js'

test('the minimum rail fits the star and logo with even padding', () => {
  const inset = 12
  const star = 24
  const gap = 10
  const logo = 38
  assert.equal(GUIDE_RAIL_MIN_PX, inset + star + gap + logo + inset)
})

test('clampRailPx keeps a dragged width between the minimum and maximum', () => {
  assert.equal(clampRailPx(40), GUIDE_RAIL_MIN_PX)
  assert.equal(clampRailPx(90), GUIDE_RAIL_MIN_PX)
  assert.equal(clampRailPx(150), 150)
  assert.equal(clampRailPx(900), GUIDE_RAIL_MAX_PX)
})

test('railShownPxOf caps the rail at 38% of the viewport', () => {
  assert.equal(railShownPxOf({ railPx: 200, viewportWidth: 1366 }), 200)
  assert.equal(railShownPxOf({ railPx: 200, viewportWidth: 390 }), 390 * 0.38)
})

test('railLayoutOf turns compact below 136 px', () => {
  assert.deepEqual(railLayoutOf({ shownPx: 135, narrow: false }), { compact: true, filterPlaceholder: 'Filter', orderControl: 'icon' })
  assert.deepEqual(railLayoutOf({ shownPx: 136, narrow: false }), { compact: false, filterPlaceholder: 'Filter channels', orderControl: 'icon' })
})

test('railLayoutOf labels the order control only from 179 px', () => {
  assert.equal(railLayoutOf({ shownPx: 178, narrow: false }).orderControl, 'icon')
  assert.equal(railLayoutOf({ shownPx: 179, narrow: false }).orderControl, 'text')
})

test('railLayoutOf keeps the short placeholder on the phone', () => {
  assert.equal(railLayoutOf({ shownPx: 148, narrow: true }).filterPlaceholder, 'Filter')
})

test('canEditOrderOf needs a wide screen, no filter, and two favourites', () => {
  assert.equal(canEditOrderOf({ narrow: false, filter: '', pinnedCount: 2 }), true)
  assert.equal(canEditOrderOf({ narrow: true, filter: '', pinnedCount: 5 }), false)
  assert.equal(canEditOrderOf({ narrow: false, filter: ' abc', pinnedCount: 5 }), false)
  assert.equal(canEditOrderOf({ narrow: false, filter: '  ', pinnedCount: 5 }), true)
  assert.equal(canEditOrderOf({ narrow: false, filter: '', pinnedCount: 1 }), false)
})
