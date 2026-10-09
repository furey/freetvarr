import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createGuideCache } from '../src/guide-cache.js'

const DAY = 86_400_000
const HOUR = 3_600_000

const deferred = () => {
  let resolve
  const promise = new Promise((res) => { resolve = res })
  return { promise, resolve }
}

const settle = () => new Promise(setImmediate)

const countingLoader = ({ now }) => {
  const calls = []
  const load = async (startMs) => {
    calls.push(startMs)
    return { startMs, version: calls.length, expiresAt: now() + HOUR }
  }
  return { load, calls }
}

test('serves the cached guide until it expires', async () => {
  let clock = 0
  const now = () => clock
  const { load, calls } = countingLoader({ now })
  const cache = createGuideCache({ load, staleRetryMs: 60_000, now })
  assert.equal((await cache.get(0)).version, 1)
  assert.equal((await cache.get(0)).version, 1)
  assert.deepEqual(calls, [0])
})

test('serves the expired guide while it reloads in the background', async () => {
  let clock = 0
  const now = () => clock
  const { load, calls } = countingLoader({ now })
  const cache = createGuideCache({ load, staleRetryMs: 60_000, now })
  await cache.get(0)
  clock = HOUR + 1
  assert.equal((await cache.get(0)).version, 1)
  await settle()
  assert.equal((await cache.get(0)).version, 2)
  assert.deepEqual(calls, [0, 0])
})

test('shares one background reload between readers of an expired guide', async () => {
  let clock = 0
  const reload = deferred()
  let calls = 0
  const load = (startMs) => {
    calls += 1
    if (calls === 1) return Promise.resolve({ startMs, version: 1, expiresAt: HOUR })
    return reload.promise
  }
  const cache = createGuideCache({ load, staleRetryMs: 60_000, now: () => clock })
  await cache.get(0)
  clock = HOUR + 1
  const readers = await Promise.all([cache.get(0), cache.get(0), cache.get(0)])
  assert.deepEqual(readers.map((guide) => guide.version), [1, 1, 1])
  assert.equal(calls, 2)
  reload.resolve({ startMs: 0, version: 2, expiresAt: 2 * HOUR + 1 })
  await settle()
  assert.equal((await cache.get(0)).version, 2)
})

test('a new day waits for its own guide instead of serving the old day', async () => {
  let clock = 0
  const now = () => clock
  const { load, calls } = countingLoader({ now })
  const cache = createGuideCache({ load, staleRetryMs: 60_000, now })
  await cache.get(0)
  clock = HOUR + 1
  await cache.get(0)
  const nextDay = await cache.get(DAY)
  assert.equal(nextDay.startMs, DAY)
  await settle()
  assert.equal((await cache.get(DAY)).startMs, DAY)
  assert.deepEqual(calls, [0, 0, DAY])
})

test('clear during a background reload makes the next read wait for a fresh load', async () => {
  let clock = 0
  const reload = deferred()
  let calls = 0
  const load = (startMs) => {
    calls += 1
    if (calls === 2) return reload.promise
    return Promise.resolve({ startMs, version: calls, expiresAt: clock + HOUR })
  }
  const cache = createGuideCache({ load, staleRetryMs: 60_000, now: () => clock })
  await cache.get(0)
  clock = HOUR + 1
  await cache.get(0)
  cache.clear()
  assert.equal((await cache.get(0)).version, 3)
  reload.resolve({ startMs: 0, version: 2, expiresAt: 3 * HOUR })
  await settle()
  assert.equal((await cache.get(0)).version, 3)
})

test('loads again for a new day', async () => {
  const now = () => 0
  const { load, calls } = countingLoader({ now })
  const cache = createGuideCache({ load, staleRetryMs: 60_000, now })
  await cache.get(0)
  await cache.get(DAY)
  assert.deepEqual(calls, [0, DAY])
})

test('clear makes the next read load the guide again', async () => {
  const now = () => 0
  const { load, calls } = countingLoader({ now })
  const cache = createGuideCache({ load, staleRetryMs: 60_000, now })
  await cache.get(0)
  cache.clear()
  assert.equal((await cache.get(0)).version, 2)
  assert.equal(calls.length, 2)
})

test('a load that started before clear is not cached', async () => {
  const first = deferred()
  let calls = 0
  const load = (startMs) => {
    calls += 1
    if (calls === 1) return first.promise
    return Promise.resolve({ startMs, version: calls, expiresAt: HOUR })
  }
  const cache = createGuideCache({ load, staleRetryMs: 60_000, now: () => 0 })
  const early = cache.get(0)
  cache.clear()
  first.resolve({ startMs: 0, version: 1, expiresAt: HOUR })
  assert.equal((await early).version, 1)
  assert.equal((await cache.get(0)).version, 2)
})

test('shares one load between readers', async () => {
  const now = () => 0
  const { load, calls } = countingLoader({ now })
  const cache = createGuideCache({ load, staleRetryMs: 60_000, now })
  await Promise.all([cache.get(0), cache.get(0)])
  assert.equal(calls.length, 1)
})

test('a failed reload keeps the old guide, marked stale', async () => {
  let clock = 0
  let fail = false
  const load = async (startMs) => {
    if (fail) throw new Error('down')
    return { startMs, expiresAt: clock + 1000 }
  }
  const cache = createGuideCache({ load, staleRetryMs: 60_000, now: () => clock })
  await cache.get(0)
  clock = 2000
  fail = true
  await cache.get(0)
  await settle()
  const stale = await cache.get(0)
  assert.equal(stale.stale, true)
  assert.equal(stale.expiresAt, 62_000)
})

test('a failed load with no cached guide throws', async () => {
  const cache = createGuideCache({ load: async () => { throw new Error('down') }, staleRetryMs: 60_000 })
  await assert.rejects(cache.get(0), /down/)
})
