import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createRecordingStateCache } from '../src/recording-state-cache.js'

const TTL = 45_000
const RETRY = 60_000

const deferred = () => {
  let resolve
  const promise = new Promise((res) => { resolve = res })
  return { promise, resolve }
}

const settle = () => new Promise(setImmediate)

const scriptedLoads = () => {
  const pending = []
  const load = () => {
    const next = deferred()
    pending.push(next)
    return next.promise
  }
  return { load, pending }
}

test('a read after an invalidate starts a new load instead of joining the older one', async () => {
  let clock = 0
  const { load, pending } = scriptedLoads()
  const cache = createRecordingStateCache({ load, ttlMs: TTL, retryMs: RETRY, now: () => clock })
  const first = cache.get()
  await settle()
  pending[0].resolve({ version: 'before' })
  await first
  clock = TTL + 1
  assert.deepEqual(await cache.get(), { version: 'before' })
  await settle()
  assert.equal(pending.length, 2)
  cache.invalidate()
  const freshRead = cache.get({ fresh: true })
  const plainRead = cache.get()
  await settle()
  assert.equal(pending.length, 3)
  pending[1].resolve({ version: 'before-write' })
  pending[2].resolve({ version: 'after-write' })
  assert.deepEqual(await freshRead, { version: 'after-write' })
  assert.deepEqual(await plainRead, { version: 'after-write' })
  assert.deepEqual(await cache.get(), { version: 'after-write' })
  assert.deepEqual(cache.peek(), { version: 'after-write' })
})

test('an older load that ends after an invalidate is not cached', async () => {
  const { load, pending } = scriptedLoads()
  const cache = createRecordingStateCache({ load, ttlMs: TTL, retryMs: RETRY, now: () => 0 })
  const old = cache.get({ fresh: true })
  await settle()
  cache.invalidate()
  pending[0].resolve({ version: 'before-write' })
  assert.deepEqual(await old, { version: 'before-write' })
  assert.equal(cache.peek(), null)
  const next = cache.get()
  await settle()
  pending[1].resolve({ version: 'after-write' })
  assert.deepEqual(await next, { version: 'after-write' })
})

test('the older load does not clear the newer load it no longer owns', async () => {
  const { load, pending } = scriptedLoads()
  const cache = createRecordingStateCache({ load, ttlMs: TTL, retryMs: RETRY, now: () => 0 })
  const old = cache.get({ fresh: true })
  await settle()
  cache.invalidate()
  const newer = cache.get({ fresh: true })
  await settle()
  pending[0].resolve({ version: 'old' })
  await old
  const joined = cache.get({ fresh: true })
  await settle()
  assert.equal(pending.length, 2)
  pending[1].resolve({ version: 'new' })
  assert.deepEqual(await newer, { version: 'new' })
  assert.deepEqual(await joined, { version: 'new' })
})

test('a failed load serves the last good state as stale and waits before retrying', async () => {
  let clock = 0
  let calls = 0
  const load = async () => {
    calls += 1
    if (calls > 1) throw new Error('TVHeadend down')
    return { version: 1 }
  }
  const cache = createRecordingStateCache({ load, ttlMs: TTL, retryMs: RETRY, now: () => clock })
  await cache.get()
  clock = TTL + 1
  assert.deepEqual(await cache.get({ fresh: true }), { version: 1, stale: true })
  assert.deepEqual(await cache.get(), { version: 1, stale: true })
  assert.equal(calls, 2)
})
