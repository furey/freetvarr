import { db, getSetting, setSetting } from './db.js'
import { CATEGORY_CATALOGUE_VERSION } from './for-you-category-catalogue.js'
import { LABELLER_PROMPT_VERSION } from './labeller-catalogue.js'
import { JEV_MODEL, JEV_PRICE_PER_MILLION_INPUT, askJev } from './labeller-jev.js'

export const LABELLER_KEY_SETTING = 'typesafe_api_key'
export const LABELLER_KEY_STATUS_SETTING = 'labeller_key_status'
export const LABELLER_LAST_RUN_SETTING = 'labeller_last_run'
export const LABELLER_DAY_SETTING = 'labeller_day'
export const LABELLER_PAUSE_SETTING = 'labeller_paused_until'
export const LABELLER_VERSION = `${JEV_MODEL}/catalogue-${CATEGORY_CATALOGUE_VERSION}/prompt-${LABELLER_PROMPT_VERSION}`
export const KEY_REJECTED = 'rejected'
export const NO_CREDIT = 'no-credit'

export const storedLabellerKey = async () => String((await getSetting(LABELLER_KEY_SETTING)) || '').trim() || null

export const createLabeller = ({
  ask = askJev,
  readKey = storedLabellerKey,
  store = databaseStore,
  settings = { get: getSetting, set: setSetting },
  now = Date.now,
  sleep = wait,
  concurrency = CONCURRENCY,
  dailySpendUsd = DAILY_SPEND_USD,
  maxRequestsPerDay = MAX_REQUESTS_PER_DAY,
  failureBackoffMs = FAILURE_BACKOFF_MS,
  invalidBackoffMs = INVALID_BACKOFF_MS,
  pauseMs = RATE_PAUSE_MS,
  creditRecheckMs = CREDIT_RECHECK_MS,
  maxFailuresInRow = MAX_FAILURES_IN_ROW,
} = {}) => {
  let running = null

  const label = async ({ titles = [], catalogue }) => {
    const apiKey = await readKey()
    if (!apiKey) return { skipped: 'no-key' }
    const keyStatus = await settings.get(LABELLER_KEY_STATUS_SETTING)
    if (keyStatus === KEY_REJECTED) return { skipped: 'key-rejected' }
    const paused = Number(await settings.get(LABELLER_PAUSE_SETTING)) > now()
    if (paused) return { skipped: keyStatus === NO_CREDIT ? 'no-credit' : 'paused' }
    const known = await store.settledKeys({ version: LABELLER_VERSION, nowMs: now() })
    const queue = uniqueByKey(titles).filter((title) => !known.has(title.key))
    if (!queue.length) return { asked: 0, labelled: 0, failed: 0 }
    const spend = createSpendGuard({ stored: await settings.get(LABELLER_DAY_SETTING), day: dayOf(now()), dailySpendUsd, maxRequestsPerDay })
    const pace = createPace({ now, max: concurrency })
    const outcome = { asked: 0, labelled: 0, failed: 0, rateLimited: 0, spentUsd: 0, stopped: null, error: null }
    let failuresInRow = 0
    let active = 0

    const settle = async ({ title, answer }) => {
      const labelled = hasLabels(answer.labels)
      await store.write({ key: title.key, version: LABELLER_VERSION, status: labelled ? 'ok' : 'none', labels: answer.labels, confidence: answer.confidence, fetchedAt: now(), retryAfter: null })
      if (labelled) outcome.labelled += 1
    }

    const fail = async ({ title, error }) => {
      failuresInRow += 1
      outcome.failed += 1
      outcome.error = errorTextOf(error)
      if (error.kind === 'auth') {
        outcome.stopped = 'auth'
        await settings.set(LABELLER_KEY_STATUS_SETTING, KEY_REJECTED)
        return
      }
      if (error.kind === 'credit') {
        outcome.stopped = 'credit'
        await settings.set(LABELLER_KEY_STATUS_SETTING, NO_CREDIT)
        await settings.set(LABELLER_PAUSE_SETTING, String(now() + creditRecheckMs))
        return
      }
      const backoff = error.kind === 'invalid' ? invalidBackoffMs : failureBackoffMs
      await store.write({ key: title.key, version: LABELLER_VERSION, status: 'failed', labels: {}, confidence: null, fetchedAt: now(), retryAfter: now() + backoff })
      if (failuresInRow >= maxFailuresInRow) outcome.stopped = 'failing'
    }

    const slowDown = async ({ title, error }) => {
      outcome.rateLimited += 1
      queue.unshift(title)
      if (pace.noteRate(error.retryAfterMs) !== 'pause') return
      outcome.stopped = 'rate'
      outcome.error = errorTextOf(error)
      await settings.set(LABELLER_PAUSE_SETTING, String(now() + pauseMs))
    }

    const askOne = async (title) => {
      outcome.asked += 1
      try {
        const answer = await ask({ apiKey, input: title.input, catalogue })
        const usd = spend.add(answer.inputTokens)
        outcome.spentUsd += usd
        pace.noteSuccess()
        failuresInRow = 0
        await settle({ title, answer })
      } catch (error) {
        if (error.kind === 'invalid') outcome.spentUsd += spend.add(null)
        else spend.add(0)
        if (error.kind === 'rate') return slowDown({ title, error })
        await fail({ title, error })
      }
    }

    const worker = async () => {
      while (!outcome.stopped) {
        const waitMs = pace.waitMs(active)
        if (waitMs) {
          if (!queue.length && !active) return
          await sleep(waitMs)
          continue
        }
        if (!queue.length) {
          if (!active) return
          await sleep(POLL_MS)
          continue
        }
        if (!spend.allows(active)) {
          outcome.stopped = 'budget'
          outcome.error = BUDGET_TEXT
          return
        }
        const title = queue.shift()
        active += 1
        await askOne(title).finally(() => { active -= 1 })
      }
    }

    if (keyStatus === NO_CREDIT) {
      const probe = queue.shift()
      active += 1
      await askOne(probe).finally(() => { active -= 1 })
      if (!outcome.stopped && outcome.failed === 0) await settings.set(LABELLER_KEY_STATUS_SETTING, '')
    }
    await Promise.all(Array.from({ length: concurrency }, worker))
    await settings.set(LABELLER_DAY_SETTING, JSON.stringify(spend.state()))
    await settings.set(LABELLER_LAST_RUN_SETTING, JSON.stringify({ at: now(), ...outcome }))
    return outcome
  }

  const run = (options) => {
    running ??= label(options).finally(() => { running = null })
    return running
  }

  return { run, isRunning: () => Boolean(running) }
}

