import { monitorEventLoopDelay, performance, PerformanceObserver, constants } from 'node:perf_hooks'

import { trackJob } from './activity.js'

export const STALL_THRESHOLD_MS = 100
export const CHECK_EVERY_MS = 500
export const LOG_EVERY_MS = 10_000
export const SLICE_MIN_MS = 10

export const createLoopMonitor = ({
  thresholdMs = STALL_THRESHOLD_MS,
  checkEveryMs = CHECK_EVERY_MS,
  logEveryMs = LOG_EVERY_MS,
  sliceMinMs = SLICE_MIN_MS,
  log = console.warn,
  now = () => performance.now(),
  cpuUsage = (previous) => process.cpuUsage(previous),
  setRepeat = setInterval,
  clearRepeat = clearInterval,
  observeGc = startGcObserver,
  histogram = monitorEventLoopDelay({ resolution: STATS_RESOLUTION_MS }),
  windowHistogram = monitorEventLoopDelay({ resolution: WINDOW_RESOLUTION_MS }),
  trackActivity = (job, fn) => fn(),
} = {}) => {
  const slices = []
  const jobRuns = []
  const gcPauses = []
  const active = new Map()
  const byLabel = new Map()
  const recentStalls = []
  const totals = { stalls: 0, worstMs: 0, startedAt: now() }
  const pending = { count: 0, worst: null }
  let lastLogAt = -Infinity
  let lastTickAt = now()
  let lastCpu = cpuUsage()
  let lastCheckSawDrift = false
  let timer = null
  let stopGc = () => {}

  const noteSlice = ({ label, startedAt, ms }) => {
    const stats = byLabel.get(label) ?? (byLabel.size < MAX_LABELS ? { label, runs: 0, totalMs: 0, maxMs: 0 } : null)
    if (stats) {
      stats.runs += 1
      stats.totalMs += ms
      stats.maxMs = Math.max(stats.maxMs, ms)
      byLabel.set(label, stats)
    }
    if (ms < sliceMinMs) return
    slices.push({ label, startedAt, ms })
    if (slices.length > RING_SIZE) slices.shift()
  }

  const measureSync = (label, fn) => {
    const startedAt = now()
    try {
      return fn()
    } finally {
      noteSlice({ label, startedAt, ms: now() - startedAt })
    }
  }

  const measureJob = (label, fn, job = null) => {
    const work = job ? () => trackActivity(job, fn) : fn
    const token = Symbol(label)
    const startedAt = now()
    active.set(token, label)
    const done = () => {
      active.delete(token)
      jobRuns.push({ label, startedAt, ms: now() - startedAt })
      if (jobRuns.length > RING_SIZE) jobRuns.shift()
    }
    try {
      const result = measureSync(label, work)
      if (typeof result?.finally !== 'function') {
        done()
        return result
      }
      return result.finally(done)
    } catch (err) {
      done()
      throw err
    }
  }

  const noteGc = ({ kind, startedAt, ms }) => {
    gcPauses.push({ kind, startedAt, ms })
    if (gcPauses.length > RING_SIZE) gcPauses.shift()
  }

  const check = () => {
    const at = now()
    const cpu = cpuUsage(lastCpu)
    const wallMs = at - lastTickAt
    const driftMs = wallMs - checkEveryMs
    const blockedMs = Math.max(driftMs, windowHistogram.max / 1e6 - WINDOW_RESOLUTION_MS)
    const caughtLastCheck = lastCheckSawDrift && driftMs < thresholdMs
    windowHistogram.reset()
    lastTickAt = at
    lastCpu = cpuUsage()
    lastCheckSawDrift = driftMs >= thresholdMs
    if (blockedMs >= thresholdMs && !caughtLastCheck) noteStall({ at, blockedMs, wallMs, cpu })
    flushIfDue(at)
  }

  const noteStall = ({ at, blockedMs, wallMs, cpu }) => {
    const from = at - wallMs
    const stall = {
      at: Date.now(),
      ms: Math.round(blockedMs),
      cpuMs: Math.round((cpu.user + cpu.system) / 1000),
      windowMs: Math.round(wallMs),
      jobs: overlapping({ entries: slices, from, to: at }),
      gc: overlapping({ entries: gcPauses, from, to: at }).filter((pause) => pause.ms >= GC_LISTED_MS),
      during: [...new Set([
        ...overlapping({ entries: jobRuns, from, to: at }).map((run) => run.label),
        ...active.values(),
      ])],
    }
    totals.stalls += 1
    totals.worstMs = Math.max(totals.worstMs, stall.ms)
    recentStalls.push(stall)
    if (recentStalls.length > STALLS_KEPT) recentStalls.shift()
    pending.count += 1
    if (!pending.worst || stall.ms > pending.worst.ms) pending.worst = stall
  }

  const flushIfDue = (at) => {
    if (!pending.count || at - lastLogAt < logEveryMs) return
    log(stallLineOf({ stall: pending.worst, count: pending.count, total: totals.stalls }))
    lastLogAt = at
    pending.count = 0
    pending.worst = null
  }

  const start = () => {
    if (timer) return stop
    histogram.enable()
    windowHistogram.enable()
    lastTickAt = now()
    lastCpu = cpuUsage()
    timer = setRepeat(check, checkEveryMs)
    timer?.unref?.()
    stopGc = observeGc(noteGc)
    return stop
  }

  const stop = () => {
    if (timer) clearRepeat(timer)
    timer = null
    histogram.disable()
    windowHistogram.disable()
    stopGc()
  }

  const stats = () => ({
    thresholdMs,
    uptimeSeconds: Math.round((now() - totals.startedAt) / 1000),
    stalls: totals.stalls,
    worstStallMs: totals.worstMs,
    delayMs: delayStatsOf(histogram),
    active: [...new Set(active.values())],
    recentStalls: [...recentStalls].reverse(),
    jobs: [...byLabel.values()]
      .map((job) => ({ ...job, totalMs: Math.round(job.totalMs), maxMs: Math.round(job.maxMs) }))
      .sort((a, b) => b.maxMs - a.maxMs),
  })

  const queryStarts = new Map()

  const trackQueries = (knex) => {
    knex.on('query', (query) => {
      if (queryStarts.size < MAX_OPEN_QUERIES) queryStarts.set(query.__knexQueryUid, now())
    })
    const finish = (_, query) => {
      const startedAt = queryStarts.get(query.__knexQueryUid)
      if (startedAt === undefined) return
      queryStarts.delete(query.__knexQueryUid)
      noteSlice({ label: queryLabelOf(query.sql), startedAt, ms: now() - startedAt })
    }
    knex.on('query-response', finish)
    knex.on('query-error', finish)
    return knex
  }

  return { start, stop, check, measureSync, measureJob, trackQueries, noteGc, stats }
}

