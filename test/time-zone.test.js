import { test } from 'node:test'
import assert from 'node:assert/strict'

import { applyStoredTimeZone, isKnownTimeZone, resolveTimeZone } from '../src/time-zone.js'

const settingsWith = (value) => async (key) => (key === 'time_zone' ? value : null)

test('isKnownTimeZone: accepts IANA zones and rejects anything else', () => {
  assert.equal(isKnownTimeZone('Australia/Sydney'), true)
  assert.equal(isKnownTimeZone('Mars/Olympus'), false)
  assert.equal(isKnownTimeZone(''), false)
  assert.equal(isKnownTimeZone(null), false)
})

test('resolveTimeZone: .env beats the stored zone, which beats the system', () => {
  assert.deepEqual(resolveTimeZone({ envTz: 'UTC', stored: 'Australia/Sydney', system: 'Etc/UTC' }), { zone: 'UTC', source: 'env' })
  assert.deepEqual(resolveTimeZone({ envTz: '', stored: 'Australia/Sydney', system: 'Etc/UTC' }), { zone: 'Australia/Sydney', source: 'setting' })
  assert.deepEqual(resolveTimeZone({ envTz: '', stored: 'Mars/Olympus', system: 'Etc/UTC' }), { zone: 'Etc/UTC', source: 'system' })
})

test('resolveTimeZone: an unknown .env zone still wins so Doctor can report it', () => {
  assert.deepEqual(resolveTimeZone({ envTz: 'Nowhere/Land', stored: 'Australia/Sydney', system: 'UTC' }), { zone: 'Nowhere/Land', source: 'env' })
})

test('applyStoredTimeZone: applies a stored zone when .env sets none', async () => {
  const env = {}
  const result = await applyStoredTimeZone({ getSetting: settingsWith('Australia/Perth'), envTz: '', env })
  assert.deepEqual(result, { zone: 'Australia/Perth', source: 'setting' })
  assert.equal(env.TZ, 'Australia/Perth')
})

test('applyStoredTimeZone: leaves TZ alone when .env sets it or the stored zone is unknown', async () => {
  const fromEnv = { TZ: 'UTC' }
  await applyStoredTimeZone({ getSetting: settingsWith('Australia/Perth'), envTz: 'UTC', env: fromEnv })
  assert.equal(fromEnv.TZ, 'UTC')
  const unknown = {}
  await applyStoredTimeZone({ getSetting: settingsWith('Mars/Olympus'), envTz: '', env: unknown })
  assert.equal(unknown.TZ, undefined)
})

test('process.env.TZ: assigning it moves Intl to the new zone', () => {
  const original = process.env.TZ
  try {
    process.env.TZ = 'Australia/Perth'
    assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone, 'Australia/Perth')
    assert.equal(new Date(Date.UTC(2026, 0, 1, 0, 0)).getHours(), 8)
  } finally {
    if (original === undefined) delete process.env.TZ
    else process.env.TZ = original
  }
})
