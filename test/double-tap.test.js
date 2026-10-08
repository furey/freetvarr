import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyTapState,
  zoneOf,
  isTap,
  registerTap,
  clampSkip,
  skipLabel,
  skipSpoken,
  DOUBLE_TAP_MS,
  SKIP_CHAIN_MS,
} from '../src/web/double-tap.js'

const box = { width: 900, height: 500 }

test('zoneOf splits the video into thirds', () => {
  assert.equal(zoneOf({ ...box, x: 100, y: 200 }), 'back')
  assert.equal(zoneOf({ ...box, x: 450, y: 200 }), null)
  assert.equal(zoneOf({ ...box, x: 800, y: 200 }), 'forward')
  assert.equal(zoneOf({ ...box, x: 299, y: 200 }), 'back')
  assert.equal(zoneOf({ ...box, x: 601, y: 200 }), 'forward')
})

test('zoneOf ignores the control bar and points outside the video', () => {
  assert.equal(zoneOf({ ...box, x: 100, y: 470, bottomInsetPx: 48 }), null)
  assert.equal(zoneOf({ ...box, x: 100, y: 440, bottomInsetPx: 48 }), 'back')
  assert.equal(zoneOf({ ...box, x: -1, y: 100 }), null)
  assert.equal(zoneOf({ width: 0, height: 0, x: 0, y: 0 }), null)
})

test('isTap rejects drags and slow touches but not slow mouse clicks', () => {
  const base = { startX: 10, startY: 10, endX: 12, endY: 11, ms: 100, pointerType: 'touch' }
  assert.equal(isTap(base), true)
  assert.equal(isTap({ ...base, endX: 60 }), false)
  assert.equal(isTap({ ...base, ms: 500 }), false)
  assert.equal(isTap({ ...base, ms: 500, pointerType: 'mouse' }), true)
})

test('a lone tap is a first tap and a centre tap resets', () => {
  const first = registerTap(emptyTapState(), { side: 'back', at: 1000, position: 50 })
  assert.deepEqual(first.result, { kind: 'first' })
  const centre = registerTap(first.state, { side: null, at: 1100, position: 50 })
  assert.deepEqual(centre.result, { kind: 'center' })
  assert.deepEqual(centre.state, emptyTapState())
})

test('a second tap on the same side inside the window skips 10 seconds', () => {
  const first = registerTap(emptyTapState(), { side: 'forward', at: 1000, position: 50 })
  const second = registerTap(first.state, { side: 'forward', at: 1000 + DOUBLE_TAP_MS - 1, position: 50 })
  assert.deepEqual(second.result, { kind: 'skip', side: 'forward', total: 10, base: 50 })
})

test('a second tap after the window is a new first tap', () => {
  const first = registerTap(emptyTapState(), { side: 'forward', at: 1000, position: 50 })
  const late = registerTap(first.state, { side: 'forward', at: 1000 + DOUBLE_TAP_MS, position: 50 })
  assert.equal(late.result.kind, 'first')
})

test('a tap on the other side is a new first tap', () => {
  const first = registerTap(emptyTapState(), { side: 'forward', at: 1000, position: 50 })
  const other = registerTap(first.state, { side: 'back', at: 1100, position: 50 })
  assert.equal(other.result.kind, 'first')
})

test('quick taps accumulate from the first position', () => {
  let state = emptyTapState()
  const skips = []
  let at = 1000
  for (const position of [100, 100, 101, 102]) {
    const step = registerTap(state, { side: 'back', at, position })
    state = step.state
    if (step.result.kind === 'skip') skips.push([step.result.total, step.result.base])
    at += 200
  }
  assert.deepEqual(skips, [[10, 100], [20, 100], [30, 100]])
})

test('the chain ends after the chain window', () => {
  const first = registerTap(emptyTapState(), { side: 'back', at: 1000, position: 100 })
  const skip = registerTap(first.state, { side: 'back', at: 1100, position: 100 })
  const late = registerTap(skip.state, { side: 'back', at: 1100 + SKIP_CHAIN_MS, position: 90 })
  assert.equal(late.result.kind, 'first')
})

test('a forced skip starts a chain without a prior tap and then accumulates', () => {
  const one = registerTap(emptyTapState(), { side: 'forward', at: 1000, position: 20, force: true })
  assert.deepEqual(one.result, { kind: 'skip', side: 'forward', total: 10, base: 20 })
  const two = registerTap(one.state, { side: 'forward', at: 1200, position: 21, force: true })
  assert.deepEqual(two.result, { kind: 'skip', side: 'forward', total: 20, base: 20 })
})

test('clampSkip moves the full step inside the range', () => {
  assert.deepEqual(clampSkip({ base: 100, delta: -10, floor: 0, ceiling: 200 }), { to: 90, applied: 10 })
  assert.deepEqual(clampSkip({ base: 100, delta: 30, floor: 0, ceiling: 200 }), { to: 130, applied: 30 })
})

test('clampSkip stops at the floor and the ceiling', () => {
  assert.deepEqual(clampSkip({ base: 5, delta: -30, floor: 0, ceiling: 200 }), { to: 0, applied: 5 })
  assert.deepEqual(clampSkip({ base: 195, delta: 20, floor: 0, ceiling: 200 }), { to: 200, applied: 5 })
})

test('clampSkip applies nothing when already at or past the limit', () => {
  assert.deepEqual(clampSkip({ base: 200, delta: 10, floor: 0, ceiling: 200 }), { to: 200, applied: 0 })
  assert.deepEqual(clampSkip({ base: 0, delta: -10, floor: 0, ceiling: 200 }), { to: 0, applied: 0 })
  assert.deepEqual(clampSkip({ base: 210, delta: 10, floor: 0, ceiling: 200 }), { to: 210, applied: 0 })
})

test('clampSkip treats a missing limit as open', () => {
  assert.deepEqual(clampSkip({ base: 50, delta: 10 }), { to: 60, applied: 10 })
  assert.deepEqual(clampSkip({ base: 50, delta: -10, ceiling: 55 }), { to: 40, applied: 10 })
})

test('skipLabel and skipSpoken describe the accumulated skip', () => {
  assert.equal(skipLabel({ side: 'back', seconds: 20 }), '◀︎ -20')
  assert.equal(skipLabel({ side: 'forward', seconds: 10 }), '+10 ▶︎')
  assert.equal(skipSpoken({ side: 'back', seconds: 30 }), 'Back 30 seconds')
  assert.equal(skipSpoken({ side: 'forward', seconds: 10 }), 'Forward 10 seconds')
})
