import { AsyncLocalStorage } from 'node:async_hooks'

export const FINISHED_KEPT_MS = 24 * 60 * 60 * 1000
export const FAILED_KEPT_MS = 7 * 24 * 60 * 60 * 1000
export const FINISHED_RING_SIZE = 200
export const LOG_LINES_KEPT = 100
export const ITEMS_KEPT = 200

export const JOB_KINDS = {
  sync: { title: 'Sync' },
  import: { title: 'Import' },
  ads: { title: 'Ad removal' },
  guide: { title: 'TV guide refresh', quiet: true },
  history: { title: 'Viewing history upkeep', quiet: true },
  'for-you': { title: 'For you rebuild', quiet: true },
  hero: { title: 'Home hero rebuild', quiet: true },
  focus: { title: 'Picture focus', quiet: true },
  ratings: { title: 'Ratings warm-up', quiet: true },
  prune: { title: 'Cache prune' },
  health: { title: 'Health checks' },
  reclassify: { title: 'Library folders' },
  'plex-watch': { title: 'Plex watched sync', quiet: true },
}

export const createActivity = ({
  now = Date.now,
  store = null,
  finishedKeptMs = FINISHED_KEPT_MS,
  failedKeptMs = FAILED_KEPT_MS,
  ringSize = FINISHED_RING_SIZE,
} = {}) => {
  const context = new AsyncLocalStorage()
  const running = new Map()
  const finished = []
  const plans = new Map()
  const listeners = new Set()
  let counter = 0
  let jobStore = store
  let storedFailures = []

  const notify = (run) => {
    for (const listener of listeners) {
      try {
        listener(run)
      } catch {}
    }
  }

  const begin = ({ kind, title = null, trigger = null, total = null, unit = null, detail = null, ref = null }) => {
    counter += 1
    const parent = context.getStore() ?? null
    const run = {
      id: `${kind}-${now().toString(36)}-${counter}`,
      kind,
      title: title || JOB_KINDS[kind]?.title || kind,
      state: 'running',
      trigger: trigger ?? parent?.trigger ?? null,
      parentId: parent?.id ?? null,
      ref,
      detail,
      outcome: null,
      tone: null,
      error: null,
      progress: total ? { done: 0, total, unit } : null,
      percent: null,
      etaSeconds: null,
      startedAt: now(),
      finishedAt: null,
      steps: [],
      facts: [],
      items: [],
      log: [],
    }
    running.set(run.id, run)
    notify(run)
    return handleFor(run)
  }

  const handleFor = (run) => {
    const touch = () => notify(run)
    const handle = {
      run,
      step: (label) => {
        const at = now()
        const current = run.steps.at(-1)
        if (current?.label === label && current.state === 'running') return handle
        closeStep({ step: current, at, state: 'done' })
        run.steps.push({ label, state: 'running', startedAt: at, ms: null })
        run.percent = null
        run.etaSeconds = null
        touch()
        return handle
      },
      update: ({ percent, etaSeconds, detail, step } = {}) => {
        if (step) handle.step(step)
        if (percent !== undefined) run.percent = percent == null ? null : clampPercent(percent)
        if (etaSeconds !== undefined) run.etaSeconds = etaSeconds == null ? null : Math.round(etaSeconds)
        if (detail !== undefined) run.detail = detail
        touch()
        return handle
      },
      total: (total, unit = run.progress?.unit ?? null) => {
        run.progress = { done: run.progress?.done ?? 0, total, unit }
        touch()
        return handle
      },
      advance: (count = 1) => {
        if (!run.progress) run.progress = { done: 0, total: null, unit: null }
        run.progress.done += count
        touch()
        return handle
      },
      fact: (label, value) => {
        if (value == null || value === '') return handle
        const existing = run.facts.find((fact) => fact.label === label)
        if (existing) existing.value = String(value)
        else run.facts.push({ label, value: String(value) })
        touch()
        return handle
      },
      item: ({ label, state = 'done', detail = null }) => {
        if (run.items.length < ITEMS_KEPT) run.items.push({ label, state, detail })
        touch()
        return handle
      },
      log: (text, level = 'info') => {
        run.log.push({ at: now(), level, text: String(text) })
        if (run.log.length > LOG_LINES_KEPT) run.log.shift()
        touch()
        return handle
      },
      outcome: (text, tone = null) => {
        run.outcome = text
        run.tone = tone
        return handle
      },
      fail: (reason) => {
        run.error = errorTextOf(reason)
        return handle
      },
      finish: (state = run.error ? 'failed' : 'done') => finish({ run, state }),
    }
    return handle
  }

  const finish = ({ run, state }) => {
    if (run.state !== 'running') return run
    const at = now()
    run.state = state
    run.finishedAt = at
    closeStep({ step: run.steps.at(-1), at, state: state === 'failed' ? 'failed' : 'done' })
    run.percent = null
    run.etaSeconds = null
    running.delete(run.id)
    keepFinished(run)
    if (state === 'failed') saveFailure(run)
    notify(run)
    return run
  }

  const keepFinished = (run) => {
    const quiet = isQuiet(run.kind)
    const previous = quiet ? finished.findIndex((entry) => entry.kind === run.kind && entry.state === run.state) : -1
    if (previous >= 0) finished.splice(previous, 1)
    finished.push(run)
    if (finished.length > ringSize) finished.shift()
  }

  const saveFailure = (run) => {
    const quiet = isQuiet(run.kind)
    if (quiet) storedFailures = storedFailures.filter((entry) => entry.kind !== run.kind)
    storedFailures.push(run)
    if (!jobStore) return
    Promise.resolve()
      .then(() => jobStore.save(run, { replaceKind: quiet }))
      .catch((err) => console.warn(`[activity] could not save a failed run: ${err.message}`))
  }

  const track = (options, fn) => {
    const handle = begin(options)
    return context.run(handle.run, async () => {
      try {
        const result = await fn(handle)
        handle.finish()
        return result
      } catch (err) {
        handle.fail(err).finish('failed')
        throw err
      }
    })
  }

  const join = ({ kinds = [], ...options }, fn) => {
    const current = currentHandle()
    if (current && kinds.includes(current.run.kind)) return fn(current)
    return track(options, fn)
  }

  const currentHandle = () => {
    const run = context.getStore()
    return run && running.has(run.id) ? handleFor(run) : null
  }

  const plan = ({ kind, title = JOB_KINDS[kind]?.title || kind, every, nextAt }) => {
    plans.set(kind, { kind, title, every, nextAt })
  }

  const planEvery = ({ kind, title, every, firstDelayMs, everyMs }) => {
    const startedAt = now()
    plan({ kind, title, every, nextAt: () => nextIntervalRun({ startedAt, firstDelayMs, everyMs, nowMs: now() }) })
  }

  const upNext = () => [...plans.values()]
    .map(({ kind, title, every, nextAt }) => ({ kind, title, every, nextAt: safeCall(nextAt) }))
    .filter((entry) => Number.isFinite(entry.nextAt))
    .sort((a, b) => a.nextAt - b.nextAt)

  const recent = () => {
    const nowMs = now()
    const inMemory = finished.filter((run) => isKept({ run, nowMs, finishedKeptMs, failedKeptMs }))
    const ids = new Set(inMemory.map((run) => run.id))
    const stored = storedFailures.filter((run) => !ids.has(run.id) && isKept({ run, nowMs, finishedKeptMs, failedKeptMs }))
    storedFailures = storedFailures.filter((run) => isKept({ run, nowMs, finishedKeptMs, failedKeptMs }))
    return [...inMemory, ...stored].sort((a, b) => b.finishedAt - a.finishedAt)
  }

  const snapshot = () => ({
    running: [...running.values()].map(summaryOf),
    upNext: upNext(),
    recent: recent().map(summaryOf),
  })

  const get = (id) => {
    const run = running.get(id) ?? recent().find((entry) => entry.id === id)
    return run ? detailOf(run) : null
  }

  const useStore = async (nextStore) => {
    jobStore = nextStore
    if (!nextStore) return
    const nowMs = now()
    await nextStore.prune({ before: nowMs - failedKeptMs })
    const loaded = await nextStore.load({ since: nowMs - failedKeptMs })
    const known = new Set(storedFailures.map((run) => run.id))
    storedFailures = [...loaded.filter((run) => !known.has(run.id)), ...storedFailures]
  }

  const subscribe = (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  return {
    begin,
    track,
    join,
    current: currentHandle,
    plan,
    planEvery,
    snapshot,
    get,
    useStore,
    subscribe,
    runningCount: () => running.size,
  }
}

export const nextIntervalRun = ({ startedAt, firstDelayMs, everyMs, nowMs }) => {
  const first = startedAt + firstDelayMs
  if (nowMs <= first) return first
  const repeatsFrom = startedAt
  const passed = Math.floor((nowMs - repeatsFrom) / everyMs) + 1
  return repeatsFrom + passed * everyMs
}

export const isKept = ({ run, nowMs, finishedKeptMs = FINISHED_KEPT_MS, failedKeptMs = FAILED_KEPT_MS }) =>
  nowMs - run.finishedAt <= (run.state === 'failed' ? failedKeptMs : finishedKeptMs)

export const summaryOf = (run) => ({
  id: run.id,
  kind: run.kind,
  title: run.title,
  state: run.state,
  trigger: run.trigger,
  parentId: run.parentId,
  ref: run.ref,
  detail: run.detail,
  step: run.state === 'running' ? run.steps.at(-1)?.label ?? null : null,
  stepIndex: run.steps.length,
  outcome: run.outcome,
  tone: run.tone ?? null,
  error: run.error,
  progress: run.progress ? { ...run.progress } : null,
  percent: run.percent ?? percentOf(run.progress),
  etaSeconds: run.etaSeconds,
  startedAt: run.startedAt,
  finishedAt: run.finishedAt,
})

export const detailOf = (run) => ({
  ...summaryOf(run),
  steps: run.steps.map((step) => ({ ...step })),
  facts: run.facts.map((fact) => ({ ...fact })),
  items: run.items.map((item) => ({ ...item })),
  log: run.log.map((line) => ({ ...line })),
})

const isQuiet = (kind) => Boolean(JOB_KINDS[kind]?.quiet)

const percentOf = (progress) => {
  if (!progress?.total) return null
  return clampPercent((progress.done / progress.total) * 100)
}

const clampPercent = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)))

const closeStep = ({ step, at, state }) => {
  if (!step || step.state !== 'running') return
  step.state = state
  step.ms = at - step.startedAt
}

const errorTextOf = (reason) => {
  if (reason == null) return 'Failed'
  return String(reason.message ?? reason).split('\n')[0].slice(0, 300)
}

const safeCall = (fn) => {
  try {
    return fn()
  } catch {
    return null
  }
}

export const activity = createActivity()
export const trackJob = activity.track
export const joinJob = activity.join
export const currentJob = activity.current
