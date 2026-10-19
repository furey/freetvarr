import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  NATIVE_LIVE_HOLD_BACK_S, MIN_REWIND_S, liveWindowOf, steadyLiveWindowOf, videoLiveInputOf, canRewind, rangesOf,
} from '../src/web/live-edge.js'
import { SEEK_FLOOR_MARGIN_S } from '../src/web/live-start.js'
import { liveEdgeOf, steadyBehindMinutesOf } from '../src/web/player-labels.js'

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
  assert.equal(liveEdgeOf({ behindMinutes: steadyBehindMinutesOf({ seconds: window.behind }) }).label, '1 min behind')
})

test('native HLS: duration is Infinity, so the edge comes from the last seekable range', () => {
  const window = liveWindowOf({ seekable: [[12, 72]], duration: Infinity, currentTime: 66 })
  assert.equal(window.target, 72 - NATIVE_LIVE_HOLD_BACK_S)
  assert.equal(window.floor, 12 + SEEK_FLOOR_MARGIN_S)
  assert.equal(window.behind, 0)
  assert.equal(liveEdgeOf({ behindMinutes: steadyBehindMinutesOf({ seconds: window.behind }) }).atEdge, true)
})

test('native HLS: the playhead ahead of the hold-back point still counts as live', () => {
  const window = liveWindowOf({ seekable: [[0, 40]], duration: Infinity, currentTime: 39 })
  assert.equal(window.behind, 0)
})

test('native HLS: going live after a pause lands on the target and the LIVE marker returns', () => {
  const paused = liveWindowOf({ seekable: [[0, 130]], duration: Infinity, currentTime: 50 })
  assert.equal(paused.behind, 74)
  assert.equal(liveEdgeOf({ behindMinutes: steadyBehindMinutesOf({ seconds: paused.behind }) }).label, '1 min behind')
  const after = liveWindowOf({ seekable: [[0, 130]], duration: Infinity, currentTime: paused.target })
  assert.equal(after.behind, 0)
  assert.equal(liveEdgeOf({ behindMinutes: steadyBehindMinutesOf({ seconds: after.behind }) }).atEdge, true)
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

const SEGMENT_S = 6
const DVR_S = 120

const nativeVideoAt = ({ wallS, currentTime }) => {
  const end = 60 + SEGMENT_S * Math.floor(wallS / SEGMENT_S)
  return {
    seekable: timeRanges([[Math.max(0, end - DVR_S), end]]),
    duration: Infinity,
    currentTime,
  }
}

const steadyRunOf = ({ seconds, currentTimeAt, bufferSeconds = 90 }) => {
  let anchor = null
  return Array.from({ length: seconds * 4 }, (_, i) => {
    const wallS = 1000 + i / 4
    const video = nativeVideoAt({ wallS: i / 4, currentTime: currentTimeAt(i / 4) })
    const input = { ...videoLiveInputOf(video), bufferSeconds }
    const steady = steadyLiveWindowOf({ ...input, anchor, wallS })
    anchor = steady.anchor
    return { raw: liveWindowOf(input), steady }
  })
}

const spreadOf = (values) => Math.max(...values) - Math.min(...values)

test('native HLS: the raw behind value saw-tooths by a segment while playing', () => {
  const run = steadyRunOf({ seconds: 60, currentTimeAt: (t) => 48 + t })
  assert.ok(spreadOf(run.slice(8).map((s) => s.raw.behind)) >= SEGMENT_S - 0.5)
})

test('native HLS: the steady behind value holds still while playing', () => {
  const run = steadyRunOf({ seconds: 60, currentTimeAt: (t) => 48 + t })
  const settled = run.slice(SEGMENT_S * 4 + 1)
  assert.ok(spreadOf(settled.map((s) => s.steady.behind)) < 0.5)
  const shown = settled.map((s) => steadyBehindMinutesOf({ seconds: s.steady.behind }))
  assert.deepEqual([...new Set(shown)], [0])
})

test('native HLS: once the buffer is full the steady window slides smoothly, so the scrubber thumb holds still', () => {
  const currentTimeAt = (t) => 48 + t
  const run = steadyRunOf({ seconds: 90, currentTimeAt })
  const full = run.slice(55 * 4)
  const thumbOf = (window, i) => (currentTimeAt(55 + i / 4) - window.floor) / window.span
  assert.ok(spreadOf(full.map((s, i) => thumbOf(s.raw, i))) > 0.05)
  assert.ok(spreadOf(full.map((s, i) => thumbOf(s.steady, i))) < 0.005)
  assert.ok(spreadOf(full.map((s) => s.steady.span)) < 0.5)
  for (const { raw, steady } of full) assert.ok(steady.target >= raw.target)
})

test('native HLS: paused behind live, the steady behind value only ever grows', () => {
  const run = steadyRunOf({ seconds: 90, currentTimeAt: () => 30 })
  const behind = run.map((s) => s.steady.behind)
  for (let i = 1; i < behind.length; i++) assert.ok(behind[i] >= behind[i - 1] - 0.01)
  const jumpsOf = (values) => values.slice(1).map((v, i) => Math.abs(v - values[i]))
  assert.ok(Math.max(...jumpsOf(run.map((s) => s.raw.behind))) >= SEGMENT_S - 0.5)
  assert.ok(Math.max(...jumpsOf(behind)) < 0.5)
})

test('native HLS: resumed behind live, the shown minutes never flip back and forth', () => {
  const run = steadyRunOf({ seconds: 120, currentTimeAt: (t) => (t < 40 ? 48 : 48 + (t - 40)) })
  let previous = 0
  const shown = run.map((s) => {
    previous = steadyBehindMinutesOf({ seconds: s.steady.behind, previous })
    return previous
  })
  const changes = shown.filter((m, i) => i > 0 && m !== shown[i - 1])
  assert.deepEqual(changes, [1])
  assert.equal(shown.at(-1), 1)
})

test('a new stream with an edge far from the old one resets the anchor', () => {
  const first = steadyLiveWindowOf({ seekable: [[0, 600]], duration: Infinity, currentTime: 594, wallS: 10 })
  const next = steadyLiveWindowOf({ seekable: [[0, 20]], duration: Infinity, currentTime: 14, wallS: 11, anchor: first.anchor })
  assert.equal(next.target, 14)
  assert.equal(next.behind, 0)
})

test('no edge yet means no anchor', () => {
  const steady = steadyLiveWindowOf({ seekable: [], duration: NaN, currentTime: 0, wallS: 5 })
  assert.equal(steady.anchor, null)
  assert.equal(steady.target, null)
})
