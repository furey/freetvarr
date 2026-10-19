import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recordingChipOf } from '../src/web/recording-chip.js'

const NOW = Date.parse('2026-10-19T08:00:00Z')

test('recordingChipOf: nothing when no healthy recording is running', () => {
  assert.equal(recordingChipOf({ active: [], nowMs: NOW }), null)
  assert.equal(recordingChipOf({ active: [{ title: 'X', failed: true }], nowMs: NOW }), null)
})

test('recordingChipOf: one recording names the show and the time left', () => {
  const chip = recordingChipOf({ active: [{ title: 'The Block', stop: NOW + 34 * 60_000 - 1 }], nowMs: NOW })
  assert.deepEqual(chip, { label: 'Recording The Block', detail: '34 min left' })
})

test('recordingChipOf: several recordings count the shows', () => {
  const chip = recordingChipOf({ active: [{ title: 'A' }, { title: 'B' }], nowMs: NOW })
  assert.deepEqual(chip, { label: 'Recording 2 shows', detail: '' })
})
