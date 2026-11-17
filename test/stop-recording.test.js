import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  STOP_RECORDING_KEEP_MIN_MS,
  keepsStoppedRecording,
  recordedMsOf,
  stopConfirmOf,
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
  const inLibrary = stopRecordingOutcome({ recordedMs: 12 * MINUTE + 30_000 })
  assert.match(inLibrary, /\b12 minutes\b/)
  assert.match(inLibrary, /\blibrary\b/i)
  assert.doesNotMatch(inLibrary, /TVHeadend|delete/i)
  const inTvheadend = stopRecordingOutcome({ recordedMs: 12 * MINUTE, addsToLibrary: false })
  assert.match(inTvheadend, /\b12 minutes\b/)
  assert.match(inTvheadend, /TVHeadend/)
  assert.doesNotMatch(inTvheadend, /library|delete/i)
})

test('stopRecordingOutcome says a short recording is deleted', () => {
  const twoMinutes = stopRecordingOutcome({ recordedMs: 2 * MINUTE })
  const oneMinute = stopRecordingOutcome({ recordedMs: MINUTE })
  const seconds = stopRecordingOutcome({ recordedMs: 20_000 })
  for (const outcome of [twoMinutes, oneMinute, seconds]) {
    assert.match(outcome, /delete/i)
    assert.doesNotMatch(outcome, /library|TVHeadend|undefined|NaN/i)
  }
  assert.match(twoMinutes, /\b2 minutes\b/)
  assert.match(oneMinute, /\b1 minute\b/)
  assert.doesNotMatch(seconds, /\d|minute/)
})

test('stopConfirmOf: under 5 minutes is a red Stop and delete that names what goes', () => {
  const copy = stopConfirmOf({ recordedMs: 3 * MINUTE + 20_000, seriesChannelLabel: 'on 9HD Sydney' })
  assert.equal(copy.title, 'Stop recording?')
  assert.equal(copy.danger, true)
  assert.equal(copy.goLabel, 'Stop and delete')
  assert.equal(copy.deleted.length, 1)
  assert.equal(copy.deleted[0].icon, 'trash')
  assert.match(copy.deleted[0].title, /\b3 minutes\b/)
  assert.match(copy.deleted[0].detail, /\b5 minutes\b/)
  assert.match(copy.note, /repeats/i)
  assert.equal(copy.noteIcon, 'info')
  assert.equal(copy.stays.length, 1)
  assert.equal(copy.stays[0].icon, 'check')
  assert.equal(copy.stays[0].title, 'The series recording')
  assert.match(copy.stays[0].detail, /next episode/i)
  assert.ok(copy.stays[0].detail.includes('on 9HD Sydney'))
  assert.match(copy.undo, /undo/i)
})

test('stopConfirmOf: a one-off under a minute has nothing that stays', () => {
  const copy = stopConfirmOf({ recordedMs: 20_000 })
  assert.doesNotMatch(copy.deleted[0].title, /\d|minute|undefined/)
  assert.match(copy.deleted[0].title, /recorded/i)
  assert.equal(copy.deleted.length, 1)
  assert.equal(copy.note, undefined)
  assert.deepEqual(copy.stays, [])
})

test('stopConfirmOf: from 5 minutes the recording stays and the button is not red', () => {
  const copy = stopConfirmOf({ recordedMs: STOP_RECORDING_KEEP_MIN_MS, seriesChannelLabel: 'on any channel' })
  assert.equal(copy.danger, false)
  assert.equal(copy.goLabel, 'Stop recording')
  assert.equal(copy.deleted, undefined)
  assert.equal(copy.stays.length, 2)
  assert.match(copy.stays[0].title, /\b5 minutes\b/)
  assert.equal(copy.stays[1].title, 'The series recording')
  assert.match(copy.stays[0].detail, /library/i)
  assert.doesNotMatch(copy.stays[0].detail, /TVHeadend/)
  const heldDetail = stopConfirmOf({ recordedMs: 12 * MINUTE, addsToLibrary: false }).stays[0].detail
  assert.match(heldDetail, /TVHeadend/)
  assert.doesNotMatch(heldDetail, /library/i)
})

test('the stop dialog draws the repeats note with its own icon, not the trash of the deleted list', async () => {
  const { readFile } = await import('node:fs/promises')
  const source = await readFile(new URL('../src/web/components/library-menus.js', import.meta.url), 'utf8')
  const dialog = source.slice(source.indexOf('export const ActionConfirm'))
  assert.match(dialog, /<p v-if="copy\.note" class="library-dialog-note"><menu-icon :name="copy\.noteIcon \|\| 'clock'" \/>/)
})
