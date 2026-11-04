import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createPoll } from '../src/web/poll.js'

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

test('createPoll: two failed runs in a row still book a third run', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let runs = 0
  const poll = createPoll({
    run: async () => {
      runs += 1
      if (runs <= 2) throw new Error('Could not reach Freetvarr.')
    },
    delayOf: () => 5000,
  })
  poll.book()
  for (let i = 0; i < 3; i++) {
    t.mock.timers.tick(5000)
    await flush()
  }
  assert.equal(runs, 3)
  poll.stop()
})

test('createPoll: a stop while a run is pending books nothing more', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let runs = 0
  let finish = null
  const poll = createPoll({
    run: () => {
      runs += 1
      return new Promise((resolve) => { finish = resolve })
    },
    delayOf: () => 60_000,
  })
  poll.book()
  t.mock.timers.tick(60_000)
  await flush()
  assert.equal(runs, 1)
  poll.stop()
  finish()
  await flush()
  t.mock.timers.tick(120_000)
  await flush()
  assert.equal(runs, 1)
  assert.equal(poll.isBooked(), false)
})

test('createPoll: a null delay books nothing, and book after stop stays stopped', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let runs = 0
  const idle = createPoll({ run: () => { runs += 1 }, delayOf: () => null })
  idle.book()
  assert.equal(idle.isBooked(), false)
  const stopped = createPoll({ run: () => { runs += 1 }, delayOf: () => 10 })
  stopped.stop()
  stopped.book()
  t.mock.timers.tick(100)
  assert.equal(runs, 0)
})

test('createPoll: booking again keeps one timer', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let runs = 0
  const poll = createPoll({ run: () => { runs += 1 }, delayOf: () => (runs < 1 ? 1000 : null) })
  poll.book()
  poll.book()
  t.mock.timers.tick(1000)
  await flush()
  assert.equal(runs, 1)
})
