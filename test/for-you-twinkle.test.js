import { test } from 'node:test'
import assert from 'node:assert/strict'
import { twinkleGateOf } from '../src/web/for-you-twinkle.js'

const base = { played: false, reducedMotion: false, visible: true, introActive: false }

test('twinkleGateOf: plays when nothing blocks it', () => {
  assert.equal(twinkleGateOf(base), 'play')
})

test('twinkleGateOf: never plays twice or under reduced motion', () => {
  assert.equal(twinkleGateOf({ ...base, played: true }), 'skip')
  assert.equal(twinkleGateOf({ ...base, reducedMotion: true }), 'skip')
})

test('twinkleGateOf: skips when the setting is off', () => {
  assert.equal(twinkleGateOf({ ...base, animate: false }), 'skip')
  assert.equal(twinkleGateOf({ ...base, animate: true }), 'play')
})

test('twinkleGateOf: waits for a visible tab, then for the brand intro', () => {
  assert.equal(twinkleGateOf({ ...base, visible: false, introActive: true }), 'wait-visible')
  assert.equal(twinkleGateOf({ ...base, introActive: true }), 'wait-intro')
})
