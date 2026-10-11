import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  STOP_RECORDING_KEEP_MIN_MS,
  keepsStoppedRecording,
  recordedMsOf,
  stopRecordingOutcome,
} from '../src/web/stop-recording.js'

const MINUTE = 60_000

test('recordedMsOf counts from the recording start and never goes negative', () => {
  assert.equal(recordedMsOf({ recordingSince: 1_000, nowMs: 4_000 }), 3_000)
  assert.equal(recordedMsOf({ recordingSince: 5_000, nowMs: 4_000 }), 0)
  assert.equal(recordedMsOf({ recordingSince: null, nowMs: 4_000 }), 0)
})

test('keepsStoppedRecording keeps a recording of five minutes or more', () => {
  assert.equal(STOP_RECORDING_KEEP_MIN_MS, 5 * MINUTE)
  assert.equal(keepsStoppedRecording(5 * MINUTE), true)
  assert.equal(keepsStoppedRecording(5 * MINUTE - 1), false)
})

test('stopRecordingOutcome says the recording stays in the library', () => {
  assert.equal(stopRecordingOutcome({ recordedMs: 12 * MINUTE + 30_000 }),
    'Stops the recording. The 12 minutes recorded so far stay in your library.')
  assert.equal(stopRecordingOutcome({ recordedMs: 12 * MINUTE, addsToLibrary: false }),
    'Stops the recording. The 12 minutes recorded so far stay in TVHeadend.')
})

test('stopRecordingOutcome says a short recording is deleted', () => {
  assert.equal(stopRecordingOutcome({ recordedMs: 2 * MINUTE }),
    'Stops the recording and deletes the 2 minutes recorded so far.')
  assert.equal(stopRecordingOutcome({ recordedMs: MINUTE }),
    'Stops the recording and deletes the 1 minute recorded so far.')
  assert.equal(stopRecordingOutcome({ recordedMs: 20_000 }),
    'Stops the recording and deletes what it recorded so far.')
})
