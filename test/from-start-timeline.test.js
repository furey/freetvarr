import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  OVERRUN_STEP_S, scheduledSecondsOf, fromStartScaleOf, fromStartTimelineOf, clampFromStartSeek, fromStartEndMsOf,
} from '../src/web/from-start-timeline.js'

const START = Date.UTC(2026, 9, 23, 9, 0)

test('the scale is the programme slot from recording start to the padded scheduled end', () => {
  assert.equal(scheduledSecondsOf({ startedAtMs: START, scheduledEndMs: START + 2 * 3600_000 }), 7200)
  assert.equal(scheduledSecondsOf({ startedAtMs: START, scheduledEndMs: START }), null)
  assert.equal(scheduledSecondsOf({ startedAtMs: null, scheduledEndMs: START }), null)
})

test('the scale stays fixed while the recording grows inside the slot', () => {
  const scales = [60, 600, 3600, 7100].map((edgeSeconds) => fromStartScaleOf({ scheduledSeconds: 7200, edgeSeconds }))
  assert.deepEqual(scales, [7200, 7200, 7200, 7200])
})

test('an overrun extends the scale once by a step, then holds it until the edge reaches it again', () => {
  const first = fromStartScaleOf({ scheduledSeconds: 7200, edgeSeconds: 7200 })
  assert.equal(first, 7200 + OVERRUN_STEP_S)
  assert.equal(fromStartScaleOf({ scheduledSeconds: 7200, edgeSeconds: 7300, heldSeconds: first }), first)
  assert.equal(fromStartScaleOf({ scheduledSeconds: 7200, edgeSeconds: first, heldSeconds: first }), first + OVERRUN_STEP_S)
})

test('a finished recording scales to its recorded length', () => {
  assert.equal(fromStartScaleOf({ scheduledSeconds: 7200, edgeSeconds: 6950, heldSeconds: 7200, finished: true }), 6950)
})

test('without a scheduled end the scale keeps a step of room past the edge', () => {
  assert.equal(fromStartScaleOf({ edgeSeconds: 120 }), 120 + OVERRUN_STEP_S)
})

test('the timeline places played, available, and edge against the fixed scale', () => {
  assert.deepEqual(fromStartTimelineOf({ position: 900, edgeSeconds: 1800, scaleSeconds: 7200 }), {
    position: 900, playedPercent: 12.5, availablePercent: 25, edgePercent: 25,
  })
})

test('the played position never passes the recorded edge or the scale', () => {
  assert.equal(fromStartTimelineOf({ position: 5000, edgeSeconds: 1800, scaleSeconds: 7200 }).playedPercent, 25)
  assert.equal(fromStartTimelineOf({ position: 10, edgeSeconds: 9000, scaleSeconds: 7200 }).availablePercent, 100)
  assert.equal(fromStartTimelineOf({ position: NaN, edgeSeconds: 60, scaleSeconds: 0 }).position, 0)
})

test('a seek past the recorded edge stops at the edge', () => {
  assert.equal(clampFromStartSeek({ value: 4000, edgeSeconds: 1800 }), 1800)
  assert.equal(clampFromStartSeek({ value: -5, edgeSeconds: 1800 }), 0)
  assert.equal(clampFromStartSeek({ value: 600, edgeSeconds: 1800 }), 600)
})

test('the end label time is the recording start plus the scale', () => {
  assert.equal(fromStartEndMsOf({ startedAtMs: START, scaleSeconds: 7200 }), START + 7200_000)
  assert.equal(fromStartEndMsOf({ startedAtMs: null, scaleSeconds: 7200 }), null)
})
