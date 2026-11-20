import os from 'os'

import { describeBenchmark } from './live-benchmark.js'

export const MEASURE_RUNS = 2
export const IDLE_FIRST_DELAY_MS = 60_000
export const IDLE_POLL_MS = 30_000
export const IDLE_SETTLE_MS = 3 * 60_000
export const IDLE_GIVE_UP_MS = 15 * 60_000
export const REMEASURE_CHECK_MS = 10 * 60_000
export const REMEASURE_AFTER_MS = 24 * 60 * 60_000
export const QUIET_LOAD_PER_CPU = 0.6
export const HEAVY_JOB_KINDS = ['sync', 'import', 'ads', 'guide', 'guide-pictures', 'guide-merge', 'for-you', 'artwork', 'focus', 'reclassify', 'prune']

export const startLiveMeasureSchedule = ({
  liveStreams,
  busyReason,
  onMeasured = () => {},
  log = console,
  sleep = sleepFor,
  now = Date.now,
  repeat = repeatEvery,
  firstDelayMs = IDLE_FIRST_DELAY_MS,
  pollMs = IDLE_POLL_MS,
  settleMs = IDLE_SETTLE_MS,
  giveUpMs = IDLE_GIVE_UP_MS,
  checkEveryMs = REMEASURE_CHECK_MS,
  remeasureAfterMs = REMEASURE_AFTER_MS,
}) => {
  const state = { stopped: false, firstDone: false, lastRunAt: null, lastBusy: null, waitLogged: false }
  const idleNow = async () => {
    state.lastBusy = await Promise.resolve().then(busyReason).catch((err) => `error: ${err.message}`)
    return state.lastBusy == null
  }

  const measure = async () => {
    try {
      const outcome = await liveStreams.measure({ runs: MEASURE_RUNS })
      if (outcome.skipped) return outcome
      state.lastRunAt = now()
      state.waitLogged = false
      log.log(`[live] ${describeBenchmark(outcome.benchmark)}`)
      onMeasured(outcome.benchmark)
      return outcome
    } catch (err) {
      state.lastRunAt = now()
      log.warn(`[live] stream capacity check failed: ${err.message}`)
      return { failed: err.message }
    }
  }

  const first = waitForIdle({ isIdle: idleNow, sleep, now, firstDelayMs, pollMs, settleMs, giveUpMs })
    .then(({ gaveUp }) => {
      if (state.stopped) return { skipped: 'stopped' }
      if (gaveUp) log.warn(`[live] measuring stream capacity after ${Math.round(giveUpMs / 60_000)} minutes; still busy (${state.lastBusy})`)
      return measure()
    })
    .finally(() => { state.firstDone = true })

  const recheck = async () => {
    if (state.stopped || !state.firstDone) return { skipped: 'waiting' }
    if (!isMeasureDue({ lastRunAt: state.lastRunAt, nowMs: now(), afterMs: remeasureAfterMs })) return { skipped: 'not due' }
    if (!(await idleNow())) {
      if (!state.waitLogged) log.log(`[live] stream capacity check due; waiting (${state.lastBusy})`)
      state.waitLogged = true
      return { skipped: 'busy' }
    }
    return measure()
  }

  const stopRepeat = repeat(recheck, checkEveryMs)

  return {
    first,
    recheck,
    stop: () => {
      state.stopped = true
      stopRepeat()
    },
  }
}

export const waitForIdle = async ({ isIdle, sleep, now, firstDelayMs, pollMs, settleMs, giveUpMs }) => {
  const startedAt = now()
  await sleep(firstDelayMs)
  let idleSince = null
  while (now() - startedAt < giveUpMs) {
    idleSince = (await isIdle()) ? (idleSince ?? now()) : null
    if (idleSince != null && now() - idleSince >= settleMs) return { gaveUp: false }
    await sleep(pollMs)
  }
  return { gaveUp: true }
}

export const isMeasureDue = ({ lastRunAt, nowMs, afterMs = REMEASURE_AFTER_MS }) =>
  lastRunAt == null || nowMs - lastRunAt >= afterMs

export const processorQuiet = ({
  loadavg = os.loadavg,
  cpuCount = () => os.cpus().length,
  limit = QUIET_LOAD_PER_CPU,
} = {}) => loadavg()[0] / Math.max(1, cpuCount()) < limit

export const liveMeasureBusyReason = async ({ streamsBusy, runningJobs, recordingNow, quiet }) => {
  if (streamsBusy()) return 'playback or ad scan'
  const job = runningJobs().find((kind) => HEAVY_JOB_KINDS.includes(kind))
  if (job) return job
  const { active = [], finishing = [] } = await recordingNow().catch(() => ({}))
  if (active.length + finishing.length) return 'recording'
  return quiet() ? null : 'processor'
}

const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms).unref())

const repeatEvery = (run, ms) => {
  const timer = setInterval(() => { run().catch(() => {}) }, ms)
  timer.unref()
  return () => clearInterval(timer)
}
