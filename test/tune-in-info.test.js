import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canDismissTuneIn,
  TUNE_IN_SLOW_MS,
  startsTuneInInfo,
  confirmedChannelAfter,
  tuneInExitWaitMs,
  isSlowTune,
  showsTuneInBadge,
  showsPrePlayChrome,
} from '../src/web/tune-in-info.js'

test('a first tune shows the programme info', () => {
  assert.equal(startsTuneInInfo({ phase: 'tuning', channelId: 'a', confirmedChannelId: null, multiview: false }), true)
})

test('a channel change inside the player shows the info again', () => {
  assert.equal(startsTuneInInfo({ phase: 'tuning', channelId: 'b', confirmedChannelId: 'a', multiview: false }), true)
})

test('start over on the same channel skips the info', () => {
  assert.equal(startsTuneInInfo({ phase: 'tuning', channelId: 'a', confirmedChannelId: 'a', multiview: false }), false)
})

test('multiview never shows the tune-in info', () => {
  assert.equal(startsTuneInInfo({ phase: 'tuning', channelId: 'b', confirmedChannelId: 'a', multiview: true }), false)
})

test('only the tuning phase starts the info', () => {
  for (const phase of ['live', 'ended', 'idle']) {
    assert.equal(startsTuneInInfo({ phase, channelId: 'a', confirmedChannelId: null, multiview: false }), false)
  }
})

test('a live phase confirms the channel', () => {
  assert.equal(confirmedChannelAfter({ phase: 'live', channelId: 'a', confirmedChannelId: null }), 'a')
})

test('a failed or stopped tune forgets the channel so a retry shows the info', () => {
  assert.equal(confirmedChannelAfter({ phase: 'ended', channelId: 'a', confirmedChannelId: 'a' }), null)
  assert.equal(confirmedChannelAfter({ phase: 'idle', channelId: 'a', confirmedChannelId: 'a' }), null)
})

test('tuning keeps the confirmed channel', () => {
  assert.equal(confirmedChannelAfter({ phase: 'tuning', channelId: 'b', confirmedChannelId: 'a' }), 'a')
})

test('a picture that arrives early waits for the minimum display time', () => {
  assert.equal(tuneInExitWaitMs({ shownAtMs: 1_000, nowMs: 1_800, minimumMs: 2_000 }), 1_200)
})

test('a picture that arrives after the minimum fades the info at once', () => {
  assert.equal(tuneInExitWaitMs({ shownAtMs: 1_000, nowMs: 9_000, minimumMs: 2_000 }), 0)
})

test('a tune past the slow threshold is slow', () => {
  assert.equal(isSlowTune({ phase: 'tuning', startedAtMs: 0, nowMs: TUNE_IN_SLOW_MS + 1 }), true)
  assert.equal(isSlowTune({ phase: 'tuning', startedAtMs: 0, nowMs: TUNE_IN_SLOW_MS }), false)
})

test('a live or failed tune is never slow', () => {
  assert.equal(isSlowTune({ phase: 'live', startedAtMs: 0, nowMs: TUNE_IN_SLOW_MS * 2 }), false)
  assert.equal(isSlowTune({ phase: 'ended', startedAtMs: 0, nowMs: TUNE_IN_SLOW_MS * 2 }), false)
})

test('the badge skips the programme the tune-in info already rated', () => {
  assert.equal(showsTuneInBadge({ key: 'a|1', panelKey: 'a|1' }), false)
})

test('the badge shows for a new programme while watching', () => {
  assert.equal(showsTuneInBadge({ key: 'a|2', panelKey: 'a|1' }), true)
  assert.equal(showsTuneInBadge({ key: 'a|2', panelKey: null }), true)
})

test('the badge needs a programme', () => {
  assert.equal(showsTuneInBadge({ key: null, panelKey: null }), false)
})

test('canDismissTuneIn: the info cannot be closed until the stream is playing', () => {
  assert.equal(canDismissTuneIn({ phase: 'tuning' }), false)
  assert.equal(canDismissTuneIn({ phase: 'error' }), false)
  assert.equal(canDismissTuneIn({ phase: 'live' }), true)
})

test('showsPrePlayChrome: the top bar stays trimmed while tuning', () => {
  assert.equal(showsPrePlayChrome({ phase: 'tuning', headingHeld: false }), true)
})

test('showsPrePlayChrome: the trim holds after playback starts until the controls next show', () => {
  assert.equal(showsPrePlayChrome({ phase: 'live', headingHeld: true }), true)
  assert.equal(showsPrePlayChrome({ phase: 'live', headingHeld: false }), false)
})

test('showsPrePlayChrome: a failed tune shows the full top bar', () => {
  assert.equal(showsPrePlayChrome({ phase: 'ended', headingHeld: false }), false)
})
