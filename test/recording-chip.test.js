import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recordingChipOf, recordingChipTargetOf } from '../src/web/recording-chip.js'

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

test('recordingChipTargetOf: one recording opens its show page, with Library as the way back', () => {
  const active = [{ title: 'Rugby League World Cup 2026' }]
  assert.deepEqual(recordingChipTargetOf({ active, currentHash: '#/home' }), {
    href: '#/recordings/show/rugby-league-world-cup-2026',
    originHash: '#/recordings',
  })
  assert.equal(recordingChipTargetOf({ active, currentHash: '#/recordings/scheduled' }).originHash, '#/recordings')
})

test('recordingChipTargetOf: from the Library tab the way back keeps its query', () => {
  const active = [{ title: 'The Block' }]
  assert.equal(recordingChipTargetOf({ active, currentHash: '#/recordings?view=grid' }).originHash, '#/recordings?view=grid')
})

test('recordingChipTargetOf: two channels of one show open that show; different shows open Scheduled', () => {
  const twins = [{ title: 'The Block' }, { title: 'The Block' }, { title: 'Bad', failed: true }]
  assert.equal(recordingChipTargetOf({ active: twins }).href, '#/recordings/show/the-block')
  const both = [{ title: 'The Block' }, { title: 'Hard Quiz' }]
  assert.deepEqual(recordingChipTargetOf({ active: both }), { href: '#/recordings/scheduled', originHash: null })
  assert.deepEqual(recordingChipTargetOf({ active: [] }), { href: '#/recordings/scheduled', originHash: null })
})
