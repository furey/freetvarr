import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PAGE_REVEAL, isRevealArrival, revealDelaysOf, revealPlanOf } from '../src/web/page-reveal.js'

test('isRevealArrival: a fresh forward arrival reveals once, inside its window', () => {
  const arrival = { fresh: true, at: 1000 }
  assert.equal(isRevealArrival({ arrival, nowMs: 1200 }), true)
  assert.equal(isRevealArrival({ arrival: { ...arrival, revealed: true }, nowMs: 1200 }), false)
  assert.equal(isRevealArrival({ arrival, nowMs: 1000 + PAGE_REVEAL.arrivalWindowMs + 1 }), false)
})

test('isRevealArrival: Back and Forward to a visited entry never reveal', () => {
  assert.equal(isRevealArrival({ arrival: { fresh: false, at: 1000 }, nowMs: 1000 }), false)
  assert.equal(isRevealArrival({ arrival: null, nowMs: 1000 }), false)
})

test('revealDelaysOf: on-screen boxes step from the top and stop stepping at the cap', () => {
  const boxes = [0, 60, 120, 180, 240, 300, 360].map((top) => ({ top, height: 50 }))
  const delays = revealDelaysOf({ boxes, viewportHeight: 800 })
  const last = PAGE_REVEAL.maxSteps * PAGE_REVEAL.stepMs
  const step = PAGE_REVEAL.stepMs
  assert.deepEqual(delays, [0, step, step * 2, step * 3, last, last, last])
})

test('revealDelaysOf: boxes below the fold, above the top, or hidden do not animate', () => {
  const boxes = [{ top: 0, height: 0 }, { top: 10, height: 40 }, { top: 900, height: 40 }, { top: -80, height: 40 }]
  assert.deepEqual(revealDelaysOf({ boxes, viewportHeight: 844 }), [null, 0, null, null])
})

test('revealDelaysOf: the whole reveal stays under 600 ms', () => {
  assert.ok(PAGE_REVEAL.maxSteps * PAGE_REVEAL.stepMs + PAGE_REVEAL.durationMs < 600)
})

test('revealPlanOf: a repeat visit fades briefly from half opacity with no stagger', () => {
  const repeat = revealPlanOf({ repeat: true })
  assert.equal(repeat.stepMs, 0)
  assert.ok(repeat.fromOpacity > 0)
  assert.ok(repeat.durationMs < PAGE_REVEAL.durationMs)
  const boxes = [0, 60, 120].map((top) => ({ top, height: 50 }))
  assert.deepEqual(revealDelaysOf({ boxes, viewportHeight: 800, stepMs: repeat.stepMs }), [0, 0, 0])
})

test('revealPlanOf: a first visit keeps the full staggered reveal', () => {
  const first = revealPlanOf({ repeat: false })
  assert.equal(first.stepMs, PAGE_REVEAL.stepMs)
  assert.equal(first.durationMs, PAGE_REVEAL.durationMs)
  assert.equal(first.fromOpacity, 0)
})
