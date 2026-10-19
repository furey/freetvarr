import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NATIVE_LIVE_HOLD_BACK_S, MIN_REWIND_S, liveWindowOf, canRewind, rangesOf } from '../src/web/live-edge.js'
import { SEEK_FLOOR_MARGIN_S } from '../src/web/live-start.js'
import { liveEdgeOf } from '../src/web/player-labels.js'

const timeRanges = (pairs) => ({ length: pairs.length, start: (i) => pairs[i][0], end: (i) => pairs[i][1] })

test('rangesOf turns TimeRanges into pairs and tolerates a missing object', () => {
  assert.deepEqual(rangesOf(timeRanges([[0, 4], [6, 9]])), [[0, 4], [6, 9]])
  assert.deepEqual(rangesOf(null), [])
})

test('hls.js: the target is liveSyncPosition and the floor sits behind the oldest fragment', () => {
  const window = liveWindowOf({
    seekable: [[100, 160]],
    duration: 160,
    currentTime: 156,
    hlsSyncPosition: 156,
    hlsOldestSecond: 100,
  })
  assert.equal(window.target, 156)
  assert.equal(window.floor, 100 + SEEK_FLOOR_MARGIN_S)
  assert.equal(window.behind, 0)
  assert.equal(window.span, 52)
})

test('hls.js: a paused player falls behind as liveSyncPosition moves on', () => {
  const window = liveWindowOf({ seekable: [[100, 230]], currentTime: 156, hlsSyncPosition: 226, hlsOldestSecond: 100 })
  assert.equal(window.behind, 70)
  assert.equal(liveEdgeOf({ behindSeconds: window.behind }).label, '1 min behind')
})

test('native HLS: duration is Infinity, so the edge comes from the last seekable range', () => {
  const window = liveWindowOf({ seekable: [[12, 72]], duration: Infinity, currentTime: 66 })
  assert.equal(window.target, 72 - NATIVE_LIVE_HOLD_BACK_S)
  assert.equal(window.floor, 12 + SEEK_FLOOR_MARGIN_S)
  assert.equal(window.behind, 0)
  assert.equal(liveEdgeOf({ behindSeconds: window.behind }).atEdge, true)
})

test('native HLS: the playhead ahead of the hold-back point still counts as live', () => {
  const window = liveWindowOf({ seekable: [[0, 40]], duration: Infinity, currentTime: 39 })
  assert.equal(window.behind, 0)
})

test('native HLS: going live after a pause lands on the target and the LIVE marker returns', () => {
  const paused = liveWindowOf({ seekable: [[0, 130]], duration: Infinity, currentTime: 50 })
  assert.equal(paused.behind, 74)
  assert.equal(liveEdgeOf({ behindSeconds: paused.behind }).label, '1 min behind')
  const after = liveWindowOf({ seekable: [[0, 130]], duration: Infinity, currentTime: paused.target })
  assert.equal(after.behind, 0)
  assert.equal(liveEdgeOf({ behindSeconds: after.behind }).atEdge, true)
})

test('native HLS: the last of several seekable ranges is the edge', () => {
  const window = liveWindowOf({ seekable: [[0, 10], [20, 50]], duration: Infinity, currentTime: 30 })
  assert.equal(window.target, 44)
  assert.equal(window.behind, 14)
})

test('a growing recording with a finite duration and no seekable ranges uses the duration', () => {
  const window = liveWindowOf({ seekable: [], duration: 600, currentTime: 0, fromStart: true })
  assert.equal(window.target, 594)
  assert.equal(window.floor, 0)
  assert.equal(window.behind, 594)
})

test('nothing is known before metadata', () => {
  const window = liveWindowOf({ seekable: [], duration: NaN, currentTime: 0 })
  assert.deepEqual(window, { target: null, floor: null, behind: 0, span: 0 })
  assert.equal(canRewind(window), false)
})

test('the server buffer caps how far back the floor reaches', () => {
  const window = liveWindowOf({ seekable: [[0, 1000]], duration: Infinity, currentTime: 994, bufferSeconds: 300 })
  assert.equal(window.target, 994)
  assert.equal(window.floor, 694)
})

test('a short window just after tuning in allows a rewind once a few seconds exist', () => {
  const early = liveWindowOf({ seekable: [[0, 8]], duration: Infinity, currentTime: 2 })
  assert.equal(canRewind(early), false)
  const later = liveWindowOf({ seekable: [[0, 18]], duration: Infinity, currentTime: 12 })
  assert.ok(later.span >= MIN_REWIND_S)
  assert.equal(canRewind(later), true)
})
