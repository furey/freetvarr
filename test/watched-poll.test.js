import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createWatchedPoll } from '../src/web/watched-poll.js'

const settle = () => new Promise((resolve) => setImmediate(resolve))

const fakeTimers = () => {
  const pending = new Map()
  let next = 1
  return {
    pending,
    setTimeout: (fn) => {
      const id = next++
      pending.set(id, fn)
      return id
    },
    clearTimeout: (id) => { pending.delete(id) },
    fire: () => {
      const due = [...pending.values()]
      pending.clear()
      for (const fn of due) fn()
    },
  }
}

const deferredLoads = () => {
  const waiting = []
  const load = () => new Promise((resolve) => waiting.push(resolve))
  const finish = async () => {
    waiting.shift()?.()
    await settle()
  }
  return { load, waiting, finish }
}

const setup = () => {
  const timers = fakeTimers()
  const loads = deferredLoads()
  const watch = createWatchedPoll({ load: loads.load, everyMs: 5_000, timers })
  return { timers, loads, watch }
}

test('the first watcher starts one poll and later watchers share it', async () => {
  const { timers, loads, watch } = setup()
  watch()
  watch()
  assert.equal(loads.waiting.length, 1)
  await loads.finish()
  assert.equal(timers.pending.size, 1)
})

test('a watcher that leaves and returns during a poll does not start a second chain', async () => {
  const { timers, loads, watch } = setup()
  const release = watch()
  release()
  watch()
  assert.equal(loads.waiting.length, 1)
  await loads.finish()
  assert.equal(timers.pending.size, 1)
  timers.fire()
  assert.equal(loads.waiting.length, 1)
  await loads.finish()
  assert.equal(timers.pending.size, 1)
})

test('the last watcher to leave stops the poll', async () => {
  const { timers, loads, watch } = setup()
  const release = watch()
  await loads.finish()
  release()
  assert.equal(timers.pending.size, 0)
})

test('a poll that finishes after the last watcher left does not reschedule', async () => {
  const { timers, loads, watch } = setup()
  watch()()
  await loads.finish()
  assert.equal(timers.pending.size, 0)
})

test('a failed load still reschedules the poll', async () => {
  const timers = fakeTimers()
  const watch = createWatchedPoll({ load: async () => { throw new Error('down') }, everyMs: 5_000, timers })
  watch()
  await settle()
  assert.equal(timers.pending.size, 1)
})
