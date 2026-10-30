import { test } from 'node:test'
import assert from 'node:assert/strict'

import { syncTook, syncTime, syncDay } from '../src/web/sync-when.js'

const timeZone = 'Australia/Sydney'
const at = (iso) => Date.parse(iso)
const nowMs = at('2026-10-13T12:00:00+11:00')

test('syncTook: seconds, minutes, then hours', () => {
  assert.equal(syncTook(400), 'under 1s')
  assert.equal(syncTook(33_000), '33s')
  assert.equal(syncTook(125_000), '2m 05s')
  assert.equal(syncTook(3_780_000), '1h 03m')
  assert.equal(syncTook(null), '')
})

test('syncTime: drops the day, and a sync across midnight shows both clocks', () => {
  assert.equal(syncTime({ startedMs: at('2026-10-13T09:30:00+11:00'), finishedMs: at('2026-10-13T10:03:00+11:00'), timeZone }), '9:30–10:03am')
  assert.equal(syncTime({ startedMs: at('2026-10-10T23:58:00+11:00'), finishedMs: at('2026-10-11T00:04:00+11:00'), timeZone }), '11:58pm – 12:04am')
  assert.equal(syncTime({ startedMs: at('2026-10-13T11:59:00+11:00'), timeZone }), '11:59am – now')
})

test('syncDay: names today, yesterday, then the date', () => {
  assert.equal(syncDay({ ms: at('2026-10-13T09:30:00+11:00'), nowMs, timeZone }), 'Today')
  assert.equal(syncDay({ ms: at('2026-10-12T09:30:00+11:00'), nowMs, timeZone }), 'Yesterday')
  assert.equal(syncDay({ ms: at('2026-10-10T09:30:00+11:00'), nowMs, timeZone }), '10 Oct')
})
