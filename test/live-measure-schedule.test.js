import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  isMeasureDue,
  liveMeasureBusyReason,
  processorQuiet,
  startLiveMeasureSchedule,
  waitForIdle,
} from '../src/live-measure-schedule.js'

const BOUNDS = { firstDelayMs: 60_000, pollMs: 30_000, settleMs: 90_000, giveUpMs: 15 * 60_000 }

const fakeClock = () => {
  let nowMs = 0
  return {
    now: () => nowMs,
    sleep: async (ms) => { nowMs += ms },
  }
}

const quietLog = { log: () => {}, warn: () => {} }

test('waitForIdle: an idle reading at boot still waits for the first delay and the settle time', async () => {
  const clock = fakeClock()
  const outcome = await waitForIdle({ ...BOUNDS, ...clock, isIdle: async () => true })
  assert.deepEqual(outcome, { gaveUp: false })
  assert.equal(clock.now(), BOUNDS.firstDelayMs + BOUNDS.settleMs)
})

test('waitForIdle: waits while busy and starts the settle time again after each busy reading', async () => {
  const clock = fakeClock()
  const busyUntil = 5 * 60_000
  const blip = busyUntil + 60_000
  const isIdle = async () => clock.now() >= busyUntil && clock.now() !== blip
  const outcome = await waitForIdle({ ...BOUNDS, ...clock, isIdle })
  assert.deepEqual(outcome, { gaveUp: false })
  assert.equal(clock.now(), blip + BOUNDS.pollMs + BOUNDS.settleMs)
})

test('waitForIdle: gives up after the bound when the server never goes quiet', async () => {
  const clock = fakeClock()
  const outcome = await waitForIdle({ ...BOUNDS, ...clock, isIdle: async () => false })
  assert.deepEqual(outcome, { gaveUp: true })
  assert.equal(clock.now(), BOUNDS.giveUpMs)
})

test('isMeasureDue: due with no run this start, then once a day', () => {
  assert.equal(isMeasureDue({ lastRunAt: null, nowMs: 5 }), true)
  assert.equal(isMeasureDue({ lastRunAt: 0, nowMs: 23 * 3_600_000 }), false)
  assert.equal(isMeasureDue({ lastRunAt: 0, nowMs: 24 * 3_600_000 }), true)
})

test('processorQuiet: compares the one-minute load with the processor count', () => {
  assert.equal(processorQuiet({ loadavg: () => [0.8, 0, 0], cpuCount: () => 2 }), true)
  assert.equal(processorQuiet({ loadavg: () => [1.4, 0, 0], cpuCount: () => 2 }), false)
  assert.equal(processorQuiet({ loadavg: () => [0.5, 0, 0], cpuCount: () => 0 }), true)
})

test('liveMeasureBusyReason: names streams, running jobs, recordings, then the processor', async () => {
  const base = {
    streamsBusy: () => false,
    runningJobs: () => [],
    recordingNow: async () => ({ active: [], finishing: [] }),
    quiet: () => true,
  }
  assert.equal(await liveMeasureBusyReason(base), null)
  assert.equal(await liveMeasureBusyReason({ ...base, streamsBusy: () => true }), 'playback or ad scan')
  assert.equal(await liveMeasureBusyReason({ ...base, runningJobs: () => ['health', 'guide', 'artwork'] }), 'guide')
  assert.equal(await liveMeasureBusyReason({ ...base, runningJobs: () => ['health', 'hero', 'plex-watch', 'ratings'] }), null)
  assert.equal(await liveMeasureBusyReason({ ...base, recordingNow: async () => ({ active: [{}] }) }), 'recording')
  assert.equal(await liveMeasureBusyReason({ ...base, recordingNow: async () => ({ finishing: [{}] }) }), 'recording')
  assert.equal(await liveMeasureBusyReason({ ...base, recordingNow: async () => { throw new Error('down') } }), null)
  assert.equal(await liveMeasureBusyReason({ ...base, quiet: () => false }), 'processor')
})

const scheduleHarness = ({ idle = () => true, outcome = { benchmark: { encoder: 'vaapi', estimated: 1, speed: 1.4 } } } = {}) => {
  const clock = fakeClock()
  const calls = []
  const measured = []
  let repeated = null
  const liveStreams = {
    measure: async (options) => {
      calls.push({ at: clock.now(), ...options })
      return typeof outcome === 'function' ? outcome() : outcome
    },
  }
  const schedule = startLiveMeasureSchedule({
    liveStreams,
    busyReason: async () => (idle(clock.now()) ? null : 'guide'),
    onMeasured: (benchmark) => measured.push(benchmark),
    log: quietLog,
    ...clock,
    ...BOUNDS,
    repeat: (run) => {
      repeated = run
      return () => { repeated = null }
    },
  })
  return { schedule, clock, calls, measured, repeated: () => repeated }
}

test('startLiveMeasureSchedule: measures best of two once startup settles', async () => {
  const h = scheduleHarness({ idle: (nowMs) => nowMs >= 4 * 60_000 })
  await h.schedule.first
  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0].runs, 2)
  assert.ok(h.calls[0].at >= 4 * 60_000 + BOUNDS.settleMs)
  assert.equal(h.measured.length, 1)
})

test('startLiveMeasureSchedule: measures anyway after the bound', async () => {
  const h = scheduleHarness({ idle: () => false })
  await h.schedule.first
  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0].at, BOUNDS.giveUpMs)
})

test('startLiveMeasureSchedule: the daily check skips while busy and runs once quiet', async () => {
  let busy = false
  const h = scheduleHarness({ idle: () => !busy })
  await h.schedule.first
  assert.deepEqual(await h.repeated()(), { skipped: 'not due' })
  await h.clock.sleep(24 * 3_600_000)
  busy = true
  assert.deepEqual(await h.repeated()(), { skipped: 'busy' })
  assert.equal(h.calls.length, 1)
  busy = false
  await h.repeated()()
  assert.equal(h.calls.length, 2)
})

test('startLiveMeasureSchedule: a startup run skipped for a live stream retries at the next check', async () => {
  let outcome = { skipped: 'busy' }
  const h = scheduleHarness({ outcome: () => outcome })
  await h.schedule.first
  outcome = { benchmark: { encoder: 'vaapi', estimated: 1, speed: 1.4 } }
  await h.repeated()()
  assert.equal(h.calls.length, 2)
  assert.equal(h.measured.length, 1)
})

test('startLiveMeasureSchedule: stop clears the daily check', async () => {
  const h = scheduleHarness()
  h.schedule.stop()
  assert.equal(h.repeated(), null)
  assert.deepEqual(await h.schedule.first, { skipped: 'stopped' })
})
