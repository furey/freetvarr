import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createFallbackArtwork } from '../src/fallback-artwork.js'

const memoryCache = () => {
  const rows = new Map()
  return {
    rows,
    read: async (key) => rows.get(key) || null,
    write: async ({ key, sources, expiresAt }) => { rows.set(key, { sources, expiresAt }) },
    remove: async (key) => { rows.delete(key) },
  }
}

const fallbackWith = ({ lookUp, apiKey = null, enabled = true, clock = { ms: 1000 }, cache = memoryCache() }) => ({
  cache,
  clock,
  artwork: createFallbackArtwork({
    lookUp,
    cache,
    isEnabled: async () => enabled,
    tmdbKey: async () => apiKey,
    hintsFor: async (title) => ({ title }),
    now: () => clock.ms,
    hitTtlMs: 100,
    missTtlMs: 10,
    failureBackoffMs: 50,
  }),
})

test('a hit is cached for the hit TTL and served without another lookup', async () => {
  let calls = 0
  const { artwork, cache, clock } = fallbackWith({ lookUp: async () => { calls += 1; return { sources: ['https://upload.wikimedia.org/a.jpg'] } } })
  assert.deepEqual(await artwork.sourcesFor('Cool Runnings'), ['https://upload.wikimedia.org/a.jpg'])
  assert.equal(cache.rows.get('open:cool runnings').expiresAt, 1100)
  clock.ms = 1099
  assert.deepEqual(await artwork.artworkFor('Cool Runnings'), { sources: ['https://upload.wikimedia.org/a.jpg'], pending: false })
  assert.equal(calls, 1)
})

test('a miss is remembered for the shorter miss TTL', async () => {
  let calls = 0
  const { artwork, clock } = fallbackWith({ lookUp: async () => { calls += 1; return null } })
  assert.deepEqual(await artwork.sourcesFor('Nothing Here'), [])
  clock.ms = 1009
  assert.deepEqual(await artwork.sourcesFor('Nothing Here'), [])
  assert.equal(calls, 1)
  clock.ms = 1011
  await artwork.sourcesFor('Nothing Here')
  assert.equal(calls, 2)
})

test('a failed lookup is not cached but backs off for a while', async () => {
  let calls = 0
  const { artwork, cache, clock } = fallbackWith({ lookUp: async () => { calls += 1; throw new Error('down') } })
  assert.deepEqual(await artwork.sourcesFor('Flaky'), [])
  assert.equal(cache.rows.size, 0)
  assert.deepEqual(await artwork.artworkFor('Flaky'), { sources: [], pending: false })
  assert.equal(calls, 1)
  clock.ms += 51
  await artwork.sourcesFor('Flaky')
  assert.equal(calls, 2)
})

test('artworkFor answers pending at once and shares one lookup between callers', async () => {
  let release
  let calls = 0
  const { artwork } = fallbackWith({
    lookUp: () => {
      calls += 1
      return new Promise((resolve) => { release = () => resolve({ sources: ['https://image.tmdb.org/t/p/w780/p.jpg'] }) })
    },
  })
  assert.deepEqual(await artwork.artworkFor('Slow'), { sources: [], pending: true })
  const waiting = artwork.sourcesFor('Slow')
  while (!release) await new Promise((resolve) => setTimeout(resolve, 1))
  release()
  assert.deepEqual(await waiting, ['https://image.tmdb.org/t/p/w780/p.jpg'])
  assert.equal(calls, 1)
})

test('nothing is looked up when lookups are off', async () => {
  let calls = 0
  const { artwork } = fallbackWith({ enabled: false, lookUp: async () => { calls += 1 } })
  assert.deepEqual(await artwork.artworkFor('Anything'), { sources: [], pending: false })
  assert.deepEqual(await artwork.sourcesFor('Anything'), [])
  assert.equal(calls, 0)
})

test('a TMDB key gets its own cache entries and is passed to the lookup', async () => {
  const keys = []
  const { artwork, cache } = fallbackWith({ apiKey: 'k', lookUp: async ({ apiKey }) => { keys.push(apiKey); return null } })
  await artwork.sourcesFor('Film')
  assert.deepEqual(keys, ['k'])
  assert.ok(cache.rows.has('tmdb:film'))
  await artwork.forget('Film')
  assert.equal(cache.rows.size, 0)
})
