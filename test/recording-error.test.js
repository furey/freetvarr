import { test } from 'node:test'
import assert from 'node:assert/strict'

import { diagnoseRecordingError } from '../src/web/recording-error.js'

test('diagnoseRecordingError: names the missing file path', () => {
  const d = diagnoseRecordingError('file not found at /data/rec/Quiz.ts; check the recordings mount')
  assert.equal(d.title, 'Recording file not found')
  assert.equal(d.error, 'file not found at /data/rec/Quiz.ts; check the recordings mount')
  assert.equal(d.doc, 'guide/troubleshooting#skipped-recordings')
})

test('diagnoseRecordingError: reads both sizes of a short copy', () => {
  const d = diagnoseRecordingError('short copy: on-disk 1200000000 bytes vs TVHeadend 1900000000 bytes (Δ 700000000)')
  assert.equal(d.meaning, 'The imported file is 1.20 GB, but TVHeadend reported 1.90 GB.')
})

test('diagnoseRecordingError: names the missing library folder', () => {
  const d = diagnoseRecordingError('movies folder /data/media/movies not found; mount it or change it in Settings')
  assert.equal(d.title, 'Movies folder not found')
  assert.match(d.steps[1], /Movies folder/)
})

test('diagnoseRecordingError: covers path mismatches, TVHeadend status, and permissions', () => {
  assert.equal(diagnoseRecordingError('TVHeadend file path is outside the recordings mount (Completed OK)').title, 'Recording path does not match')
  assert.equal(diagnoseRecordingError('TVHeadend reported: Data errors').title, 'TVHeadend reported a problem')
  assert.equal(diagnoseRecordingError("EACCES: permission denied, link '/a' -> '/b'").title, 'Permission denied')
})

test('diagnoseRecordingError: falls back to general steps', () => {
  const d = diagnoseRecordingError('something odd')
  assert.equal(d.title, 'Import error')
  assert.equal(d.error, 'something odd')
})
