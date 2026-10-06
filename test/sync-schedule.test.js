import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  CUSTOM_SYNC_SCHEDULE,
  DEFAULT_SYNC_CRON,
  normaliseCron,
  syncSchedulePreset,
} from '../src/web/sync-schedule.js'

test('syncSchedulePreset: each preset maps to itself', () => {
  assert.equal(syncSchedulePreset('*/15 * * * *'), '*/15 * * * *')
  assert.equal(syncSchedulePreset('*/30 * * * *'), '*/30 * * * *')
  assert.equal(syncSchedulePreset('0 * * * *'), '0 * * * *')
})

test('syncSchedulePreset: equivalent spellings map to their preset', () => {
  assert.equal(syncSchedulePreset('0,15,30,45 * * * *'), '*/15 * * * *')
  assert.equal(syncSchedulePreset('0,30 * * * *'), '*/30 * * * *')
  assert.equal(syncSchedulePreset('0 */1 * * *'), '0 * * * *')
})

test('syncSchedulePreset: extra whitespace still matches', () => {
  assert.equal(syncSchedulePreset('  */30   *  * * *  '), '*/30 * * * *')
})

test('syncSchedulePreset: empty or missing means the default schedule', () => {
  for (const value of ['', '   ', null, undefined]) {
    assert.equal(syncSchedulePreset(value), DEFAULT_SYNC_CRON, String(value))
  }
})

test('syncSchedulePreset: any other expression is custom', () => {
  for (const value of ['*/5 * * * *', '0 */2 * * *', '15 * * * *', '0 */30 * * * *', 'nonsense']) {
    assert.equal(syncSchedulePreset(value), CUSTOM_SYNC_SCHEDULE, value)
  }
})

test('normaliseCron: trims and collapses whitespace', () => {
  assert.equal(normaliseCron(' 0  *\t* * * '), '0 * * * *')
  assert.equal(normaliseCron(null), '')
})
