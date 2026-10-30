import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkedAgoText,
  doctorCheckGroupsOf,
  driveLabelOf,
  healthHeadlineOf,
  lastSyncText,
  nextSyncText,
  storageUsageOf,
  workingSummaryOf,
  worstHealthOf,
} from '../src/web/health-page.js'

const clockOf = () => '7:00pm'
const NOW = Date.parse('2026-10-19T09:00:00Z')

test('worstHealthOf: picks the worst level, first one on a tie', () => {
  const warn = { level: 'warn', sentence: 'Slow.' }
  const fail = { level: 'fail', sentence: 'Broken.' }
  assert.deepEqual(worstHealthOf({ level: 'ok', sentence: null }, warn, fail, { level: 'fail', sentence: 'Later.' }), fail)
  assert.deepEqual(worstHealthOf(null, undefined), { level: 'ok', sentence: null })
})

test('healthHeadlineOf: says everything works unless a sentence explains a problem', () => {
  assert.equal(healthHeadlineOf({ level: 'ok', sentence: null }), 'Everything is working.')
  assert.equal(healthHeadlineOf({ level: 'warn', sentence: 'TVHeadend is slow to answer.' }), 'TVHeadend is slow to answer.')
})

test('checkedAgoText: minutes, hours, and unknown', () => {
  assert.equal(checkedAgoText({ ranAtMs: NOW - 20_000, nowMs: NOW }), 'Last checked just now.')
  assert.equal(checkedAgoText({ ranAtMs: NOW - 2 * 60_000, nowMs: NOW }), 'Last checked 2 minutes ago.')
  assert.equal(checkedAgoText({ ranAtMs: NOW - 3 * 3600_000, nowMs: NOW }), 'Last checked 3 hours ago.')
  assert.equal(checkedAgoText({ ranAtMs: NaN, nowMs: NOW }), '')
})

test('nextSyncText: soon, later, and not scheduled', () => {
  assert.equal(nextSyncText({ nextRunAtMs: NOW + 16 * 60_000, nowMs: NOW, clockOf }), 'in 16 mins')
  assert.equal(nextSyncText({ nextRunAtMs: NOW + 2 * 3600_000, nowMs: NOW, clockOf }), 'in 2 hrs (7:00pm)')
  assert.equal(nextSyncText({ nextRunAtMs: NOW - 1000, nowMs: NOW, clockOf }), 'Due now')
  assert.equal(nextSyncText({ nextRunAtMs: NaN, nowMs: NOW, clockOf }), 'Not scheduled')
})

test('lastSyncText: time and result', () => {
  const quiet = { status: 'ok', finishedAt: '2026-10-19 08:00:00', summary: {} }
  assert.equal(lastSyncText({ sync: quiet, clockOf }), '7:00pm · nothing new')
  const busy = { status: 'partial', finishedAt: '2026-10-19 08:00:00', summary: { imported: 2, failed: 1 } }
  assert.equal(lastSyncText({ sync: busy, clockOf }), '7:00pm · 1 failed, 2 imported')
  assert.equal(lastSyncText({ sync: null, clockOf }), 'No syncs yet')
})

test('storageUsageOf: free space label and used share', () => {
  assert.deepEqual(storageUsageOf({ total: 3.6e12, free: 2.1e12 }), { usedPercent: 42, label: '2.1 TB free of 3.6 TB' })
  assert.equal(storageUsageOf({ total: null, free: null }), null)
})

test('driveLabelOf: one drive is the recordings drive, two are told apart', () => {
  assert.equal(driveLabelOf({ key: 'media', count: 1 }), 'Recordings drive')
  assert.equal(driveLabelOf({ key: 'media', count: 2 }), 'TV library drive')
  assert.equal(driveLabelOf({ key: 'recordings', count: 2 }), 'Recordings drive')
})

const checkOf = (id, status) => ({ id, status })

test('doctorCheckGroupsOf: all passing is one ungrouped list', () => {
  const checks = [checkOf('a', 'pass'), checkOf('b', 'skip'), checkOf('c', 'pass')]
  assert.deepEqual(doctorCheckGroupsOf(checks), [{ key: 'all', label: null, checks, collapsible: false }])
  assert.deepEqual(doctorCheckGroupsOf([]), [])
})

test('doctorCheckGroupsOf: problems group as attention, look, then working', () => {
  const checks = [checkOf('a', 'pass'), checkOf('b', 'warn'), checkOf('c', 'fail'), checkOf('d', 'skip'), checkOf('e', 'fail')]
  const groups = doctorCheckGroupsOf(checks)
  assert.deepEqual(groups.map((group) => group.label), ['Needs attention', 'Needs a look', 'Working'])
  assert.deepEqual(groups.map((group) => group.checks.map((check) => check.id)), [['c', 'e'], ['b'], ['a', 'd']])
  assert.deepEqual(groups.map((group) => group.collapsible), [false, false, true])
})

test('doctorCheckGroupsOf: empty groups are hidden', () => {
  const groups = doctorCheckGroupsOf([checkOf('a', 'warn'), checkOf('b', 'pass')])
  assert.deepEqual(groups.map((group) => group.key), ['look', 'working'])
  assert.deepEqual(doctorCheckGroupsOf([checkOf('a', 'fail')]).map((group) => group.key), ['attention'])
})

test('workingSummaryOf: counts passed checks and names skipped ones apart', () => {
  assert.equal(workingSummaryOf([checkOf('a', 'pass')]), '1 check working')
  const checks = [...Array.from({ length: 17 }, (_, i) => checkOf(`p${i}`, 'pass')), checkOf('s', 'skip')]
  assert.equal(workingSummaryOf(checks), '17 checks working · 1 skipped')
})
