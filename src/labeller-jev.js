import { TOPIC_NOT } from './labeller-catalogue.js'

export const JEV_MODEL = 'jev-1.13.0'
export const JEV_BASE_URL = 'https://api.typesafe.ai'
export const JEV_THRESHOLD = 0.7
export const JEV_PRICE_PER_MILLION_INPUT = 0.042

export const askJev = async ({ apiKey, input, catalogue, fetchImpl = fetch, timeoutMs = REQUEST_TIMEOUT_MS, attempts = ATTEMPTS, sleep = wait }) => {
  const body = await postWithRetries({
    fetchImpl,
    timeoutMs,
    attempts,
    sleep,
    url: `${JEV_BASE_URL}/v1/systemone`,
    apiKey,
    payload: { model: JEV_MODEL, state: jevStateOf(input), questions: jevQuestionsOf(catalogue) },
  })
  const raw = rawJevOf({ answers: body.answers, catalogue })
  if (!raw) throw labellerError({ kind: 'invalid', status: 200 })
  return {
    model: body.model ?? JEV_MODEL,
    labels: jevLabelsOf({ raw, threshold: JEV_THRESHOLD }),
    confidence: raw.format.p,
    inputTokens: Number(body.usage?.input_tokens) || 0,
  }
}

export const checkJevKey = async ({ apiKey, fetchImpl = fetch, timeoutMs = REQUEST_TIMEOUT_MS }) => {
  const result = await requestOnce({ fetchImpl, timeoutMs, url: `${JEV_BASE_URL}/v1/models`, apiKey, method: 'GET' })
  if (result.ok) return { ok: true }
  if (result.status === 401 || result.status === 403) return { ok: false, reason: 'invalid' }
  return { ok: false, reason: 'unreachable' }
}

export const jevQuestionsOf = (catalogue) => {
  const fill = (text) => text.replaceAll('{country}', catalogue.countryName)
  const criteriaOf = (list) => Object.fromEntries(list.map((item) => [item.key, `${item.title}: ${fill(item.scope)}`]))
  return {
    format: {
      type: 'choice',
      instructions: 'Which format best describes the TV programme in `state`? Scripted fiction is comedy, drama, crime-drama, soaps, or sci-fi-fantasy; a sitcom is comedy.',
      criteria: criteriaOf(catalogue.formats),
    },
    origin: {
      type: 'choice',
      instructions: 'In which country was the TV programme in `state` made? This is the production country, not the channel that shows it.',
      criteria: { ...criteriaOf(catalogue.origins), other: 'Another country, or the production country is not clear' },
    },
    sport: {
      type: 'choice',
      instructions: 'If the TV programme in `state` is sport or about sport, which sport is it?',
      criteria: criteriaOf(catalogue.sports),
    },
    ...Object.fromEntries(catalogue.topics.map((item) => [`topic_${item.key}`, {
      type: 'noul',
      instructions: `Is the TV programme in \`state\` clearly about this topic: ${item.title} (${fill(item.scope)})?`,
      criteria: {
        true: `The programme's main subject is ${item.title.toLowerCase()}`,
        false: TOPIC_NOT[item.key] ? fill(TOPIC_NOT[item.key]) : 'The topic is absent, minor, or only incidental',
      },
    }])),
  }
}

export const jevStateOf = (input) => ({
  title: input.title,
  description: input.description,
  episode_title: input.episodeTitle,
  guide_genres: input.guideGenres,
  dvb_genre: input.genreByte,
  channels: input.channels,
  country: input.country,
})

export const rawJevOf = ({ answers, catalogue }) => {
  const pick = (answer) => (answer?.type === 'choice' ? { choice: answer.choice, p: answer.probabilities?.[answer.choice] ?? 0, probabilities: answer.probabilities } : null)
  const format = pick(answers?.format)
  const origin = pick(answers?.origin)
  const sport = pick(answers?.sport)
  const topics = Object.fromEntries(catalogue.topics.map((item) => [item.key, answers?.[`topic_${item.key}`]?.noul]))
  if (!format || !origin || !sport || Object.values(topics).some((p) => typeof p !== 'number')) return null
  return { format, origin, sport, topics }
}

export const jevLabelsOf = ({ raw, threshold }) => {
  const format = raw.format.p >= threshold ? raw.format.choice : null
  const topics = Object.entries(raw.topics).filter(([, p]) => p >= threshold).sort(([, a], [, b]) => b - a).slice(0, 2).map(([key]) => key)
  const origin = raw.origin.p >= threshold && raw.origin.choice !== 'other' ? raw.origin.choice : null
  const sport = format === 'sport-format' ? raw.sport.choice : null
  return { format, topics, origin, sport }
}

export const labellerError = ({ kind, status = null, retryAfterMs = null }) => Object.assign(new Error(`Jev ${kind}${status ? ` (HTTP ${status})` : ''}`), { kind, status, retryAfterMs })

const postWithRetries = async ({ fetchImpl, timeoutMs, attempts, sleep, url, apiKey, payload }) => {
  for (let attempt = 1; ; attempt += 1) {
    const result = await requestOnce({ fetchImpl, timeoutMs, url, apiKey, method: 'POST', payload })
    if (result.ok) return result.body
    const error = errorOfResult(result)
    if (!RETRYABLE.has(error.kind) || attempt >= attempts) throw error
    await sleep(error.retryAfterMs ?? backoffMs(attempt))
  }
}

const requestOnce = async ({ fetchImpl, timeoutMs, url, apiKey, method, payload }) => {
  try {
    const response = await fetchImpl(url, {
      method,
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'user-agent': 'Freetvarr' },
      ...(payload && { body: JSON.stringify(payload) }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const text = await response.text()
    if (!response.ok) return { ok: false, status: response.status, retryAfterMs: retryAfterMsOf(response.headers?.get?.('retry-after')), detail: text.slice(0, MAX_DETAIL_CHARS) }
    if (text.length > MAX_BODY_CHARS) return { ok: false, status: 'too-large' }
    return { ok: true, body: JSON.parse(text) }
  } catch {
    return { ok: false, status: 'network' }
  }
}

const errorOfResult = ({ status, retryAfterMs, detail = '' }) => {
  if (isOutOfCredit({ status, detail })) return labellerError({ kind: 'credit', status })
  if (status === 401 || status === 403) return labellerError({ kind: 'auth', status })
  if (status === 429 || status === 529) return labellerError({ kind: 'rate', status, retryAfterMs })
  if (status === 'network') return labellerError({ kind: 'network' })
  if (typeof status === 'number' && status >= 500) return labellerError({ kind: 'server', status, retryAfterMs })
  return labellerError({ kind: 'invalid', status: typeof status === 'number' ? status : null })
}

const isOutOfCredit = ({ status, detail }) => status === 402
  || (typeof status === 'number' && status >= 400 && status < 500 && status !== 401 && CREDIT_TEXT.test(detail))

const retryAfterMsOf = (header) => {
  const seconds = Number(header)
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, MAX_RETRY_AFTER_S) * 1000 : null
}

const backoffMs = (attempt) => BASE_BACKOFF_MS * 2 ** (attempt - 1) + Math.random() * 250

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const RETRYABLE = new Set(['server', 'network'])
const REQUEST_TIMEOUT_MS = 30_000
const ATTEMPTS = 3
const BASE_BACKOFF_MS = 1000
const MAX_RETRY_AFTER_S = 60
const MAX_BODY_CHARS = 1_000_000
const MAX_DETAIL_CHARS = 2000
const CREDIT_TEXT = /credit|balance|billing|payment|insufficient funds/i
