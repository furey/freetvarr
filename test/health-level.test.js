import { test } from 'node:test'
import assert from 'node:assert/strict'
import { healthLevelOf, healthLabelOf } from '../src/web/health-level.js'

test('healthLevelOf: all good when nothing is wrong', () => {
  const health = healthLevelOf({ guideState: { stale: false }, lastSync: { status: 'ok' } })
  assert.deepEqual(health, { level: 'ok', sentence: null })
  assert.equal(healthLabelOf(health), 'All good')
})

test('healthLevelOf: an unanswered guide request is a failure', () => {
  assert.deepEqual(healthLevelOf({ guideStateFailed: true }), { level: 'fail', sentence: 'TVHeadend is not answering.' })
})

test('healthLevelOf: a stale guide or a partial sync is a warning', () => {
  assert.equal(healthLevelOf({ guideState: { stale: true } }).level, 'warn')
  assert.deepEqual(healthLevelOf({ lastSync: { status: 'partial' } }), { level: 'warn', sentence: 'The last sync had problems.' })
})

test('healthLevelOf: the worst finding wins, first one on a tie', () => {
  const health = healthLevelOf({ guideState: { stale: true }, lastSync: { status: 'error' }, failingRecordings: 2 })
  assert.deepEqual(health, { level: 'fail', sentence: '2 recordings are failing.' })
})

test('healthLevelOf: an unconfigured TVHeadend warns instead of failing', () => {
  assert.deepEqual(healthLevelOf({ tvhConfigured: false, guideStateFailed: true }), { level: 'warn', sentence: 'TVHeadend is not set up yet.' })
})
