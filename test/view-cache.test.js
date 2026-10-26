import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  FOR_YOU_CACHE,
  GUIDE_CACHE,
  LIBRARY_CACHE,
  LIVE_CACHE,
  SCHEDULED_CACHE,
  readViewCache,
  writeViewCache,
} from '../src/web/view-cache.js'

const memoryStorage = () => {
  const items = new Map()
  return {
    items,
    getItem: (k) => (items.has(k) ? items.get(k) : null),
    setItem: (k, v) => items.set(k, v),
    removeItem: (k) => items.delete(k),
  }
}

const NOW = 1_800_000_000_000
const HOUR = 3600_000

const roundTrip = ({ spec, value, savedAt = NOW, readAt = NOW, build = 'b1', readBuild = build }) => {
  const storage = memoryStorage()
  writeViewCache({ storage, spec, build, value, nowMs: savedAt })
  return readViewCache({ storage, spec, build: readBuild, nowMs: readAt })
}

const liveOf = (entries = []) => ({ entries, channels: [], hiddenIds: [] })
const guideOf = (overrides = {}) => ({ dayStart: NOW - HOUR, dayEnd: NOW + HOUR, channels: [], programs: {}, ...overrides })
const forYouOf = (items = []) => ({ payload: { enabled: true, sections: [{ key: 'on-now', items }] }, upcoming: [], pickable: [] })

test('each view cache returns what it saved for the same build', () => {
  assert.deepEqual(roundTrip({ spec: LIVE_CACHE, value: liveOf() }), liveOf())
  assert.deepEqual(roundTrip({ spec: GUIDE_CACHE, value: guideOf() }), guideOf())
  assert.deepEqual(roundTrip({ spec: FOR_YOU_CACHE, value: forYouOf() }), forYouOf())
})

test('a view cache saved by another build, too long ago, or in the future is discarded', () => {
  assert.equal(roundTrip({ spec: LIVE_CACHE, value: liveOf(), readBuild: 'b2' }), null)
  assert.equal(roundTrip({ spec: LIVE_CACHE, value: liveOf(), readAt: NOW + LIVE_CACHE.maxAgeMs }), null)
  assert.equal(roundTrip({ spec: FOR_YOU_CACHE, value: forYouOf(), readAt: NOW + FOR_YOU_CACHE.maxAgeMs }), null)
  assert.equal(roundTrip({ spec: LIVE_CACHE, value: liveOf(), readAt: NOW - 1 }), null)
})

test('the guide cache holds only the local day that is still current', () => {
  const guide = guideOf({ dayEnd: NOW + 60_000 })
  assert.deepEqual(roundTrip({ spec: GUIDE_CACHE, value: guide, readAt: NOW + 59_000 }), guide)
  assert.equal(roundTrip({ spec: GUIDE_CACHE, value: guide, readAt: NOW + 60_000 }), null)
  assert.equal(roundTrip({ spec: GUIDE_CACHE, value: guideOf({ dayStart: NOW + 1 }) }), null)
})

test('the live cache rolls an ended programme to the next one or drops it', () => {
  const channel = { id: 'c1' }
  const ended = { title: 'Ended', start: NOW - HOUR, end: NOW + 60_000 }
  const following = { title: 'Following', start: NOW + 60_000, end: NOW + HOUR }
  const later = { title: 'Later', start: NOW + 2 * HOUR, end: NOW + 3 * HOUR }
  const live = liveOf([{ channel, now: ended, next: following }, { channel, now: ended, next: later }])
  const read = roundTrip({ spec: LIVE_CACHE, value: live, readAt: NOW + 120_000 })
  assert.deepEqual(read.entries, [
    { channel, now: following, next: null },
    { channel, now: null, next: later },
  ])
})

test('the for-you cache removes items whose airing has ended', () => {
  const value = forYouOf([{ id: 1, stop: NOW + 60_000 }, { id: 2, stop: NOW + HOUR }, { id: 3 }])
  const read = roundTrip({ spec: FOR_YOU_CACHE, value, readAt: NOW + 120_000 })
  assert.deepEqual(read.payload.sections[0].items.map((item) => item.id), [2, 3])
})

