import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LIVE_START_BUFFER_S,
  LIVE_START_MAX_WAIT_MS,
  bufferedAhead,
  isReadyToStart,
} from '../src/web/live-start.js'

test('bufferedAhead measures the range under the playhead', () => {
  assert.equal(bufferedAhead({ ranges: [[0, 3]], position: 1 }), 2)
  assert.equal(bufferedAhead({ ranges: [[0, 1], [5, 9]], position: 6 }), 3)
  assert.equal(bufferedAhead({ ranges: [], position: 0 }), 0)
  assert.equal(bufferedAhead({ ranges: [[0, 3]], position: 3 }), 0)
})

test('bufferedAhead bridges a small gap before the first range', () => {
  assert.equal(bufferedAhead({ ranges: [[0.02, 3.02]], position: 0 }), 3)
  assert.equal(bufferedAhead({ ranges: [[2, 5]], position: 0 }), 0)
})

test('isReadyToStart waits for the start buffer', () => {
  const position = 0
  assert.equal(isReadyToStart({ ranges: [[0, 1]], position, waitedMs: 0 }), false)
  assert.equal(isReadyToStart({ ranges: [[0, 2]], position, waitedMs: 1_000 }), false)
  assert.equal(isReadyToStart({ ranges: [[0, LIVE_START_BUFFER_S]], position, waitedMs: 1_000 }), true)
})

test('isReadyToStart gives up waiting after the longest wait', () => {
  assert.equal(isReadyToStart({ ranges: [[0, 1]], position: 0, waitedMs: LIVE_START_MAX_WAIT_MS }), true)
  assert.equal(isReadyToStart({ ranges: [], position: 0, waitedMs: LIVE_START_MAX_WAIT_MS - 1 }), false)
})
