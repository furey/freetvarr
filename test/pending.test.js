import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PENDING_MIN_MS, remainingHoldMs, holdAtLeast } from '../src/web/pending.js'

const fakeClock = (times) => {
  const queue = [...times]
  return () => queue.shift()
}

test('remainingHoldMs: a fast task holds for the rest of the minimum', () => {
  assert.equal(remainingHoldMs({ startedAt: 1000, now: 1080 }), PENDING_MIN_MS - 80)
})

test('remainingHoldMs: a slow task holds no longer', () => {
  assert.equal(remainingHoldMs({ startedAt: 1000, now: 1500 }), 0)
  assert.equal(remainingHoldMs({ startedAt: 1000, now: 1300 }), 0)
})

test('remainingHoldMs: a clock that steps back still holds the full minimum, never more', () => {
  assert.equal(remainingHoldMs({ startedAt: 1000, now: 900 }), PENDING_MIN_MS)
})

test('remainingHoldMs: honours a custom minimum', () => {
  assert.equal(remainingHoldMs({ startedAt: 0, now: 100, minMs: 500 }), 400)
})

test('holdAtLeast: waits out the minimum after a fast task and returns its value', async () => {
  const waits = []
  const value = await holdAtLeast({
    task: async () => 'done',
    clock: fakeClock([0, 50]),
    wait: async (ms) => { waits.push(ms) },
  })
  assert.equal(value, 'done')
  assert.deepEqual(waits, [250])
})

test('holdAtLeast: skips the wait after a slow task', async () => {
  const waits = []
  await holdAtLeast({ task: async () => {}, clock: fakeClock([0, 900]), wait: async (ms) => { waits.push(ms) } })
  assert.deepEqual(waits, [])
})

test('holdAtLeast: still holds the minimum when the task fails, then rethrows', async () => {
  const waits = []
  await assert.rejects(
    holdAtLeast({
      task: async () => { throw new Error('nope') },
      clock: fakeClock([0, 10]),
      wait: async (ms) => { waits.push(ms) },
    }),
    /nope/,
  )
  assert.deepEqual(waits, [290])
})

test('holdAtLeast: really waits with the default timer', async () => {
  const startedAt = Date.now()
  await holdAtLeast({ task: async () => {}, minMs: 40 })
  assert.ok(Date.now() - startedAt >= 35)
})
