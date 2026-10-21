import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  HOME_CACHE_KEY,
  HOME_CACHE_MAX_AGE_MS,
  HOME_CACHE_MAX_CHARS,
  freshHomeOf,
  isHomeShape,
  readHomeCache,
  writeHomeCache,
} from '../src/web/home-cache.js'

const memoryStorage = () => {
  const items = new Map()
  return {
    items,
    getItem: (k) => (items.has(k) ? items.get(k) : null),
    setItem: (k, v) => items.set(k, v),
    removeItem: (k) => items.delete(k),
  }
}

const homeOf = (overrides = {}) => ({
  inProgress: [],
  newRecordings: [{ recordingId: 'r1', title: 'Media Watch' }],
  nowEntries: [],
  upcoming: [],
  activeProgramIds: [],
  shows: [],
  watchlist: [],
  movies: [],
  forYouPayload: null,
  heroPools: {},
  ...overrides,
})

const NOW = 1_800_000_000_000

test('writeHomeCache then readHomeCache returns the saved home for the same build', () => {
  const storage = memoryStorage()
  writeHomeCache({ storage, build: 'b1', home: homeOf(), nowMs: NOW })
  assert.deepEqual(readHomeCache({ storage, build: 'b1', nowMs: NOW + 1000 }), homeOf())
})

test('readHomeCache discards a home saved by another build', () => {
  const storage = memoryStorage()
  writeHomeCache({ storage, build: 'b1', home: homeOf(), nowMs: NOW })
  assert.equal(readHomeCache({ storage, build: 'b2', nowMs: NOW }), null)
})

test('readHomeCache discards a home older than the maximum age or saved in the future', () => {
  const storage = memoryStorage()
  writeHomeCache({ storage, build: 'b1', home: homeOf(), nowMs: NOW })
  assert.equal(readHomeCache({ storage, build: 'b1', nowMs: NOW + HOME_CACHE_MAX_AGE_MS }), null)
  assert.equal(readHomeCache({ storage, build: 'b1', nowMs: NOW - 1 }), null)
})

test('readHomeCache returns null for malformed, missing, or unreadable storage', () => {
  const storage = memoryStorage()
  assert.equal(readHomeCache({ storage, build: 'b1', nowMs: NOW }), null)
  storage.setItem(HOME_CACHE_KEY, '{not json')
  assert.equal(readHomeCache({ storage, build: 'b1', nowMs: NOW }), null)
  storage.setItem(HOME_CACHE_KEY, JSON.stringify({ version: 1, build: 'b1', savedAt: NOW, home: { inProgress: 'x' } }))
  assert.equal(readHomeCache({ storage, build: 'b1', nowMs: NOW }), null)
  assert.equal(readHomeCache({ storage: null, build: 'b1', nowMs: NOW }), null)
  const throwing = { getItem: () => { throw new Error('denied') } }
  assert.equal(readHomeCache({ storage: throwing, build: 'b1', nowMs: NOW }), null)
})

test('writeHomeCache removes the saved home instead of writing one past the size cap', () => {
  const storage = memoryStorage()
  writeHomeCache({ storage, build: 'b1', home: homeOf(), nowMs: NOW })
  const huge = homeOf({ shows: [{ key: 'x'.repeat(HOME_CACHE_MAX_CHARS) }] })
  writeHomeCache({ storage, build: 'b1', home: huge, nowMs: NOW })
  assert.equal(storage.items.has(HOME_CACHE_KEY), false)
})

test('writeHomeCache ignores storage that throws', () => {
  const throwing = { setItem: () => { throw new Error('quota') }, removeItem: () => {} }
  assert.doesNotThrow(() => writeHomeCache({ storage: throwing, build: 'b1', home: homeOf(), nowMs: NOW }))
  assert.doesNotThrow(() => writeHomeCache({ storage: null, build: 'b1', home: homeOf(), nowMs: NOW }))
})

test('isHomeShape needs every list, hero pools, and a for-you payload object or null', () => {
  assert.equal(isHomeShape(homeOf()), true)
  assert.equal(isHomeShape(homeOf({ forYouPayload: { sections: [] } })), true)
  assert.equal(isHomeShape(homeOf({ heroPools: [] })), false)
  assert.equal(isHomeShape(homeOf({ movies: null })), false)
  assert.equal(isHomeShape(null), false)
})

test('freshHomeOf moves an ended programme to the next one when the next one is airing', () => {
  const channel = { id: 'c1', pinned: true }
  const ended = { title: 'Ended', start: NOW - 3600_000, end: NOW - 60_000 }
  const airing = { title: 'Airing', start: NOW - 60_000, end: NOW + 1800_000 }
  const home = homeOf({ nowEntries: [{ channel, now: ended, next: airing }] })
  assert.deepEqual(freshHomeOf({ home, nowMs: NOW }).nowEntries, [{ channel, now: airing, next: null }])
})

test('freshHomeOf drops an ended programme when nothing current follows it', () => {
  const channel = { id: 'c1' }
  const ended = { title: 'Ended', start: NOW - 3600_000, end: NOW - 60_000 }
  const later = { title: 'Later', start: NOW + 600_000, end: NOW + 1800_000 }
  const home = homeOf({ nowEntries: [{ channel, now: ended, next: later }, { channel, now: null }] })
  assert.deepEqual(freshHomeOf({ home, nowMs: NOW }).nowEntries, [
    { channel, now: null, next: later },
    { channel, now: null },
  ])
})

test('freshHomeOf keeps a programme that is still airing', () => {
  const entry = { channel: { id: 'c1' }, now: { start: NOW - 60_000, end: NOW + 60_000 }, next: null }
  assert.equal(freshHomeOf({ home: homeOf({ nowEntries: [entry] }), nowMs: NOW }).nowEntries[0], entry)
})

test('freshHomeOf removes for-you items whose airing has ended, in seconds or milliseconds', () => {
  const payload = {
    enabled: true,
    sections: [{
      key: 'on-now',
      items: [
        { id: 1, stop: (NOW - 1000) / 1000 },
        { id: 2, stop: NOW + 60_000 },
        { id: 3 },
        { id: 4, stop: NOW - 1 },
      ],
    }],
  }
  const fresh = freshHomeOf({ home: homeOf({ forYouPayload: payload }), nowMs: NOW })
  assert.deepEqual(fresh.forYouPayload.sections[0].items.map((item) => item.id), [2, 3])
  assert.equal(fresh.forYouPayload.enabled, true)
})

test('freshHomeOf keeps a missing for-you payload as it is', () => {
  assert.equal(freshHomeOf({ home: homeOf(), nowMs: NOW }).forYouPayload, null)
})
