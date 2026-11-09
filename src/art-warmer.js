import { monitorEventLoopDelay } from 'node:perf_hooks'

import { runAsBackgroundWork } from './background-work.js'

export const TOP_TIERS = ['home', 'for-you', 'recordings', 'guide-today']
export const NEXT_TIERS = ['scheduled', 'show-heroes', 'show-posters']
export const LAST_TIERS = ['guide-week', 'frames']
export const TIER_ORDER = [...TOP_TIERS, ...NEXT_TIERS, ...LAST_TIERS]
export const CHANGE_TRIGGERS = ['for-you', 'guide', 'sync', 'plex-scan']
export const VISIT_MODES = { active: 'active', quiet: 'quiet', dormant: 'dormant' }

export const runPlanOf = ({ trigger, mode }) => {
  if (trigger === 'prep') return { tiers: TIER_ORDER, offline: false }
  if (trigger === 'nightly') return { tiers: TIER_ORDER, offline: mode === VISIT_MODES.dormant }
  if (mode === VISIT_MODES.dormant) return null
  if (trigger === 'visit-window') return mode === VISIT_MODES.active ? { tiers: [...TOP_TIERS, ...NEXT_TIERS], offline: false } : null
  if (!CHANGE_TRIGGERS.includes(trigger)) return null
  return { tiers: mode === VISIT_MODES.active ? [...TOP_TIERS, ...NEXT_TIERS] : TOP_TIERS, offline: false }
}

export const mergeRunPlans = (first, second) => {
  if (!first) return second
  if (!second) return first
  const tiers = new Set([...first.tiers, ...second.tiers])
  return {
    tiers: TIER_ORDER.filter((tier) => tiers.has(tier)),
    offline: first.offline && second.offline,
    urls: first.urls && second.urls ? [...new Set([...first.urls, ...second.urls])] : first.urls ?? second.urls,
  }
}

export const withWidth = (url, width) => {
  const [path, query = ''] = String(url).split('?')
  const kept = query.split('&').filter((part) => part && !part.startsWith('w='))
  return `${path}?${[...kept, `w=${width}`].join('&')}`
}

export const pictureRequestOf = (url) => {
  const parsed = new URL(String(url), LOCAL_BASE)
  const width = Number(parsed.searchParams.get('w')) || null
  const params = Object.fromEntries(parsed.searchParams)
  if (parsed.pathname === SHOW_IMAGE_PATH) return { route: 'show', width, title: params.title ?? '', shape: params.shape ?? null, kind: params.kind ?? null }
  const programme = PROGRAMME_IMAGE_PATH.exec(parsed.pathname)
  if (programme) return { route: 'programme', width, eventId: decodeURIComponent(programme[1]) }
  return { route: 'other', width }
}

export const newItemsOf = ({ previous, urls }) => urls.filter((url) => !previous.has(url))

export const createLoopPressure = ({
  histogram = monitorEventLoopDelay({ resolution: LOOP_RESOLUTION_MS }),
  windowMs = LOOP_WINDOW_MS,
  now = Date.now,
} = {}) => {
  let windowStart = null

  const p99Ms = () => {
    if (windowStart === null) {
      histogram.enable()
      windowStart = now()
      return 0
    }
    const value = histogram.count ? Math.max(0, histogram.percentile(99) / 1e6 - LOOP_RESOLUTION_MS) : 0
    if (now() - windowStart >= windowMs) {
      histogram.reset()
      windowStart = now()
    }
    return value
  }

  const stop = () => {
    histogram.disable()
    windowStart = null
  }

  return { p99Ms, stop }
}

