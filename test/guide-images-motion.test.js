import { test } from 'node:test'
import assert from 'node:assert/strict'
import { staggerDelayOf, rowStaggerDelaysOf, IMAGES_STAGGER_SPAN_MS, LIST_STAGGER_SPAN_MS, LIST_JITTER_MS } from '../src/web/shared/guide-images-motion.js'

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

test('rowStaggerDelaysOf: rows run top to bottom across the list span, give or take a small jitter', () => {
  const delays = rowStaggerDelaysOf({ tops: [100, 200, 300, 400, 500] })
  assert.ok(delays[0] <= LIST_JITTER_MS / 2)
  assert.ok(Math.abs(delays[4] - LIST_STAGGER_SPAN_MS) <= LIST_JITTER_MS / 2)
  assert.ok(delays[2] > delays[0] && delays[4] > delays[2])
})

test('rowStaggerDelaysOf: the same rows always get the same delays', () => {
  const tops = [10, 60, 110]
  assert.deepEqual(rowStaggerDelaysOf({ tops }), rowStaggerDelaysOf({ tops }))
})
