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

test('stopConfirmOf: under 5 minutes is a red Stop and delete that names what goes', () => {
  const copy = stopConfirmOf({ recordedMs: 3 * MINUTE + 20_000, seriesChannelLabel: 'on 9HD Sydney' })
  assert.equal(copy.title, 'Stop recording?')
  assert.equal(copy.danger, true)
  assert.equal(copy.goLabel, 'Stop and delete')
  assert.deepEqual(copy.deleted, [{ icon: 'trash', title: 'The 3 minutes recorded so far', detail: 'Freetvarr keeps a stopped recording only after 5 minutes' }])
  assert.equal(copy.note, 'TVHeadend counts this episode as recorded, so its repeats do not record.')
  assert.equal(copy.noteIcon, 'info')
  assert.deepEqual(copy.stays, [{ icon: 'check', title: 'The series recording', detail: 'The next episode still records on 9HD Sydney' }])
  assert.equal(copy.undo, "You can't undo this.")
})

test('stopConfirmOf: a one-off under a minute has nothing that stays', () => {
  const copy = stopConfirmOf({ recordedMs: 20_000 })
  assert.equal(copy.deleted[0].title, 'What it recorded so far')
  assert.equal(copy.deleted.length, 1)
  assert.equal(copy.note, undefined)
  assert.deepEqual(copy.stays, [])
})

test('stopConfirmOf: from 5 minutes the recording stays and the button is not red', () => {
  const copy = stopConfirmOf({ recordedMs: STOP_RECORDING_KEEP_MIN_MS, seriesChannelLabel: 'on any channel' })
  assert.equal(copy.danger, false)
  assert.equal(copy.goLabel, 'Stop recording')
  assert.equal(copy.deleted, undefined)
  assert.deepEqual(copy.stays.map((line) => line.title), ['The 5 minutes recorded so far', 'The series recording'])
  assert.equal(copy.stays[0].detail, 'They go into your library')
  assert.equal(stopConfirmOf({ recordedMs: 12 * MINUTE, addsToLibrary: false }).stays[0].detail, 'They stay in TVHeadend')
})

test('the stop dialog draws the repeats note with its own icon, not the trash of the deleted list', async () => {
  const { readFile } = await import('node:fs/promises')
  const source = await readFile(new URL('../src/web/components/library-menus.js', import.meta.url), 'utf8')
  const dialog = source.slice(source.indexOf('export const ActionConfirm'))
  assert.match(dialog, /<p v-if="copy\.note" class="library-dialog-note"><menu-icon :name="copy\.noteIcon \|\| 'clock'" \/>/)
})