export const stallLineOf = ({ stall, count, total }) => {
  const parts = [
    `${LOG_PREFIX} stall ${stall.ms} ms`,
    `cpu ${stall.cpuMs} ms of ${stall.windowMs} ms`,
    `jobs ${listOf(stall.jobs)}`,
    `gc ${listOf(stall.gc.map((pause) => ({ label: pause.kind, ms: pause.ms })))}`,
    `during ${stall.during.length ? stall.during.join(',') : 'none'}`,
    `${count} in window, ${total} total`,
  ]
  return parts.join(' | ')
}

export const LOG_PREFIX = '[loop]'
export const LOOP_STATS_PATH = '/health/loop'

export const queryLabelOf = (sql) => `sql:${String(sql ?? '').replace(/\s+/g, ' ').slice(0, QUERY_LABEL_LENGTH)}`

export const requestLabelOf = ({ method, path }) =>
  `${method} ${path.split('/').slice(0, REQUEST_LABEL_SEGMENTS + 1).join('/')}`

export const trackRequests = ({ monitor = loopMonitor, skip = () => false } = {}) => (req, res, next) => {
  if (skip(req)) return next()
  monitor.measureJob(requestLabelOf({ method: req.method, path: req.baseUrl + req.path }), () =>
    new Promise((resolve) => {
      res.once('close', resolve)
      next()
    }))
}

const overlapping = ({ entries, from, to }) => entries
  .filter((entry) => entry.startedAt + entry.ms >= from && entry.startedAt <= to)
  .map(({ label, kind, ms }) => ({ ...(label ? { label } : { kind }), ms: Math.round(ms) }))

const listOf = (entries) => {
  if (!entries.length) return 'none'
  return [...entries]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, LISTED_ENTRIES)
    .map((entry) => `${entry.label}=${entry.ms}ms`)
    .join(',')
}

const delayStatsOf = (histogram) => {
  const ms = (ns) => Math.max(0, Math.round((ns / 1e6 - STATS_RESOLUTION_MS) * 10) / 10)
  if (!histogram.count) return { p50: 0, p99: 0, max: 0, mean: 0 }
  return {
    p50: ms(histogram.percentile(50)),
    p99: ms(histogram.percentile(99)),
    max: ms(histogram.max),
    mean: ms(histogram.mean),
  }
}

const startGcObserver = (noteGc) => {
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      noteGc({ kind: gcKindOf(entry.detail?.kind), startedAt: entry.startTime, ms: entry.duration })
    }
  })
  observer.observe({ entryTypes: ['gc'] })
  return () => observer.disconnect()
}

const gcKindOf = (kind) => GC_KINDS.get(kind) ?? 'gc'

const GC_KINDS = new Map([
  [constants.NODE_PERFORMANCE_GC_MAJOR, 'major'],
  [constants.NODE_PERFORMANCE_GC_MINOR, 'minor'],
  [constants.NODE_PERFORMANCE_GC_INCREMENTAL, 'incremental'],
  [constants.NODE_PERFORMANCE_GC_WEAKCB, 'weakcb'],
])

const STATS_RESOLUTION_MS = 20
const WINDOW_RESOLUTION_MS = 10
const RING_SIZE = 64
const GC_LISTED_MS = 5
const STALLS_KEPT = 20
const LISTED_ENTRIES = 4
const REQUEST_LABEL_SEGMENTS = 3
const QUERY_LABEL_LENGTH = 60
const MAX_LABELS = 300
const MAX_OPEN_QUERIES = 1000

export const loopMonitor = createLoopMonitor({ trackActivity: trackJob })
export const measureSync = loopMonitor.measureSync
export const measureJob = loopMonitor.measureJob
export const trackQueries = loopMonitor.trackQueries