export const createArtWarmer = ({
  urlsFor,
  isWarm,
  warm,
  modeOf = () => VISIT_MODES.active,
  busyReason = async () => null,
  loopP99Ms = () => 0,
  cacheShare = () => 0,
  lookupBacklog = () => 0,
  framesBusy = () => false,
  track = (job, work) => work({ total: () => {}, advance: () => {}, outcome: () => {} }),
  log = console.log,
  now = Date.now,
  sleep = wait,
  debounceMs = DEBOUNCE_MS,
  maxCacheShare = MAX_CACHE_SHARE,
  maxLoopP99Ms = MAX_LOOP_P99_MS,
  maxBacklog = MAX_LOOKUP_BACKLOG,
  pollMs = PAUSE_POLL_MS,
  retryWaitMs = PENDING_RETRY_WAIT_MS,
  memoMs = MEMO_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) => {
  const memo = new Map()
  const listeners = new Set()
  let forYouUrls = new Set()
  let queued = null
  let queuedTrigger = null
  let timer = null
  let running = null
  let progress = { state: 'idle', trigger: null, done: 0, total: 0, startedAt: null, finishedAt: null, counts: null }

  const request = (trigger, { urls = null } = {}) => {
    const plan = runPlanOf({ trigger, mode: modeOf() })
    if (!plan) return false
    queued = mergeRunPlans(queued, urls ? { ...plan, tiers: [], urls } : plan)
    queuedTrigger = queuedTrigger && queuedTrigger !== trigger ? `${queuedTrigger},${trigger}` : trigger
    if (!running) schedule()
    return true
  }

  const noteForYou = (urls) => {
    const fresh = newItemsOf({ previous: forYouUrls, urls })
    forYouUrls = new Set(urls)
    return fresh.length ? request('for-you', { urls: fresh }) : false
  }

  const schedule = () => {
    if (timer) return
    timer = setTimer(() => {
      timer = null
      runQueued()
    }, debounceMs)
    timer?.unref?.()
  }

  const runQueued = () => {
    if (running || !queued) return running
    const plan = queued
    const trigger = queuedTrigger
    queued = null
    queuedTrigger = null
    running = runNow({ plan, trigger })
      .catch((err) => log(`${LOG_PREFIX} run failed: ${err.message}`))
      .finally(() => {
        running = null
        if (queued) schedule()
      })
    return running
  }

  const runNow = ({ plan, trigger }) => track({ kind: 'artwork', trigger }, async (job) => {
    const counts = { checked: 0, warm: 0, rendered: 0, pending: 0, missing: 0, failed: 0, pausedMs: 0, capped: false }
    const startedAt = now()
    setProgress({ state: 'running', trigger, done: 0, total: 0, startedAt, finishedAt: null, counts })
    const seen = new Set()
    const pending = []
    const passes = [...(plan.urls?.length ? [{ tier: 'for-you', urls: plan.urls }] : []), ...plan.tiers.map((tier) => ({ tier }))]
    for (const pass of passes) {
      const urls = (pass.urls ?? await Promise.resolve().then(() => urlsFor(pass.tier)).catch(() => [])).filter((url) => !seen.has(url))
      urls.forEach((url) => seen.add(url))
      progress.total += urls.length
      job.total(progress.total, 'pictures')
      for (const url of urls) {
        if (counts.capped) break
        await warmOne({ url, plan, counts, pending })
        progress.done += 1
        job.advance()
        notify()
      }
    }
    if (pending.length && !plan.offline && !counts.capped) await retryPending({ pending, plan, counts })
    const finishedAt = now()
    setProgress({ ...progress, state: 'done', finishedAt, counts })
    const summary = { trigger, plan, counts, ms: finishedAt - startedAt }
    log(runLineOf(summary))
    job.outcome(runSummaryOf(summary))
    return counts
  })

  const warmOne = async ({ url, plan, counts, pending, retry = false }) => {
    counts.pausedMs += await waitUntilClear({ plan })
    if (!retry) counts.checked += 1
    if (isMemoWarm(url) || await isWarmSafely(url)) {
      counts.warm += 1
      return
    }
    if (cacheShare() >= maxCacheShare) {
      counts.capped = true
      return
    }
    const outcome = await runAsBackgroundWork({ offline: plan.offline }, () => warm(url)).catch(() => FAILED)
    if (outcome?.image) {
      counts.rendered += 1
      remember(url)
    } else if (outcome?.pending) {
      if (retry) counts.pending += 1
      else pending.push(url)
    } else if (outcome === FAILED) {
      counts.failed += 1
    } else {
      counts.missing += 1
      remember(url)
    }
  }

  const retryPending = async ({ pending, plan, counts }) => {
    const deadline = now() + retryWaitMs
    while (lookupBacklog() > 0 && now() < deadline) await sleep(pollMs)
    for (const url of pending) await warmOne({ url, plan, counts, pending, retry: true })
  }

  const waitUntilClear = async ({ plan }) => {
    const startedAt = now()
    while (await pauseReasonOf({ plan })) await sleep(pollMs)
    return now() - startedAt
  }

  const pauseReasonOf = async ({ plan }) => {
    const busy = await Promise.resolve().then(busyReason).catch(() => null)
    if (busy) return busy
    if (loopP99Ms() > maxLoopP99Ms) return 'event loop'
    if (framesBusy()) return 'frame grab'
    if (!plan.offline && lookupBacklog() >= maxBacklog) return 'lookups'
    return null
  }

  const isWarmSafely = (url) => Promise.resolve().then(() => isWarm(url)).catch(() => false)

  const isMemoWarm = (url) => {
    const at = memo.get(url)
    if (at === undefined) return false
    if (now() - at < memoMs) return true
    memo.delete(url)
    return false
  }

  const remember = (url) => {
    memo.delete(url)
    memo.set(url, now())
    if (memo.size > MEMO_MAX_ENTRIES) memo.delete(memo.keys().next().value)
  }

  const setProgress = (next) => {
    progress = next
    notify()
  }

  const notify = () => {
    for (const listener of listeners) {
      try {
        listener(progress)
      } catch {}
    }
  }

  const onProgress = (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  const current = () => ({ ...progress, counts: progress.counts && { ...progress.counts } })

  const stop = () => {
    clearTimer(timer)
    timer = null
    queued = null
  }

  const idle = () => running ?? Promise.resolve()

  return { request, noteForYou, runQueued, onProgress, current, idle, stop }
}

export const runLineOf = ({ trigger, plan, counts, ms }) => `${LOG_PREFIX} ${runSummaryOf({ trigger, plan, counts, ms })}`

export const runSummaryOf = ({ trigger, plan, counts, ms }) => [
  `trigger ${trigger}`,
  `tiers ${plan.urls?.length ? 'for-you-new' : plan.tiers.join(',')}${plan.offline ? ' offline' : ''}`,
  `checked ${counts.checked}`,
  `warm ${counts.warm}`,
  `rendered ${counts.rendered}`,
  `pending ${counts.pending}`,
  `missing ${counts.missing}`,
  `failed ${counts.failed}`,
  `paused ${Math.round(counts.pausedMs / 1000)} s`,
  counts.capped ? 'cache share cap reached' : null,
  `${Math.round(ms / 1000)} s`,
].filter(Boolean).join(' · ')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export const LOG_PREFIX = '[art-warm]'
const FAILED = Symbol('failed')
const LOCAL_BASE = 'http://localhost'
const SHOW_IMAGE_PATH = '/api/epg/show-image'
const PROGRAMME_IMAGE_PATH = /^\/api\/epg\/image\/([^/]+)$/
const DEBOUNCE_MS = 30 * 1000
const MAX_CACHE_SHARE = 0.6
const MAX_LOOP_P99_MS = 50
const MAX_LOOKUP_BACKLOG = 4
const PAUSE_POLL_MS = 5 * 1000
const PENDING_RETRY_WAIT_MS = 10 * 60 * 1000
const MEMO_MS = 24 * 60 * 60 * 1000
const MEMO_MAX_ENTRIES = 20_000
const LOOP_RESOLUTION_MS = 20
const LOOP_WINDOW_MS = 10 * 1000

export const startWarmSchedule = ({
  request,
  nextWindowAt = () => null,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  nightlyHour = NIGHTLY_HOUR,
  nightlyMinute = NIGHTLY_MINUTE,
  recheckMs = WINDOW_RECHECK_MS,
}) => {
  const timers = { nightly: null, window: null }

  const arm = ({ name, delayMs, fire }) => {
    clearTimer(timers[name])
    timers[name] = setTimer(fire, Math.max(0, delayMs))
    timers[name]?.unref?.()
  }

  const armNightly = () => arm({
    name: 'nightly',
    delayMs: nextLocalTimeOf({ nowMs: now(), hour: nightlyHour, minute: nightlyMinute }) - now(),
    fire: () => {
      request('nightly')
      armNightly()
    },
  })

  const armWindow = () => {
    const at = nextWindowAt(now())
    const due = at !== null && at - now() <= recheckMs
    arm({
      name: 'window',
      delayMs: due ? at - now() : recheckMs,
      fire: () => {
        if (due) request('visit-window')
        armWindow()
      },
    })
  }

  armNightly()
  armWindow()

  return () => {
    clearTimer(timers.nightly)
    clearTimer(timers.window)
  }
}

export const nextLocalTimeOf = ({ nowMs, hour, minute }) => {
  const at = new Date(nowMs)
  at.setHours(hour, minute, 0, 0)
  if (at.getTime() <= nowMs) at.setDate(at.getDate() + 1)
  return at.getTime()
}

const NIGHTLY_HOUR = 3
const NIGHTLY_MINUTE = 30
const WINDOW_RECHECK_MS = 60 * 60 * 1000
