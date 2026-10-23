import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createAutoImport, watchForFinishedRecordings } from '../src/auto-import.js'
import { createScheduleCheck, scheduleEverRuns } from '../src/schedule-runs.js'

const fakeClock = () => {
  let now = 0
  const timers = new Map()
  let nextId = 1
  return {
    nowMs: () => now,
    setTimer: (fn, ms) => {
      const id = nextId++
      timers.set(id, { fn, at: now + ms })
      return id
    },
    clearTimer: (id) => timers.delete(id),
    advance: async (ms) => {
      now += ms
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(id)
          timer.fn()
        }
      }
      await new Promise((resolve) => setImmediate(resolve))
    },
    pending: () => timers.size,
  }
}

const autoImportWith = ({ enabled = true, running = () => false } = {}) => {
  const clock = fakeClock()
  const syncs = []
  const finishListeners = []
  const autoImport = createAutoImport({
    isEnabled: async () => enabled,
    runSync: async () => { syncs.push(clock.nowMs()) },
    isSyncRunning: running,
    onSyncFinished: (listener) => {
      finishListeners.push(listener)
      return () => {}
    },
    quietMs: 60_000,
    maxWaitMs: 300_000,
    nowMs: clock.nowMs,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  })
  const syncFinished = () => finishListeners.forEach((listener) => listener({}))
  return { autoImport, clock, syncs, syncFinished }
}

test('createAutoImport: a finished recording starts one sync after the quiet minute', async () => {
  const { autoImport, clock, syncs } = autoImportWith()
  autoImport.noteFinished()
  await clock.advance(59_000)
  assert.deepEqual(syncs, [])
  await clock.advance(1_000)
  assert.deepEqual(syncs, [60_000])
})

test('createAutoImport: recordings that finish together share one sync', async () => {
  const { autoImport, clock, syncs } = autoImportWith()
  autoImport.noteFinished()
  await clock.advance(30_000)
  autoImport.noteFinished()
  await clock.advance(30_000)
  autoImport.noteFinished()
  await clock.advance(60_000)
  assert.deepEqual(syncs, [120_000])
})

test('createAutoImport: a stream of finishes still syncs within the longest wait', async () => {
  const { autoImport, clock, syncs } = autoImportWith()
  for (let i = 0; i < 12; i++) {
    autoImport.noteFinished()
    await clock.advance(30_000)
  }
  assert.equal(syncs[0], 300_000)
})

test('createAutoImport: never starts a sync while one runs, and follows up when it ends', async () => {
  let running = true
  const { autoImport, clock, syncs, syncFinished } = autoImportWith({ running: () => running })
  autoImport.noteFinished()
  await clock.advance(60_000)
  assert.deepEqual(syncs, [])
  assert.equal(autoImport.isWaiting(), true)
  running = false
  syncFinished()
  await clock.advance(0)
  assert.deepEqual(syncs, [60_000])
  syncFinished()
  await clock.advance(0)
  assert.equal(syncs.length, 1)
})

test('createAutoImport: does nothing when scheduled syncs are off', async () => {
  const { autoImport, clock, syncs } = autoImportWith({ enabled: false })
  autoImport.noteFinished()
  await clock.advance(300_000)
  assert.deepEqual(syncs, [])
})

test('createAutoImport: a sync that ends with no finish waiting starts nothing', async () => {
  const { clock, syncs, syncFinished } = autoImportWith()
  syncFinished()
  await clock.advance(60_000)
  assert.deepEqual(syncs, [])
})

test('watchForFinishedRecordings: polls TVHeadend only while scheduled syncs are on', () => {
  let tick = null
  let enabled = false
  let polls = 0
  const stop = watchForFinishedRecordings({
    isEnabled: () => enabled,
    poll: async () => { polls++ },
    setRepeat: (fn) => { tick = fn; return 1 },
    clearRepeat: () => { tick = null },
  })
  tick()
  assert.equal(polls, 0)
  enabled = true
  tick()
  assert.equal(polls, 1)
  stop()
  assert.equal(tick, null)
})

test('scheduleEverRuns: the default and custom schedules run', () => {
  const fromMs = new Date(2026, 9, 23).getTime()
  assert.equal(scheduleEverRuns({ expr: '*/30 * * * *', fromMs }), true)
  assert.equal(scheduleEverRuns({ expr: '0 3 * * 0', fromMs }), true)
  assert.equal(scheduleEverRuns({ expr: '0 0 29 2 *', fromMs }), true)
  assert.equal(scheduleEverRuns({ expr: '0 0 0 1 1 *', fromMs }), true)
  assert.equal(scheduleEverRuns({ expr: '0 0 29 2 7', fromMs }), true)
})

test('scheduleEverRuns: a date that never comes means scheduled syncs are off', () => {
  const fromMs = new Date(2026, 9, 23).getTime()
  assert.equal(scheduleEverRuns({ expr: '0 0 31 2 *', fromMs }), false)
  assert.equal(scheduleEverRuns({ expr: '0 0 30 2 *', fromMs }), false)
  assert.equal(scheduleEverRuns({ expr: '0 0 31 4 *', fromMs }), false)
  assert.equal(scheduleEverRuns({ expr: 'nonsense', fromMs }), false)
})

test('createScheduleCheck: no schedule means off, and the answer is kept per expression', () => {
  let expr = null
  const asked = []
  const check = createScheduleCheck({
    expression: () => expr,
    everRuns: ({ expr: e }) => {
      asked.push(e)
      return e !== '0 0 31 2 *'
    },
  })
  assert.equal(check(), false)
  expr = '0 0 31 2 *'
  assert.equal(check(), false)
  assert.equal(check(), false)
  expr = '*/30 * * * *'
  assert.equal(check(), true)
  assert.deepEqual(asked, ['0 0 31 2 *', '*/30 * * * *'])
})