export const createSpendGuard = ({ stored, day, dailySpendUsd, maxRequestsPerDay, estimatedTokens = ESTIMATED_INPUT_TOKENS }) => {
  const previous = parseJson(stored)
  const today = previous?.day === day ? previous : null
  let usd = Number(today?.usd) || 0
  let requests = Number(today?.requests) || 0
  let measured = { tokens: Number(today?.tokens) || 0, answers: Number(today?.answers) || 0 }
  const usdOf = (tokens) => (tokens * JEV_PRICE_PER_MILLION_INPUT) / 1e6
  const perRequestTokens = () => (measured.answers ? Math.max(estimatedTokens, measured.tokens / measured.answers) : estimatedTokens)
  return {
    allows: (inFlight) => requests + inFlight < maxRequestsPerDay && usd + usdOf(perRequestTokens()) * (inFlight + 1) <= dailySpendUsd,
    add: (inputTokens) => {
      requests += 1
      const tokens = inputTokens === 0 ? 0 : Number(inputTokens) || estimatedTokens
      if (Number(inputTokens) > 0) measured = { tokens: measured.tokens + tokens, answers: measured.answers + 1 }
      usd += usdOf(tokens)
      return usdOf(tokens)
    },
    state: () => ({ day, usd, requests, ...measured }),
  }
}

export const createPace = ({ now, max, minDelayMs = MIN_RATE_DELAY_MS, maxDelayMs = MAX_RATE_DELAY_MS, quietMs = QUIET_MS, burstWindowMs = BURST_WINDOW_MS, burstLimit = BURST_LIMIT }) => {
  let limit = max
  let resumeAt = 0
  let streak = 0
  let calmSince = -Infinity
  let rateTimes = []
  return {
    limit: () => limit,
    waitMs: (active) => {
      if (now() < resumeAt) return resumeAt - now()
      if (limit < max && now() - calmSince >= quietMs) {
        limit += 1
        calmSince = now()
      }
      return active >= limit ? POLL_MS : 0
    },
    noteRate: (retryAfterMs) => {
      streak += 1
      limit = Math.max(1, Math.floor(limit / 2))
      const delay = Math.min(maxDelayMs, retryAfterMs ?? minDelayMs * 2 ** (streak - 1))
      resumeAt = Math.max(resumeAt, now() + delay)
      calmSince = now()
      rateTimes = [...rateTimes.filter((at) => now() - at < burstWindowMs), now()]
      return rateTimes.length >= burstLimit ? 'pause' : 'slow'
    },
    noteSuccess: () => {
      streak = 0
    },
  }
}

export const loadLabellerLabels = async ({ readKey = storedLabellerKey, store = databaseStore } = {}) => {
  if (!(await readKey().catch(() => null))) return new Map()
  return store.labels({ version: LABELLER_VERSION })
}

export const labelledStampOf = async ({ readKey = storedLabellerKey, store = databaseStore } = {}) => {
  if (!(await readKey().catch(() => null))) return 0
  return store.labelledCount({ version: LABELLER_VERSION })
}

export const withLabellerLabels = ({ records, labels }) => {
  if (!labels.size) return records
  const merged = new Map(records)
  for (const [key, labellerLabels] of labels) {
    merged.set(key, { genreTags: [], genres: [], source: null, ...merged.get(key), labellerLabels })
  }
  return merged
}

