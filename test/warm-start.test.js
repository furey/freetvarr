import { test } from 'node:test'
import assert from 'node:assert/strict'

import { readSnapshot, writeSnapshot, } from '../src/web/warm-start.js'

const memoryStorage = () => {
  const items = new Map()
  return {
    getItem: (k) => (items.has(k) ? items.get(k) : null),
    setItem: (k, v) => items.set(k, v),
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

test('a written snapshot reads back', () => {
  const storage = memoryStorage()
  writeSnapshot({ storage, key: 'dashboard', data: { count: 3 }, nowMs: 1000 })
  assert.deepEqual(readSnapshot({ storage, key: 'dashboard', nowMs: 2000 }), { count: 3 })
})

test('a missing snapshot reads as null', () => {
  assert.equal(readSnapshot({ storage: memoryStorage(), key: 'dashboard' }), null)
})

test('a snapshot older than 7 days reads as null', () => {
  const storage = memoryStorage()
  writeSnapshot({ storage, key: 'dashboard', data: { count: 3 }, nowMs: 0 })
  assert.equal(readSnapshot({ storage, key: 'dashboard', nowMs: 7 * DAY_MS }), null)
})

test('a snapshot from another version reads as null', () => {
  const storage = memoryStorage()
  storage.setItem('freetvarr.snapshot.dashboard', JSON.stringify({ version: 0, savedAt: 0, data: {} }))
  assert.equal(readSnapshot({ storage, key: 'dashboard', nowMs: 1 }), null)
})

test('broken or blocked storage reads as null and writes nothing', () => {
  const storage = memoryStorage()
  storage.setItem('freetvarr.snapshot.dashboard', '{not json')
  assert.equal(readSnapshot({ storage, key: 'dashboard' }), null)
  const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
  assert.equal(readSnapshot({ storage: blocked, key: 'dashboard' }), null)
  assert.doesNotThrow(() => writeSnapshot({ storage: blocked, key: 'dashboard', data: {} }))
  assert.equal(readSnapshot({ storage: null, key: 'dashboard' }), null)
})
