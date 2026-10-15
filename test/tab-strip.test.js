import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  fadeEdges,
  nudgeDecision,
  nudgeOffsetAt,
  NUDGE_DISTANCE_PX,
  NUDGE_OUT_MS,
  NUDGE_TOTAL_MS,
} from '../src/web/tab-strip.js'

const phone = { scrollWidth: 900, clientWidth: 390 }

test('fadeEdges shows no fade when the tabs fit', () => {
  assert.deepEqual(fadeEdges({ scrollLeft: 0, scrollWidth: 1200, clientWidth: 1200 }), { left: false, right: false })
})

test('fadeEdges fades the right edge at the start of an overflowing strip', () => {
  assert.deepEqual(fadeEdges({ ...phone, scrollLeft: 0 }), { left: false, right: true })
})

test('fadeEdges fades both edges mid-scroll and the left edge at the end', () => {
  assert.deepEqual(fadeEdges({ ...phone, scrollLeft: 200 }), { left: true, right: true })
  assert.deepEqual(fadeEdges({ ...phone, scrollLeft: 510 }), { left: true, right: false })
})

test('fadeEdges ignores sub-pixel scroll offsets', () => {
  assert.deepEqual(fadeEdges({ ...phone, scrollLeft: 0.6 }), { left: false, right: true })
  assert.deepEqual(fadeEdges({ ...phone, scrollLeft: 509.4 }), { left: true, right: false })
  assert.deepEqual(fadeEdges({ scrollLeft: 0, scrollWidth: 391, clientWidth: 390 }), { left: false, right: false })
})

const eligible = { alreadyShown: false, reducedMotion: false, userTouched: false, scrollLeft: 0, ...phone }

test('nudgeDecision runs once on an overflowing strip at its start', () => {
  assert.equal(nudgeDecision(eligible), 'run')
  assert.equal(nudgeDecision({ ...eligible, alreadyShown: true }), 'skip')
})

test('nudgeDecision marks the hint shown when the user already touched the strip', () => {
  assert.equal(nudgeDecision({ ...eligible, userTouched: true }), 'mark')
  assert.equal(nudgeDecision({ ...eligible, userTouched: true, alreadyShown: true }), 'skip')
})

test('nudgeDecision skips without marking for reduced motion, deep links, and wide screens', () => {
  assert.equal(nudgeDecision({ ...eligible, reducedMotion: true }), 'skip')
  assert.equal(nudgeDecision({ ...eligible, scrollLeft: 120 }), 'skip')
  assert.equal(nudgeDecision({ ...eligible, scrollWidth: 1200, clientWidth: 1200 }), 'skip')
})

test('nudgeOffsetAt goes out to the full distance and springs back to zero', () => {
  assert.equal(nudgeOffsetAt({ elapsedMs: 0 }), 0)
  assert.ok(nudgeOffsetAt({ elapsedMs: NUDGE_OUT_MS / 2 }) > NUDGE_DISTANCE_PX / 2)
  assert.equal(Math.round(nudgeOffsetAt({ elapsedMs: NUDGE_OUT_MS })), NUDGE_DISTANCE_PX)
  assert.equal(nudgeOffsetAt({ elapsedMs: NUDGE_TOTAL_MS }), 0)
  assert.equal(nudgeOffsetAt({ elapsedMs: NUDGE_TOTAL_MS + 500 }), 0)
  assert.equal(nudgeOffsetAt({ elapsedMs: NUDGE_OUT_MS, distancePx: 30 }), 30)
})
