import assert from 'node:assert/strict'
import test from 'node:test'

import { plexWatchStatusText } from '../src/web/plex-watch-text.js'

const NOW = Date.parse('2026-10-30T10:00:00Z')
const timeZone = 'Australia/Sydney'
const base = { configured: true, running: false, error: null, errorKind: null }

test('the Settings readout explains each state', () => {
  assert.equal(plexWatchStatusText({ status: { ...base, configured: false }, nowMs: NOW, timeZone }).kind, 'info')
  assert.equal(plexWatchStatusText({ status: { ...base, running: true }, nowMs: NOW, timeZone }).text, 'Syncing watched state…')
  assert.match(plexWatchStatusText({ status: { ...base, error: 'Plex rejected the token', errorKind: 'token' }, nowMs: NOW, timeZone }).text, /rejected the token/)
  const down = plexWatchStatusText({ status: { ...base, error: 'Plex did not answer: ECONNREFUSED', errorKind: 'unreachable', nextAttemptAt: NOW + 300_000 }, nowMs: NOW, timeZone })
  assert.equal(down.kind, 'err')
  assert.match(down.text, /Tries again at 9:05pm/)
  assert.match(plexWatchStatusText({ status: base, nowMs: NOW, timeZone }).text, /Not synced yet/)
})

test('after a run it says when, how many matched, and what is missing', () => {
  const { text, kind } = plexWatchStatusText({ status: { ...base, lastRunAt: NOW - 60_000, matched: 34, unmatched: 2, ambiguous: 0 }, nowMs: NOW, timeZone })
  assert.equal(kind, 'ok')
  assert.equal(text, 'Last synced 8:59pm · 34 matched · 2 not in Plex yet')
})
