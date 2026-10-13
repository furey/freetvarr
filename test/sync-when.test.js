import { test } from 'node:test'
import assert from 'node:assert/strict'

import { syncWhen, syncTook } from '../src/web/sync-when.js'

const timeZone = 'Australia/Sydney'
const at = (iso) => Date.parse(iso)
const nowMs = at('2026-10-13T12:00:00+11:00')

test('syncWhen: a same-day sync shares one day and one am/pm', () => {
  const when = syncWhen({ startedMs: at('2026-10-13T09:30:00+11:00'), finishedMs: at('2026-10-13T10:03:00+11:00'), nowMs, timeZone })
  assert.equal(when, 'Today 9:30–10:03am')
})

test('syncWhen: keeps both periods when a sync crosses noon', () => {
  const when = syncWhen({ startedMs: at('2026-10-12T11:58:00+11:00'), finishedMs: at('2026-10-12T12:04:00+11:00'), nowMs, timeZone })
  assert.equal(when, 'Yesterday 11:58am–12:04pm')
})

test('syncWhen: a sync within one minute shows one time', () => {
  const when = syncWhen({ startedMs: at('2026-10-10T21:30:05+11:00'), finishedMs: at('2026-10-10T21:30:40+11:00'), nowMs, timeZone })
  assert.equal(when, '10 Oct 9:30pm')
})

test('syncWhen: a sync across midnight names both days', () => {
  const when = syncWhen({ startedMs: at('2026-10-10T23:58:00+11:00'), finishedMs: at('2026-10-11T00:04:00+11:00'), nowMs, timeZone })
  assert.equal(when, '10 Oct 11:58pm – 11 Oct 12:04am')
})

test('syncWhen: a running sync ends with now, and an old one shows its year', () => {
  assert.equal(syncWhen({ startedMs: at('2026-10-13T11:59:00+11:00'), nowMs, timeZone }), 'Today 11:59am – now')
  assert.equal(syncWhen({ startedMs: at('2025-12-01T08:00:00+11:00'), finishedMs: at('2025-12-01T08:00:20+11:00'), nowMs, timeZone }), '1 Dec 2025 8:00am')
})

test('syncTook: seconds, minutes, then hours', () => {
  assert.equal(syncTook(400), 'under 1s')
  assert.equal(syncTook(33_000), '33s')
  assert.equal(syncTook(125_000), '2m 05s')
  assert.equal(syncTook(3_780_000), '1h 03m')
  assert.equal(syncTook(null), '')
})
