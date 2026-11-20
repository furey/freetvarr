import os from 'os'

import { describeBenchmark } from './live-benchmark.js'

export const MEASURE_RUNS = 2
export const IDLE_FIRST_DELAY_MS = 60_000
export const IDLE_POLL_MS = 30_000
export const IDLE_SETTLE_MS = 3 * 60_000
export const IDLE_GIVE_UP_MS = 30 * 60_000
export const REMEASURE_CHECK_MS = 10 * 60_000
export const REMEASURE_AFTER_MS = 24 * 60 * 60_000
export const RETRY_AFTER_FAILURE_MS = 60 * 60_000
export const QUIET_LOAD_PER_CPU = 1.0
export const QUIET_PROCESS_CPU_SHARE = 0.15
export const PROCESS_CPU_WINDOW_MS = 60_000
export const HEAVY_JOB_KINDS = ['sync', 'import', 'ads', 'guide', 'guide-pictures', 'guide-merge', 'for-you', 'artwork', 'focus', 'reclassify', 'prune']

export const startLiveMeasureSchedule = ({
  liveStreams,
  busyReason,
  runAgainBusyReason = busyReason,
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
  retryAfterFailureMs = RETRY_AFTER_FAILURE_MS,
}) => {
  const state = { stopped: false, firstDone: false, dueAt: null, lastBusy: null, waitLogged: false }
  const idleNow = async () => {
    state.lastBusy = await Promise.resolve().then(busyReason).catch((err) => `error: ${err.message}`)
    return state.lastBusy == null
  }

  const stopListening = liveStreams.onMeasured((benchmark) => {
    state.dueAt = now() + remeasureAfterMs
    state.waitLogged = false
    log.log(`[live] ${describeBenchmark(benchmark)}`)
    onMeasured(benchmark)
  })

  const runAgainIdle = async () => (await runAgainBusyReason()) == null

  const measure = async () => {
    try {
      return await liveStreams.measure({ runs: MEASURE_RUNS, stillIdle: runAgainIdle })
    } catch (err) {
      state.dueAt = now() + retryAfterFailureMs
      state.waitLogged = false
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
    if (!isMeasureDue({ dueAt: state.dueAt, nowMs: now() })) return { skipped: 'not due' }
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
      stopListening()
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

export const isMeasureDue = ({ dueAt, nowMs }) => dueAt == null || nowMs >= dueAt

export const systemQuiet = ({
  loadavg = os.loadavg,
  cpuCount = () => os.cpus().length,
  limit = QUIET_LOAD_PER_CPU,
} = {}) => loadavg()[0] / Math.max(1, cpuCount()) < limit

export const createProcessCpuMeter = ({
  cpuUsage = process.cpuUsage,
  now = () => performance.now(),
  windowMs = PROCESS_CPU_WINDOW_MS,
} = {}) => {
  const sampleOf = () => {
    const { user, system } = cpuUsage()
    return { cpuMs: (user + system) / 1000, atMs: now() }
  }
  let samples = [sampleOf()]
  return () => {
    const latest = sampleOf()
    const earlier = samples.filter((sample) => sample.atMs < latest.atMs)
    if (!earlier.length) {
      samples = [latest]
      return Infinity
    }
    const kept = earlier.filter((sample) => latest.atMs - sample.atMs <= windowMs)
    const base = kept[0] ?? earlier[earlier.length - 1]
    samples = [...(kept.length ? kept : [base]), latest]
    return (latest.cpuMs - base.cpuMs) / (latest.atMs - base.atMs)
  }
}

export const processorQuiet = ({
  processCpuShare,
  systemIsQuiet = systemQuiet,
  limit = QUIET_PROCESS_CPU_SHARE,
}) => {
  if (processCpuShare() >= limit) return 'freetvarr processor use'
  return systemIsQuiet() ? null : 'system load'
}

export const liveMeasureBusyReason = async ({ streamsBusy, runningJobs, recordingNow, quiet }) => {
  if (streamsBusy()) return 'playback or ad scan'
  const job = runningJobs().find((kind) => HEAVY_JOB_KINDS.includes(kind))
  if (job) return job
  const { active = [], finishing = [] } = await recordingNow().catch(() => ({}))
  if (active.length + finishing.length) return 'recording'
  return quiet()
}

const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms).unref())

const repeatEvery = (run, ms) => {
  const timer = setInterval(() => { run().catch(() => {}) }, ms)
  timer.unref()
  return () => clearInterval(timer)
}
