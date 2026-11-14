import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  RESTART_TRIGGER,
  SCHEDULE_GRACE_MS,
  restartSyncPlan,
  runAgainAfterRestart,
  scheduleRestartSync,
} from '../src/restart-sync.js'

const NOW_MS = Date.parse('2026-11-14T03:00:00Z')
const inMinutes = (minutes) => new Date(NOW_MS + minutes * 60_000).toISOString()

const runWith = async ({ stopped, syncsOn = true, nextRunAt = inMinutes(30), result = { syncId: 7, alreadyRunning: false } }) => {
  const calls = { starts: [], notes: [] }
  const outcome = await runAgainAfterRestart({
    stopped,
    scheduledSyncsOn: () => syncsOn,
    nextRunAt: () => nextRunAt,
    startSync: async (options) => {
      calls.starts.push(options)
      return result
    },
    noteRanAgain: async (note) => { calls.notes.push(note) },
    nowMs: NOW_MS,
  })
  return { ...calls, plan: outcome.plan }
}

test('runAgainAfterRestart: a sync a restart stopped runs again through startSync and is noted on the old entry', async () => {
  const { starts, notes, plan } = await runWith({ stopped: [{ id: 4, trigger: 'cron' }] })
  assert.equal(plan, 'run-again')
  assert.deepEqual(starts, [{ trigger: RESTART_TRIGGER }])
  assert.deepEqual(notes, [{ ids: [4], syncId: 7 }])
})

test('runAgainAfterRestart: no stopped sync means no new sync', async () => {
  const { starts, plan } = await runWith({ stopped: [] })
  assert.equal(plan, 'none')
  assert.deepEqual(starts, [])
})

test('runAgainAfterRestart: a scheduled sync due within 2 minutes runs instead', async () => {
  const { starts, plan } = await runWith({ stopped: [{ id: 4, trigger: 'manual' }], nextRunAt: inMinutes(1.5) })
  assert.equal(plan, 'schedule-due')
  assert.deepEqual(starts, [])
  const later = new Date(NOW_MS + SCHEDULE_GRACE_MS + 1000).toISOString()
  assert.equal(restartSyncPlan({ stopped: [{ id: 4 }], scheduledSyncsOn: true, nextRunAt: later, nowMs: NOW_MS }), 'run-again')
})

test('runAgainAfterRestart: a stopped re-run is left to the schedule, so a crash loop starts no more syncs', async () => {
  const { starts, plan } = await runWith({ stopped: [{ id: 5, trigger: RESTART_TRIGGER }] })
  assert.equal(plan, 'leave-to-schedule')
  assert.deepEqual(starts, [])
  const mixed = [{ id: 4, trigger: 'cron' }, { id: 5, trigger: RESTART_TRIGGER }]
  assert.equal(restartSyncPlan({ stopped: mixed, scheduledSyncsOn: true, nextRunAt: null, nowMs: NOW_MS }), 'leave-to-schedule')
})

test('runAgainAfterRestart: only the latest stopped sync counts, so an older stopped restart sync does not block a re-run', async () => {
  const { starts, plan } = await runWith({ stopped: [{ id: 5, trigger: RESTART_TRIGGER }, { id: 6, trigger: 'cron' }] })
  assert.equal(plan, 'run-again')
  assert.deepEqual(starts, [{ trigger: RESTART_TRIGGER }])
})

test('runAgainAfterRestart: no new sync when scheduled syncs are off', async () => {
  const { starts, plan } = await runWith({ stopped: [{ id: 4, trigger: 'cron' }], syncsOn: false })
  assert.equal(plan, 'syncs-off')
  assert.deepEqual(starts, [])
})

test('runAgainAfterRestart: a sync already running covers the work, so the old entry gets no note', async () => {
  const { starts, notes } = await runWith({ stopped: [{ id: 4, trigger: 'cron' }], result: { syncId: 9, alreadyRunning: true } })
  assert.equal(starts.length, 1)
  assert.deepEqual(notes, [])
})

test('scheduleRestartSync: starts one sync, after the delay', async () => {
  const starts = []
  scheduleRestartSync({
    delayMs: 5,
    log: { log: () => {}, warn: () => {} },
    stopped: [{ id: 4, trigger: 'cron' }],
    scheduledSyncsOn: () => true,
    nextRunAt: () => null,
    startSync: async (options) => {
      starts.push(options)
      return { syncId: 8, alreadyRunning: false }
    },
    noteRanAgain: async () => {},
  })
  assert.equal(starts.length, 0)
  await new Promise((resolve) => { setTimeout(resolve, 40) })
  assert.deepEqual(starts, [{ trigger: RESTART_TRIGGER }])
})

test('scheduleRestartSync: sets no timer when no sync was stopped', () => {
  const cancel = scheduleRestartSync({ stopped: [], startSync: () => assert.fail('no sync expected') })
  assert.equal(typeof cancel, 'function')
})
