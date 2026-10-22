import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HERO_MISSING_ART_KEY, MISSING_ART_TTL_MS, missingArtKeysOf, rememberMissingArt } from '../src/web/hero-missing-art.js'
import { heroSlidesOf } from '../src/web/home-hero.js'

const memoryStorage = () => {
  const items = new Map()
  return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => items.set(key, String(value)) }
}

test('a slide whose picture failed stays out for six hours, then gets another chance', () => {
  const storage = memoryStorage()
  assert.deepEqual([...rememberMissingArt({ storage, key: 'on-now:7:1', nowMs: 1_000 })], ['on-now:7:1'])
  assert.deepEqual([...missingArtKeysOf({ storage, nowMs: 1_000 + MISSING_ART_TTL_MS - 1 })], ['on-now:7:1'])
  assert.equal(missingArtKeysOf({ storage, nowMs: 1_000 + MISSING_ART_TTL_MS }).size, 0)
})

test('expired keys are cleared when a new one is remembered, and bad storage reads as empty', () => {
  const storage = memoryStorage()
  rememberMissingArt({ storage, key: 'old', nowMs: 0 })
  const keys = rememberMissingArt({ storage, key: 'new', nowMs: MISSING_ART_TTL_MS })
  assert.deepEqual([...keys], ['new'])
  storage.setItem(HERO_MISSING_ART_KEY, 'not json')
  assert.equal(missingArtKeysOf({ storage, nowMs: 0 }).size, 0)
  assert.deepEqual([...rememberMissingArt({ storage: null, key: 'k', nowMs: 0 })], ['k'])
})

test('heroSlidesOf leaves out slides whose picture is missing and fills the space from the rest', () => {
  const movie = (n) => ({ recordingId: n, title: `Film ${n}`, image: `/img/${n}`, recordedAt: n, duration: 5400 })
  const feed = { movies: [movie(1), movie(2)], nowMs: 0, timeZone: 'UTC', remix: false }
  const all = heroSlidesOf(feed)
  assert.ok(all.length >= 1)
  const without = heroSlidesOf({ ...feed, missingArtKeys: new Set([all[0].key]) })
  assert.ok(!without.some((slide) => slide.key === all[0].key))
})
