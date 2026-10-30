import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  isTvheadendUnconfigured,
  isTvheadendUrlSet,
  unconfiguredGuideDay,
  unconfiguredOnNow,
  unconfiguredRecordingNow,
  unconfiguredRecordingState,
} from '../src/tvheadend-unconfigured.js'
import { TvheadendError, resolveConnection } from '../src/tvheadend.js'

const prefs = {
  pinnedIds: ['a'],
  hiddenIds: ['b'],
  sort: 'number',
  hideSdSimulcasts: true,
  hideSdChannels: false,
}

test('isTvheadendUnconfigured: only the missing-address error counts', () => {
  assert.equal(isTvheadendUnconfigured(new TvheadendError('x', { stage: 'config', code: 'no-url' })), true)
  assert.equal(isTvheadendUnconfigured(new TvheadendError('x', { stage: 'http', code: 'unreachable' })), false)
  assert.equal(isTvheadendUnconfigured(new Error('boom')), false)
  assert.equal(isTvheadendUnconfigured(null), false)
})

test('isTvheadendUnconfigured: matches the error resolveConnection throws with no address', async () => {
  await assert.rejects(resolveConnection({ url: '  ' }), (err) => isTvheadendUnconfigured(err))
})

test('isTvheadendUrlSet: blank and missing addresses are not set', () => {
  assert.equal(isTvheadendUrlSet('http://tvh:9981'), true)
  assert.equal(isTvheadendUrlSet('   '), false)
  assert.equal(isTvheadendUrlSet(null), false)
  assert.equal(isTvheadendUrlSet(undefined), false)
})

test('unconfiguredRecordingNow: nothing recording, flagged as not configured', () => {
  assert.deepEqual(unconfiguredRecordingNow({ nowMs: 5 }), {
    configured: false, active: [], journeys: [], fetchedAt: 5,
  })
})

test('unconfiguredRecordingState: every list a page reads is empty', () => {
  const state = unconfiguredRecordingState({ nowMs: 5 })
  assert.equal(state.configured, false)
  for (const key of ['futureRecordings', 'skippedRecordings', 'upcomingRecordings', 'seriesTags', 'activeRecordingIds']) {
    assert.deepEqual(state[key], [], key)
  }
  assert.equal(state.stale, undefined)
  assert.equal(state.fetchedAt, 5)
})

test('unconfiguredGuideDay: keeps the day window and channel preferences, with no channels', () => {
  const day = unconfiguredGuideDay({ day: 2, window: { dayStart: 10, dayEnd: 20, spillEnd: 25 }, prefs, nowMs: 5 })
  assert.deepEqual(day, {
    configured: false,
    day: 2,
    dayStart: 10,
    dayEnd: 20,
    spillEnd: 25,
    fetchedAt: 5,
    stale: false,
    sort: 'number',
    hideSdSimulcasts: true,
    hideSdChannels: false,
    hiddenIds: ['b'],
    channels: [],
    programs: {},
    loadingListings: [],
  })
})

test('unconfiguredOnNow: the all-channels shape carries preferences, the pinned shape only entries', () => {
  assert.deepEqual(unconfiguredOnNow({ all: false, prefs, nowMs: 5 }), { configured: false, entries: [] })
  const all = unconfiguredOnNow({ all: true, prefs, nowMs: 5 })
  assert.equal(all.configured, false)
  assert.deepEqual(all.entries, [])
  assert.deepEqual(all.channels, [])
  assert.equal(all.sort, 'number')
})
