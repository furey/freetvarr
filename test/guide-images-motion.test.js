import { test } from 'node:test'
import assert from 'node:assert/strict'
import { staggerDelayOf, IMAGES_STAGGER_SPAN_MS } from '../src/web/shared/guide-images-motion.js'

const view = { left: 100, top: 50, width: 800, height: 400 }

test('staggerDelayOf: the top-left cell starts at once', () => {
  assert.equal(staggerDelayOf({ rect: { left: 100, top: 50 }, view }), 0)
})

test('staggerDelayOf: the bottom-right cell starts last, at the full span', () => {
  assert.equal(staggerDelayOf({ rect: { left: 900, top: 450 }, view }), IMAGES_STAGGER_SPAN_MS)
})

test('staggerDelayOf: a cell halfway along the diagonal waits half the span', () => {
  assert.equal(staggerDelayOf({ rect: { left: 500, top: 250 }, view }), IMAGES_STAGGER_SPAN_MS / 2)
})

test('staggerDelayOf: cells partly off screen stay within the span', () => {
  assert.equal(staggerDelayOf({ rect: { left: 20, top: 0 }, view }), 0)
  assert.equal(staggerDelayOf({ rect: { left: 2000, top: 900 }, view }), IMAGES_STAGGER_SPAN_MS)
})