test('view caches reject malformed values and unreadable storage', () => {
  assert.equal(roundTrip({ spec: LIVE_CACHE, value: { entries: 'x', channels: [] } }), null)
  assert.equal(roundTrip({ spec: GUIDE_CACHE, value: { ...guideOf(), programs: [] } }), null)
  assert.equal(roundTrip({ spec: FOR_YOU_CACHE, value: { payload: null, upcoming: [], pickable: [] } }), null)
  const storage = memoryStorage()
  storage.setItem(LIVE_CACHE.key, '{not json')
  assert.equal(readViewCache({ storage, spec: LIVE_CACHE, build: 'b1', nowMs: NOW }), null)
  assert.equal(readViewCache({ storage: null, spec: LIVE_CACHE, build: 'b1', nowMs: NOW }), null)
})

test('a view cache past its size cap is removed instead of written', () => {
  const storage = memoryStorage()
  writeViewCache({ storage, spec: LIVE_CACHE, build: 'b1', value: liveOf(), nowMs: NOW })
  const huge = liveOf([{ channel: { id: 'x'.repeat(LIVE_CACHE.maxChars) } }])
  writeViewCache({ storage, spec: LIVE_CACHE, build: 'b1', value: huge, nowMs: NOW })
  assert.equal(storage.items.has(LIVE_CACHE.key), false)
  const throwing = { setItem: () => { throw new Error('quota') }, removeItem: () => {} }
  assert.doesNotThrow(() => writeViewCache({ storage: throwing, spec: LIVE_CACHE, build: 'b1', value: liveOf(), nowMs: NOW }))
})

const libraryOf = (shows = []) => ({ shows, stale: false, failedRows: [] })
const scheduledOf = (overrides = {}) => ({ state: { upcomingRecordings: [], fetchedAt: NOW }, watchlist: [], ...overrides })

test('the library and scheduled caches return what they saved', () => {
  const show = { key: 'a', title: 'A', recordingNow: false, inProgress: null }
  assert.deepEqual(roundTrip({ spec: LIBRARY_CACHE, value: libraryOf([show]) }), libraryOf([show]))
  assert.deepEqual(roundTrip({ spec: SCHEDULED_CACHE, value: scheduledOf() }), scheduledOf())
  assert.deepEqual(roundTrip({ spec: SCHEDULED_CACHE, value: scheduledOf({ watchlist: undefined }) }), { state: scheduledOf().state })
  assert.equal(roundTrip({ spec: SCHEDULED_CACHE, value: scheduledOf(), readAt: NOW + SCHEDULED_CACHE.maxAgeMs }), null)
})

test('the library cache stops showing a recording whose padded stop has passed', () => {
  const recording = { key: 'r', recordingNow: true, inProgress: { phase: 'recording', stop: NOW + 60_000, stopPadded: NOW + 120_000 } }
  const finishing = { key: 'f', recordingNow: false, inProgress: { phase: 'finishing', stop: NOW - HOUR } }
  const value = libraryOf([recording, finishing])
  assert.deepEqual(roundTrip({ spec: LIBRARY_CACHE, value, readAt: NOW + 90_000 }).shows, [recording, finishing])
  const later = roundTrip({ spec: LIBRARY_CACHE, value, readAt: NOW + 120_000 }).shows
  assert.equal(later[0].recordingNow, false)
  assert.equal(later[0].inProgress.phase, 'finishing')
  assert.deepEqual(later[1], finishing)
})

test('the library and scheduled caches reject malformed values', () => {
  assert.equal(roundTrip({ spec: LIBRARY_CACHE, value: { shows: null } }), null)
  assert.equal(roundTrip({ spec: SCHEDULED_CACHE, value: { state: null, watchlist: [] } }), null)
  assert.equal(roundTrip({ spec: SCHEDULED_CACHE, value: { state: {}, watchlist: [] } }), null)
  assert.equal(roundTrip({ spec: SCHEDULED_CACHE, value: scheduledOf({ watchlist: 'x' }) }), null)
})
