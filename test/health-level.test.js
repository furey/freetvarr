import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HEALTH_ALERT_HIDE_MS,
  attentionPhraseOf,
  badgedNameOf,
  dismissalOf,
  healthAlertOf,
  healthBadgeOf,
  healthLevelOf,
  healthReasonOf,
  healthRowNameOf,
  parseDismissal,
} from '../src/web/health-level.js'

test('healthLevelOf: all good when nothing is wrong', () => {
  const health = healthLevelOf({ guideState: { stale: false }, lastSync: { status: 'ok' } })
  assert.deepEqual(health, { level: 'ok', sentence: null })
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

test('healthBadgeOf: only warnings and errors get a badge, and only once known', () => {
  assert.equal(healthBadgeOf({ level: 'ok' }), null)
  assert.equal(healthBadgeOf({ level: 'warn' }), 'warn')
  assert.equal(healthBadgeOf({ level: 'fail' }), 'fail')
  assert.equal(healthBadgeOf({ level: 'fail', known: false }), null)
  assert.equal(healthBadgeOf(), null)
})

test('badgedNameOf: the badge adds how urgent it is to the accessible name', () => {
  assert.equal(badgedNameOf({ label: 'Settings', badge: null }), 'Settings')
  assert.equal(badgedNameOf({ label: 'Settings', badge: 'warn' }), 'Settings, needs a look')
  assert.equal(badgedNameOf({ label: 'Settings', badge: 'fail' }), 'Settings, needs attention')
  assert.equal(attentionPhraseOf('fail'), 'needs attention')
  assert.equal(attentionPhraseOf(null), '')
})

test('healthRowNameOf: the Health row names the reason after the urgency', () => {
  assert.equal(healthRowNameOf({ label: 'Health', badge: null, sentence: null }), 'Health')
  assert.equal(
    healthRowNameOf({ label: 'Health', badge: 'fail', sentence: 'The media folder check failed.' }),
    'Health, needs attention: The media folder check failed',
  )
  assert.equal(healthRowNameOf({ label: 'Health', badge: 'warn', sentence: '' }), 'Health, needs a look')
})

test('healthReasonOf: drops the full stop', () => {
  assert.equal(healthReasonOf('TVHeadend is not answering.'), 'TVHeadend is not answering')
  assert.equal(healthReasonOf('Already short'), 'Already short')
  assert.equal(healthReasonOf(null), '')
})

const failing = { level: 'fail', sentence: 'The last sync failed.', known: true }
const nowMs = Date.parse('2026-10-20T08:00:00Z')

test('healthAlertOf: errors show the sentence without its full stop', () => {
  assert.deepEqual(healthAlertOf({ health: failing, nowMs }), { sentence: 'The last sync failed' })
})

test('healthAlertOf: warnings, all good, and unknown health show no alert', () => {
  assert.equal(healthAlertOf({ health: { level: 'warn', sentence: 'The last sync had problems.', known: true }, nowMs }), null)
  assert.equal(healthAlertOf({ health: { level: 'ok', sentence: null, known: true }, nowMs }), null)
  assert.equal(healthAlertOf({ health: { ...failing, known: false }, nowMs }), null)
})

test('healthAlertOf: a dismissal hides that exact sentence for a day', () => {
  const dismissal = dismissalOf({ sentence: failing.sentence, nowMs })
  assert.equal(healthAlertOf({ health: failing, dismissal, nowMs: nowMs + 60_000 }), null)
  assert.equal(healthAlertOf({ health: failing, dismissal, nowMs: nowMs + HEALTH_ALERT_HIDE_MS - 1 }), null)
  assert.deepEqual(
    healthAlertOf({ health: failing, dismissal, nowMs: nowMs + HEALTH_ALERT_HIDE_MS }),
    { sentence: 'The last sync failed' },
  )
})

test('healthAlertOf: a new sentence returns before the day is up', () => {
  const dismissal = dismissalOf({ sentence: failing.sentence, nowMs })
  const changed = { ...failing, sentence: 'TVHeadend is not answering.' }
  assert.deepEqual(healthAlertOf({ health: changed, dismissal, nowMs: nowMs + 60_000 }), { sentence: 'TVHeadend is not answering' })
})

test('healthAlertOf: a dismissal dated in the future does not hide the alert', () => {
  const dismissal = dismissalOf({ sentence: failing.sentence, nowMs: nowMs + 60_000 })
  assert.deepEqual(healthAlertOf({ health: failing, dismissal, nowMs }), { sentence: 'The last sync failed' })
})

test('parseDismissal: reads a stored dismissal and rejects junk', () => {
  assert.deepEqual(parseDismissal(JSON.stringify({ sentence: 'X', atMs: 5 })), { sentence: 'X', atMs: 5 })
  assert.equal(parseDismissal('not json'), null)
  assert.equal(parseDismissal(null), null)
  assert.equal(parseDismissal(JSON.stringify({ sentence: 'X' })), null)
})
