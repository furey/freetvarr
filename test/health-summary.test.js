import { test } from 'node:test'
import assert from 'node:assert/strict'
import { distinctDrives, healthSummaryOf, usableDoctorReport } from '../src/health-summary.js'

test('healthSummaryOf: all good when nothing is wrong', () => {
  assert.deepEqual(healthSummaryOf({ lastSync: { status: 'ok' } }), { level: 'ok', sentence: null })
})

test('healthSummaryOf: TVHeadend states map to levels', () => {
  assert.deepEqual(healthSummaryOf({ tvheadend: 'fail' }), { level: 'fail', sentence: 'TVHeadend is not answering.' })
  assert.deepEqual(healthSummaryOf({ tvheadend: 'stale' }), { level: 'warn', sentence: 'TVHeadend is slow to answer.' })
  assert.deepEqual(healthSummaryOf({ tvheadend: 'unconfigured' }), { level: 'warn', sentence: 'TVHeadend is not set up yet.' })
  assert.equal(healthSummaryOf({ tvheadend: 'unknown' }).level, 'ok')
})

test('healthSummaryOf: failed recordings and syncs', () => {
  assert.deepEqual(healthSummaryOf({ recentFailures: 1 }), { level: 'fail', sentence: 'A recording failed in the last day.' })
  assert.equal(healthSummaryOf({ recentFailures: 3 }).sentence, '3 recordings failed in the last day.')
  assert.deepEqual(healthSummaryOf({ lastSync: { status: 'error' } }), { level: 'fail', sentence: 'The last sync failed.' })
  assert.deepEqual(healthSummaryOf({ lastSync: { status: 'partial' } }), { level: 'warn', sentence: 'The last sync had problems.' })
})

test('healthSummaryOf: Doctor checks name the check, TVHeadend ones say so', () => {
  const warn = healthSummaryOf({ doctorChecks: [{ group: 'storage', title: 'Free space', status: 'warn' }] })
  assert.deepEqual(warn, { level: 'warn', sentence: 'The free space check has a warning.' })
  const fail = healthSummaryOf({ doctorChecks: [{ group: 'tvheadend', title: 'Tuners', status: 'fail' }] })
  assert.deepEqual(fail, { level: 'fail', sentence: 'The TVHeadend tuners check failed.' })
  const plex = healthSummaryOf({ doctorChecks: [{ group: 'plex', title: 'Plex library', status: 'fail' }] })
  assert.equal(plex.sentence, 'The Plex library check failed.')
  assert.equal(healthSummaryOf({ doctorChecks: [{ title: 'Syncs', status: 'skip' }] }).level, 'ok')
})

test('healthSummaryOf: the worst finding wins, first one on a tie', () => {
  const health = healthSummaryOf({
    tvheadend: 'stale',
    lastSync: { status: 'error' },
    doctorChecks: [{ group: 'storage', title: 'Free space', status: 'fail' }],
  })
  assert.deepEqual(health, { level: 'fail', sentence: 'The last sync failed.' })
})

test('usableDoctorReport: ignores a missing or old report', () => {
  const report = { ranAt: '2026-10-19T00:00:00.000Z' }
  assert.equal(usableDoctorReport({ peeked: null }), null)
  assert.equal(usableDoctorReport({ peeked: { report, ageMs: 1000 }, maxAgeMs: 5000 }), report)
  assert.equal(usableDoctorReport({ peeked: { report, ageMs: 9000 }, maxAgeMs: 5000 }), null)
})

test('distinctDrives: drops unreadable folders and folders on the same drive', () => {
  const drives = distinctDrives([
    { key: 'recordings', path: '/data/recordings', total: 100, free: 40 },
    { key: 'media', path: '/data/media', total: 100, free: 40 },
    { key: 'other', path: '/nope', total: null, free: null },
  ])
  assert.deepEqual(drives.map((drive) => drive.key), ['recordings'])
  const split = distinctDrives([
    { key: 'recordings', path: '/a', total: 100, free: 40 },
    { key: 'media', path: '/b', total: 200, free: 10 },
  ])
  assert.equal(split.length, 2)
})