export const labellerStatusOf = async ({ readKey = storedLabellerKey, store = databaseStore, settings = { get: getSetting } } = {}) => {
  const [apiKey, keyStatus, lastRun, labelled] = await Promise.all([
    readKey().catch(() => null),
    Promise.resolve().then(() => settings.get(LABELLER_KEY_STATUS_SETTING)).catch(() => null),
    Promise.resolve().then(() => settings.get(LABELLER_LAST_RUN_SETTING)).catch(() => null),
    store.labelledCount({ version: LABELLER_VERSION }).catch(() => 0),
  ])
  return {
    keySet: Boolean(apiKey),
    keyRejected: keyStatus === KEY_REJECTED,
    noCredit: keyStatus === NO_CREDIT,
    labelled,
    lastRun: parseJson(lastRun),
  }
}

export const resetLabellerKeyState = async ({ settings = { set: setSetting } } = {}) => {
  await settings.set(LABELLER_KEY_STATUS_SETTING, '')
  await settings.set(LABELLER_PAUSE_SETTING, '')
}

export const labellerInputOf = ({ title, programmes, channelNames, guideGenres, genreByte, country }) => {
  const described = programmes.find((programme) => String(programme.synopsis || '').trim()) ?? programmes[0]
  const episode = programmes.map((programme) => String(programme.episode_title || '').trim()).find((text) => text && text.length <= MAX_EPISODE_TITLE)
  return {
    title,
    description: String(described?.synopsis || '').trim().slice(0, MAX_DESCRIPTION) || null,
    episodeTitle: episode ?? null,
    guideGenres: [...new Set(guideGenres)].slice(0, MAX_GUIDE_GENRES),
    genreByte,
    channels: [...new Set(programmes.map((programme) => channelNames.get(String(programme.channel_id))).filter(Boolean))].slice(0, MAX_CHANNELS),
    country: String(country || '').toUpperCase() || null,
  }
}

export const hasLabels = (labels) => Boolean(labels?.format) || Boolean(labels?.topics?.length)

const uniqueByKey = (titles) => [...new Map(titles.map((title) => [title.key, title])).values()]

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const errorTextOf = (error) => {
  if (error.kind === 'auth') return 'TypeSafe did not accept the key.'
  if (error.kind === 'credit') return 'The TypeSafe account is out of credit.'
  if (error.kind === 'rate') return 'TypeSafe asked Freetvarr to slow down, so Freetvarr waits an hour.'
  if (error.kind === 'invalid') return 'TypeSafe sent an answer Freetvarr could not read.'
  return 'Freetvarr could not reach TypeSafe.'
}

const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10)

const parseJson = (text) => {
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

const databaseStore = {
  settledKeys: async ({ version, nowMs }) => new Set((await db(TABLE)
    .where({ labeller_version: version })
    .andWhere((query) => query.whereIn('status', ['ok', 'none']).orWhere('retry_after', '>', nowMs))
    .select('show_key')).map((row) => row.show_key)),
  write: ({ key, version, status, labels, confidence, fetchedAt, retryAfter }) => db(TABLE)
    .insert({ show_key: key, labeller_version: version, status, labels_json: JSON.stringify(labels ?? {}), confidence, fetched_at: fetchedAt, retry_after: retryAfter })
    .onConflict(['show_key', 'labeller_version'])
    .merge(),
  labels: async ({ version }) => new Map((await db(TABLE).where({ labeller_version: version, status: 'ok' }).select('show_key', 'labels_json').catch(() => []))
    .map((row) => [row.show_key, parseJson(row.labels_json)])
    .filter(([, labels]) => hasLabels(labels))),
  labelledCount: async ({ version }) => Number((await db(TABLE).where({ labeller_version: version, status: 'ok' }).count({ count: '*' }).first())?.count) || 0,
}

const TABLE = 'title_labels'
const CONCURRENCY = 8
const DAILY_SPEND_USD = 0.5
const MAX_REQUESTS_PER_DAY = 20_000
const ESTIMATED_INPUT_TOKENS = 4000
const MIN_RATE_DELAY_MS = 2000
const MAX_RATE_DELAY_MS = 60_000
const QUIET_MS = 60_000
const BURST_WINDOW_MS = 5 * 60 * 1000
const BURST_LIMIT = 8
const POLL_MS = 50
const BUDGET_TEXT = 'Freetvarr reached its daily spending limit for TypeSafe, and goes on tomorrow.'
const MAX_FAILURES_IN_ROW = 3
const FAILURE_BACKOFF_MS = 6 * 60 * 60 * 1000
const INVALID_BACKOFF_MS = 7 * 24 * 60 * 60 * 1000
const RATE_PAUSE_MS = 60 * 60 * 1000
const CREDIT_RECHECK_MS = 24 * 60 * 60 * 1000
const MAX_DESCRIPTION = 300
const MAX_EPISODE_TITLE = 80
const MAX_GUIDE_GENRES = 8
const MAX_CHANNELS = 4
