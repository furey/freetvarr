import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SIZE_RULES,
  sizeKeyOf,
  ruleOfKey,
  clampShare,
  snapShare,
  shareAtPosition,
  keyActionOf,
  sizesAfterSet,
  parseSizes,
  insetGrowthOf,
  innerCornerOf,
  ratioTextOf,
} from '../src/web/multi-resize.js'
import { splitBoxesOf, tileBoxesOf, stripShareOf, insetBoxAt } from '../src/web/multi-view.js'

const { split, inset, strip } = SIZE_RULES
const area = { left: 28, top: 76, width: 1310, height: 636 }

test('each layout and count has its own size key, and phones, the grid, and stacks have none', () => {
  assert.equal(sizeKeyOf({ layout: 'split', count: 2, resizable: true }), 'split-2')
  assert.equal(sizeKeyOf({ layout: 'inset', count: 2, resizable: true }), 'inset-2')
  assert.equal(sizeKeyOf({ layout: 'strip', count: 3, resizable: true }), 'strip-3')
  assert.equal(sizeKeyOf({ layout: 'strip', count: 4, resizable: true }), 'strip-4')
  assert.equal(sizeKeyOf({ layout: 'grid', count: 4, resizable: true }), null)
  assert.equal(sizeKeyOf({ layout: 'stacked', count: 2, resizable: true }), null)
  assert.equal(sizeKeyOf({ layout: 'split', count: 2, resizable: false }), null)
  assert.equal(ruleOfKey('strip-4'), strip)
  assert.equal(ruleOfKey(null), null)
})

test('side by side stays between 30% and 70%', () => {
  assert.equal(clampShare({ rule: split, share: 0.1 }), 0.3)
  assert.equal(clampShare({ rule: split, share: 0.9 }), 0.7)
  assert.equal(clampShare({ rule: split, share: 0.55 }), 0.55)
})

test('the big and small picture stays between 20% and 45% of the width', () => {
  assert.equal(clampShare({ rule: inset, share: 0.05 }), 0.2)
  assert.equal(clampShare({ rule: inset, share: 0.6 }), 0.45)
})

test('side by side snaps to a third, a half, and two thirds when close', () => {
  assert.equal(snapShare({ rule: split, share: 0.51 }), 0.5)
  assert.equal(snapShare({ rule: split, share: 0.345 }), 1 / 3)
  assert.equal(snapShare({ rule: split, share: 0.65 }), 2 / 3)
  assert.equal(snapShare({ rule: split, share: 0.6 }), 0.6)
  assert.equal(snapShare({ rule: inset, share: 0.33 }), 0.33)
})

test('a drag finds the share that puts the bar under the pointer, then snaps and clamps', () => {
  const positionOf = (share) => 100 + share * 1000
  assert.ok(Math.abs(shareAtPosition({ rule: split, positionOf, target: 700 }) - 0.6) < 0.001)
  assert.equal(shareAtPosition({ rule: split, positionOf, target: 610 }), 0.5)
  assert.equal(shareAtPosition({ rule: split, positionOf, target: 1050 }), 0.7)
  assert.equal(shareAtPosition({ rule: split, positionOf, target: 0 }), 0.3)
})

test('a strip drag keeps the bar under the pointer even when the layout shrinks to fit', () => {
  const positionOf = (share) => {
    const [main, next] = tileBoxesOf({ layout: 'strip', slots: 4, area, share })
    return (main.left + main.width + next.left) / 2
  }
  const share = shareAtPosition({ rule: strip, positionOf, target: 950 })
  assert.ok(Math.abs(positionOf(share) - 950) <= 2)
})

test('arrows move 5%, Home and End go to the limits, and Enter resets', () => {
  assert.deepEqual(keyActionOf({ rule: split, share: 0.5, key: 'ArrowRight' }), { share: 0.55 })
  assert.deepEqual(keyActionOf({ rule: split, share: 0.5, key: 'ArrowLeft' }), { share: 0.45 })
  assert.deepEqual(keyActionOf({ rule: split, share: 0.68, key: 'ArrowUp' }), { share: 0.7 })
  assert.deepEqual(keyActionOf({ rule: split, share: 0.5, key: 'Home' }), { share: 0.3 })
  assert.deepEqual(keyActionOf({ rule: split, share: 0.5, key: 'End' }), { share: 0.7 })
  assert.deepEqual(keyActionOf({ rule: split, share: 0.6, key: 'Enter' }), { reset: true })
  assert.equal(keyActionOf({ rule: split, share: 0.5, key: 'a' }), null)
})

