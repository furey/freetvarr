import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  marqueePlanOf,
  marqueeKeepsGoing,
  marqueeTextChangeOf,
  MARQUEE_HOLD_MS,
  MARQUEE_FADE_MS,
  MARQUEE_MAX_CYCLES,
} from '../src/web/marquee.js'

test('marqueePlanOf scrolls only text wider than its box', () => {
  assert.equal(marqueePlanOf({ contentWidth: 200, boxWidth: 200 }), null)
  assert.equal(marqueePlanOf({ contentWidth: 201, boxWidth: 200 }), null)
  assert.equal(marqueePlanOf({ contentWidth: 150, boxWidth: 200 }), null)
  assert.notEqual(marqueePlanOf({ contentWidth: 260, boxWidth: 200 }), null)
})

test('marqueePlanOf moves the hidden width at 30 px a second between 2 s holds', () => {
  assert.deepEqual(marqueePlanOf({ contentWidth: 260, boxWidth: 200 }), {
    shiftPx: 60, scrollMs: 2_000, holdMs: MARQUEE_HOLD_MS, fadeMs: MARQUEE_FADE_MS,
  })
  assert.equal(MARQUEE_HOLD_MS, 2_000)
})

test('marqueePlanOf never scrolls under reduced motion or before layout', () => {
  assert.equal(marqueePlanOf({ contentWidth: 400, boxWidth: 200, reducedMotion: true }), null)
  assert.equal(marqueePlanOf({ contentWidth: 400, boxWidth: 0 }), null)
})

test('marqueeKeepsGoing stops a run after three cycles', () => {
  assert.equal(MARQUEE_MAX_CYCLES, 3)
  assert.equal(marqueeKeepsGoing({ cyclesDone: 0 }), true)
  assert.equal(marqueeKeepsGoing({ cyclesDone: 2 }), true)
  assert.equal(marqueeKeepsGoing({ cyclesDone: 3 }), false)
})

test('marqueeTextChangeOf holds new text until the reset while a long text scrolls', () => {
  assert.equal(marqueeTextChangeOf({ running: true, contentWidth: 300, boxWidth: 200 }), 'at-reset')
  assert.equal(marqueeTextChangeOf({ running: true, contentWidth: 150, boxWidth: 200 }), 'now')
  assert.equal(marqueeTextChangeOf({ running: false, contentWidth: 300, boxWidth: 200 }), 'now')
})
