import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  isMeasureDue,
  liveMeasureBusyReason,
  createProcessCpuMeter,
  processorQuiet,
  startLiveMeasureSchedule,
  systemQuiet,
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

test('isMeasureDue: due with no run this start, then from the due time', () => {
  assert.equal(isMeasureDue({ dueAt: null, nowMs: 5 }), true)
  assert.equal(isMeasureDue({ dueAt: 24 * 3_600_000, nowMs: 23 * 3_600_000 }), false)
  assert.equal(isMeasureDue({ dueAt: 24 * 3_600_000, nowMs: 24 * 3_600_000 }), true)
})

test('systemQuiet: blocks only when the one-minute load per processor reaches the limit', () => {
  assert.equal(systemQuiet({ loadavg: () => [1.1, 1.49, 1.58], cpuCount: () => 2 }), true)
  assert.equal(systemQuiet({ loadavg: () => [1.9, 0, 0], cpuCount: () => 2 }), true)
  assert.equal(systemQuiet({ loadavg: () => [2, 0, 0], cpuCount: () => 2 }), false)
  assert.equal(systemQuiet({ loadavg: () => [0.5, 0, 0], cpuCount: () => 0 }), true)
  assert.equal(systemQuiet({ loadavg: () => [1.1, 0, 0], cpuCount: () => 2, limit: 0.5 }), false)
})

test('createProcessCpuMeter: measures processor time against wall time over the last minute', () => {
  let nowMs = 0
  let cpuMicros = 0
  const meter = createProcessCpuMeter({ cpuUsage: () => ({ user: cpuMicros, system: 0 }), now: () => nowMs })
  nowMs = 30_000
  cpuMicros = 15_000_000
  assert.equal(meter(), 0.5)
  nowMs = 60_000
  assert.equal(meter(), 0.25)
  nowMs = 90_000
  assert.equal(meter(), 0)
  nowMs = 10 * 60_000
  cpuMicros = 15_000_000 + 54_000_000
  assert.equal(meter(), 54_000 / (10 * 60_000 - 90_000))
})

test('createProcessCpuMeter: a clock that steps back reads as busy, never as quiet', () => {
  let nowMs = 100_000
  const meter = createProcessCpuMeter({ cpuUsage: () => ({ user: 0, system: 0 }), now: () => nowMs })
  nowMs = 50_000
  assert.equal(meter(), Infinity)
  nowMs = 80_000
  assert.equal(meter(), 0)
})

test('processorQuiet: Freetvarr processor use first, then system load, each with its own limit', () => {
  const busyOwn = processorQuiet({ processCpuShare: () => 0.2, systemIsQuiet: () => true })
  assert.equal(busyOwn, 'freetvarr processor use')
  assert.equal(processorQuiet({ processCpuShare: () => 0.1, systemIsQuiet: () => true }), null)
  assert.equal(processorQuiet({ processCpuShare: () => 0.1, systemIsQuiet: () => false }), 'system load')
  assert.equal(processorQuiet({ processCpuShare: () => 0.1, systemIsQuiet: () => true, limit: 0.05 }), 'freetvarr processor use')
})

test('liveMeasureBusyReason: names streams, running jobs, recordings, then the processor', async () => {
  const base = {
    streamsBusy: () => false,
    runningJobs: () => [],
    recordingNow: async () => ({ active: [], finishing: [] }),
    quiet: () => null,
  }
  assert.equal(await liveMeasureBusyReason(base), null)
  assert.equal(await liveMeasureBusyReason({ ...base, streamsBusy: () => true }), 'playback or ad scan')
  assert.equal(await liveMeasureBusyReason({ ...base, runningJobs: () => ['health', 'guide', 'artwork'] }), 'guide')
  assert.equal(await liveMeasureBusyReason({ ...base, runningJobs: () => ['health', 'hero', 'plex-watch', 'ratings'] }), null)
  assert.equal(await liveMeasureBusyReason({ ...base, recordingNow: async () => ({ active: [{}] }) }), 'recording')
  assert.equal(await liveMeasureBusyReason({ ...base, recordingNow: async () => ({ finishing: [{}] }) }), 'recording')
  assert.equal(await liveMeasureBusyReason({ ...base, recordingNow: async () => { throw new Error('down') } }), null)
  assert.equal(await liveMeasureBusyReason({ ...base, quiet: () => 'system load' }), 'system load')
})

const fakeLiveStreams = ({ clock, outcome }) => {
  const calls = []
  const listeners = new Set()
  const announce = (benchmark) => listeners.forEach((listener) => listener(benchmark))
  return {
    calls,
    announce,
    onMeasured: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    measure: async (options) => {
      calls.push({ at: clock.now(), ...options })
      const result = typeof outcome === 'function' ? outcome() : outcome
      if (result instanceof Error) throw result
      if (result.benchmark) announce(result.benchmark)
      return result
    },
  }
}

const scheduleHarness = ({ idle = () => true, outcome = { benchmark: { encoder: 'vaapi', estimated: 1, speed: 1.4 } }, runAgainBusyReason } = {}) => {
  const clock = fakeClock()
  const measured = []
  let repeated = null
  const liveStreams = fakeLiveStreams({ clock, outcome })
  const calls = liveStreams.calls
  const schedule = startLiveMeasureSchedule({
    liveStreams,
    runAgainBusyReason,
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
  return { schedule, clock, calls, measured, liveStreams, repeated: () => repeated }
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

test('startLiveMeasureSchedule: the second run checks recordings and jobs but not the processor', async () => {
  let busy = null
  const h = scheduleHarness({ runAgainBusyReason: async () => busy })
  await h.schedule.first
  assert.equal(await h.calls[0].stillIdle(), true)
  busy = 'recording'
  assert.equal(await h.calls[0].stillIdle(), false)
})

test('startLiveMeasureSchedule: a failed run retries after an hour, not a day', async () => {
  let outcome = new Error('ffmpeg exited (1).')
  const h = scheduleHarness({ outcome: () => outcome })
  assert.deepEqual(await h.schedule.first, { failed: 'ffmpeg exited (1).' })
  await h.clock.sleep(59 * 60_000)
  assert.deepEqual(await h.repeated()(), { skipped: 'not due' })
  await h.clock.sleep(60_000)
  outcome = { benchmark: { encoder: 'vaapi', estimated: 1, speed: 1.4 } }
  await h.repeated()()
  assert.equal(h.calls.length, 2)
  assert.equal(h.measured.length, 1)
})

test('startLiveMeasureSchedule: a Measure again run resets the daily timer and refreshes Health', async () => {
  const h = scheduleHarness()
  await h.schedule.first
  await h.clock.sleep(20 * 3_600_000)
  h.liveStreams.announce({ encoder: 'vaapi', estimated: 2, speed: 1.6 })
  assert.equal(h.measured.length, 2)
  await h.clock.sleep(5 * 3_600_000)
  assert.deepEqual(await h.repeated()(), { skipped: 'not due' })
})