test('a size back at the default is forgotten, so Reset size goes away', () => {
  const sizes = sizesAfterSet({ sizes: {}, key: 'split-2', share: 0.65 })
  assert.deepEqual(sizes, { 'split-2': 0.65 })
  assert.deepEqual(sizesAfterSet({ sizes, key: 'split-2', share: 0.5 }), {})
  assert.deepEqual(sizesAfterSet({ sizes, key: 'split-2', share: null }), {})
  assert.deepEqual(sizesAfterSet({ sizes, key: 'inset-2', share: 0.3 }), { 'split-2': 0.65, 'inset-2': 0.3 })
  assert.deepEqual(sizesAfterSet({ sizes, key: 'grid-4', share: 0.3 }), sizes)
})

test('stored sizes drop unknown keys and bad values, and clamp the rest', () => {
  assert.deepEqual(parseSizes('{"split-2":0.9,"grid-4":0.5,"strip-3":"x","inset-2":0.3}'), { 'split-2': 0.7, 'inset-2': 0.3 })
  assert.deepEqual(parseSizes('not json'), {})
  assert.deepEqual(parseSizes('[1]'), {})
  assert.deepEqual(parseSizes(null), {})
})

test('dragging the inner corner away from the screen corner grows the small picture', () => {
  assert.ok(insetGrowthOf({ corner: 'bottom-right', dx: -32, dy: -18 }) > 0)
  assert.ok(insetGrowthOf({ corner: 'bottom-right', dx: 32, dy: 18 }) < 0)
  assert.ok(insetGrowthOf({ corner: 'top-left', dx: 32, dy: 18 }) > 0)
  assert.equal(Math.round(insetGrowthOf({ corner: 'top-left', dx: 160, dy: 90 })), 160)
})

test('the grip sits on the corner that faces the middle of the screen', () => {
  assert.equal(innerCornerOf('bottom-right'), 'top-left')
  assert.equal(innerCornerOf('top-left'), 'bottom-right')
  assert.equal(innerCornerOf('bottom-left'), 'top-right')
})

test('the chip shows the share while dragging', () => {
  assert.equal(ratioTextOf({ layout: 'split', share: 0.65 }), '65 / 35')
  assert.equal(ratioTextOf({ layout: 'strip', share: 0.66 }), 'Main 66%')
  assert.equal(ratioTextOf({ layout: 'inset', share: 0.4 }), '40% wide')
})

test('side by side keeps both pictures 16:9 and centred on the same line', () => {
  const [left, right] = splitBoxesOf({ area, centreY: 384, share: 0.65 })
  assert.equal(Math.round((left.width * 9) / 16), left.height)
  assert.equal(Math.round((right.width * 9) / 16), right.height)
  assert.ok(Math.abs(left.top + left.height / 2 - 384) <= 1)
  assert.ok(Math.abs(right.top + right.height / 2 - 384) <= 1)
  assert.ok(left.width > right.width)
  assert.ok(Math.abs(right.left - (left.left + left.width) - 12) <= 1)
})

test('side by side at half and half matches the old equal split', () => {
  const [left, right] = splitBoxesOf({ area, centreY: 384, share: 0.5 })
  assert.equal(left.width, right.width)
  assert.equal(left.left, area.left)
})

test('a short screen caps the big side so it stays inside the area', () => {
  const short = { left: 28, top: 76, width: 1310, height: 400 }
  const [left] = splitBoxesOf({ area: short, centreY: 276, share: 0.7 })
  assert.ok(left.top >= short.top)
  assert.ok(left.top + left.height <= short.top + short.height)
})

test('a strip share gives the main picture that share of the width and keeps tiles 16:9', () => {
  const boxes = tileBoxesOf({ layout: 'strip', slots: 4, area, share: 0.66 })
  assert.ok(Math.abs(stripShareOf(boxes) - 0.66) < 0.01)
  for (const box of boxes) assert.ok(Math.abs((box.width * 9) / 16 - box.height) <= 1)
  for (const box of boxes) assert.ok(box.top >= area.top && box.top + box.height <= area.top + area.height + 1)
})

test('with no strip share the strip keeps its natural size', () => {
  assert.deepEqual(tileBoxesOf({ layout: 'strip', slots: 4, area }), tileBoxesOf({ layout: 'strip', slots: 4, area, share: null }))
})

test('a bigger small picture keeps its outer corner pinned', () => {
  const frame = { frameWidth: 1366, frameHeight: 768, margin: 16, topReserve: 72, bottomReserve: 48 }
  const small = insetBoxAt({ ...frame, corner: 'bottom-right', insetWidth: 300 })
  const big = insetBoxAt({ ...frame, corner: 'bottom-right', insetWidth: 600 })
  assert.equal(small.left + small.width, big.left + big.width)
  assert.equal(small.top + small.height, big.top + big.height)
})
