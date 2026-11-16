import { test } from 'node:test'
import assert from 'node:assert/strict'
import { marqueePlanOf, MARQUEE_HOLD_MS, MARQUEE_FADE_MS } from '../src/web/marquee.js'

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
