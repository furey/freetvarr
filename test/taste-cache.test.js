import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTasteCache, TASTE_TTL_MS } from '../src/web/taste-cache.js'

const clockAt = (start = 0) => {
  const clock = { ms: start }
  return { clock, now: () => clock.ms }
}

const taste = { enabled: true, hidden: false, category: { key: 'comedy' } }

test('taste cache: an answer is reused until the time to live runs out', () => {
  const { clock, now } = clockAt()
  const cache = createTasteCache({ now })
  cache.set({ title: 'Family Guy', kind: 'show', taste, startedIn: cache.generation() })
  clock.ms = TASTE_TTL_MS - 1
  assert.equal(cache.get({ title: 'Family Guy', kind: 'show' }), taste)
  clock.ms = TASTE_TTL_MS
  assert.equal(cache.get({ title: 'Family Guy', kind: 'show' }), undefined)
})

test('taste cache: the same title with another kind is a different answer', () => {
  const cache = createTasteCache()
  cache.set({ title: 'Wicked', kind: 'movie', taste, startedIn: cache.generation() })
  assert.equal(cache.get({ title: 'Wicked', kind: 'movie' }), taste)
  assert.equal(cache.get({ title: 'Wicked', kind: 'show' }), undefined)
})

test('taste cache: clearing drops every answer', () => {
  const cache = createTasteCache()
  cache.set({ title: 'Vera', kind: 'show', taste, startedIn: cache.generation() })
  cache.clear()
  assert.equal(cache.get({ title: 'Vera', kind: 'show' }), undefined)
})

test('taste cache: an answer fetched before the last clear is not kept', () => {
  const cache = createTasteCache()
  const startedIn = cache.generation()
  cache.clear()
  assert.equal(cache.set({ title: 'Vera', kind: 'show', taste, startedIn }), false)
  assert.equal(cache.get({ title: 'Vera', kind: 'show' }), undefined)
})

test('taste cache: the oldest answer goes first past the limit', () => {
  const cache = createTasteCache({ limit: 2 })
  for (const title of ['A', 'B', 'C']) cache.set({ title, kind: 'show', taste, startedIn: cache.generation() })
  assert.equal(cache.get({ title: 'A', kind: 'show' }), undefined)
  assert.equal(cache.get({ title: 'C', kind: 'show' }), taste)
})
