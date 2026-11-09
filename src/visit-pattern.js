export const HOURS_PER_WEEK = 168
export const VISIT_PATTERN_SETTING = 'visit_pattern'

export const hourOfWeekOf = (ms) => {
  const at = new Date(ms)
  return at.getDay() * 24 + at.getHours()
}

export const isVisitRequest = ({ method, path }) => method === 'GET'
  && String(path).startsWith('/api/')
  && !NOT_VISIT_PATHS.some((pattern) => pattern.test(path))

export const decayedBinsOf = ({ bins, fromMs, toMs, halfLifeMs }) => {
  const factor = 0.5 ** (Math.max(0, toMs - fromMs) / halfLifeMs)
  return bins.map((weight) => weight * factor)
}

export const createVisitPattern = ({
  load = async () => null,
  save = async () => {},
  now = Date.now,
  binOf = hourOfWeekOf,
  idleMs = VISIT_IDLE_MS,
  halfLifeMs = HALF_LIFE_MS,
  threshold = WINDOW_THRESHOLD,
  leadMs = WINDOW_LEAD_MS,
  quietAfterMs = QUIET_AFTER_MS,
  dormantAfterMs = DORMANT_AFTER_MS,
  log = console.warn,
} = {}) => {
  let state = emptyState()
  let lastRequestAt = null
  let loading = null

  const ready = () => {
    loading ??= Promise.resolve()
      .then(load)
      .then((saved) => { state = stateFrom(saved) })
      .catch((err) => log(`[visits] could not load the visit pattern: ${err.message}`))
    return loading
  }

  const noteRequest = ({ method, path }) => {
    if (!isVisitRequest({ method, path })) return false
    const at = now()
    const isVisit = lastRequestAt === null || at - lastRequestAt >= idleMs
    lastRequestAt = at
    if (isVisit) ready().then(() => recordVisit(at))
    return isVisit
  }

  const recordVisit = (at) => {
    const bins = decayedBinsOf({ bins: state.bins, fromMs: state.decayedAt ?? at, toMs: at, halfLifeMs })
    bins[binOf(at)] += 1
    state = { bins, decayedAt: at, lastVisitAt: at, visits: state.visits + 1 }
    return Promise.resolve()
      .then(() => save(JSON.stringify(state)))
      .catch((err) => log(`[visits] could not save the visit pattern: ${err.message}`))
  }

  const weightsAt = (at) => decayedBinsOf({ bins: state.bins, fromMs: state.decayedAt ?? at, toMs: at, halfLifeMs })

  const nextWindowAt = (at = now()) => {
    const weights = weightsAt(at)
    const hourStart = startOfHourOf(at)
    for (let offset = 0; offset <= HOURS_PER_WEEK; offset += 1) {
      const startMs = hourStart + offset * HOUR_MS
      const warmAt = startMs - leadMs
      if (warmAt > at && weights[binOf(startMs)] >= threshold) return warmAt
    }
    return null
  }

  const modeAt = (at = now()) => {
    if (state.lastVisitAt === null) return 'active'
    const idle = at - state.lastVisitAt
    if (idle >= dormantAfterMs) return 'dormant'
    return idle >= quietAfterMs ? 'quiet' : 'active'
  }

  const snapshot = (at = now()) => ({ mode: modeAt(at), lastVisitAt: state.lastVisitAt, visits: state.visits, nextWindowAt: nextWindowAt(at) })

  return { ready, noteRequest, nextWindowAt, modeAt, snapshot }
}

const emptyState = () => ({ bins: Array(HOURS_PER_WEEK).fill(0), decayedAt: null, lastVisitAt: null, visits: 0 })

const stateFrom = (text) => {
  const saved = typeof text === 'string' ? safeJson(text) : text
  const bins = Array.isArray(saved?.bins) && saved.bins.length === HOURS_PER_WEEK && saved.bins.every(Number.isFinite) ? saved.bins : null
  if (!bins) return emptyState()
  return {
    bins,
    decayedAt: Number.isFinite(saved.decayedAt) ? saved.decayedAt : null,
    lastVisitAt: Number.isFinite(saved.lastVisitAt) ? saved.lastVisitAt : null,
    visits: Number.isFinite(saved.visits) ? saved.visits : 0,
  }
}

const safeJson = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const startOfHourOf = (ms) => {
  const at = new Date(ms)
  at.setMinutes(0, 0, 0)
  return at.getTime()
}

const NOT_VISIT_PATHS = [
  /image/,
  /\/logo\//,
  /\/art(-pool)?(\/|$)/,
  /stream/,
  /^\/api\/health/,
  /^\/api\/doctor/,
  /^\/api\/build/,
  /^\/api\/version/,
]
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const VISIT_IDLE_MS = 20 * 60 * 1000
const HALF_LIFE_MS = 14 * DAY_MS
const WINDOW_THRESHOLD = 0.5
const WINDOW_LEAD_MS = 45 * 60 * 1000
const QUIET_AFTER_MS = 3 * DAY_MS
const DORMANT_AFTER_MS = 14 * DAY_MS
