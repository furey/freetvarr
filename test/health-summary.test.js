import { test } from 'node:test'
import assert from 'node:assert/strict'
import { distinctDrives, healthSummaryOf, usableDoctorReport } from '../src/health-summary.js'

test('healthSummaryOf: all good when nothing is wrong', () => {
  assert.deepEqual(healthSummaryOf({ lastSync: { status: 'ok' } }), { level: 'ok', sentence: null })
})

test('healthSummaryOf: TVHeadend states map to levels', () => {
  const down = healthSummaryOf({ tvheadend: 'fail' })
  const stale = healthSummaryOf({ tvheadend: 'stale' })
  const unconfigured = healthSummaryOf({ tvheadend: 'unconfigured' })
  assert.deepEqual([down.level, stale.level, unconfigured.level], ['fail', 'warn', 'warn'])
  assert.match(down.sentence, /TVHeadend.*not answering/i)
  assert.match(stale.sentence, /TVHeadend.*slow/i)
  assert.match(unconfigured.sentence, /TVHeadend.*not set up/i)
  assert.equal(healthSummaryOf({ tvheadend: 'unknown' }).level, 'ok')
})

test('healthSummaryOf: failed recordings and syncs', () => {
  const one = healthSummaryOf({ recentFailures: 1 })
  assert.equal(one.level, 'fail')
  assert.match(one.sentence, /\brecording failed\b/i)
  assert.doesNotMatch(one.sentence, /\d/)
  const three = healthSummaryOf({ recentFailures: 3 })
  assert.equal(three.level, 'fail')
  assert.match(three.sentence, /\b3 recordings failed\b/)
  const failed = healthSummaryOf({ lastSync: { status: 'error' } })
  assert.equal(failed.level, 'fail')
  assert.match(failed.sentence, /sync failed/i)
  const partial = healthSummaryOf({ lastSync: { status: 'partial' } })
  assert.equal(partial.level, 'warn')
  assert.match(partial.sentence, /sync.*problems/i)
  assert.doesNotMatch(partial.sentence, /failed/i)
})

test('healthSummaryOf: Doctor checks name the check, TVHeadend ones say so', () => {
  const warn = healthSummaryOf({ doctorChecks: [{ group: 'storage', title: 'Free space', status: 'warn' }] })
  assert.equal(warn.level, 'warn')
  assert.match(warn.sentence, /\bfree space check\b.*warning/)
  const fail = healthSummaryOf({ doctorChecks: [{ group: 'tvheadend', title: 'Tuners', status: 'fail' }] })
  assert.equal(fail.level, 'fail')
  assert.match(fail.sentence, /\bTVHeadend tuners check\b.*failed/)
  const plex = healthSummaryOf({ doctorChecks: [{ group: 'plex', title: 'Plex library', status: 'fail' }] })
  assert.match(plex.sentence, /\bPlex library check\b.*failed/)
  assert.doesNotMatch(plex.sentence, /TVHeadend/)
  assert.equal(healthSummaryOf({ doctorChecks: [{ title: 'Syncs', status: 'skip' }] }).level, 'ok')
})

test('healthSummaryOf: the worst finding wins, first one on a tie', () => {
  const health = healthSummaryOf({
    tvheadend: 'stale',
    lastSync: { status: 'error' },
    doctorChecks: [{ group: 'storage', title: 'Free space', status: 'fail' }],
  })
  assert.equal(health.level, 'fail')
  assert.deepEqual(health, healthSummaryOf({ lastSync: { status: 'error' } }))
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

test('healthSummaryOf: a sync stopped by a restart is not a failure', () => {
  assert.deepEqual(healthSummaryOf({ lastSync: { status: 'stopped' } }), { level: 'ok', sentence: null })
})
