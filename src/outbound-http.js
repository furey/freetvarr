import axios from 'axios'

export const OUTBOUND_USER_AGENT = 'Freetvarr (https://github.com/furey/freetvarr)'

export class OutboundError extends Error {
  constructor(message, { code, host = null, status = null } = {}) {
    super(message)
    this.name = 'OutboundError'
    this.code = code
    this.host = host
    this.status = status
  }
}

export const createOutboundClient = ({
  hosts,
  request = axiosRequest,
  now = Date.now,
  sleep = wait,
  random = Math.random,
  userAgent = OUTBOUND_USER_AGENT,
  retryBaseMs = RETRY_BASE_MS,
  retryMaxMs = RETRY_MAX_MS,
} = {}) => {
  const limiters = new Map()
  const breakers = new Map()
  const isAllowedHost = (host) => Object.hasOwn(hosts, host)

  const limiterFor = (host) => {
    if (!limiters.has(host)) limiters.set(host, createHostLimiter({ ...hosts[host], now, sleep }))
    return limiters.get(host)
  }

  const breakerFor = (host) => {
    if (!breakers.has(host)) breakers.set(host, createCircuitBreaker({ ...hosts[host]?.breaker, now }))
    return breakers.get(host)
  }

  const send = async ({ url, params, headers = {}, timeoutMs, maxBytes, retries }) => {
    const target = allowedUrlOf({ url, isAllowedHost })
    const host = target.hostname
    const breaker = breakerFor(host)
    for (let attempt = 0; ; attempt += 1) {
      if (!breaker.allows()) throw new OutboundError(`${host} is backing off`, { code: 'circuit-open', host })
      const outcome = await limiterFor(host)
        .run(() => request({
          url: target.href,
          params,
          headers: { ...headers, 'User-Agent': userAgent },
          timeoutMs,
          maxBytes,
          isAllowedHost,
        }))
        .then((response) => ({ response }), (error) => ({ error }))
      if (outcome.error?.code === 'queue-full') throw new OutboundError(`${host} queue is full`, { code: 'queue-full', host })
      const verdict = responseVerdictOf({ status: outcome.response?.status, error: outcome.error })
      if (verdict === 'ok') {
        breaker.recordSuccess()
        return outcome.response
      }
      if (verdict === 'missing') {
        breaker.recordSuccess()
        return null
      }
      if (verdict === 'rejected') {
        breaker.recordFailure()
        throw new OutboundError(`${host} HTTP ${outcome.response.status}`, { code: 'rejected', host, status: outcome.response.status })
      }
      breaker.recordFailure()
      const delayMs = retryDelayMs({
        attempt,
        baseMs: retryBaseMs,
        maxMs: retryMaxMs,
        retryAfterS: retryAfterOf(outcome.response?.headers),
        random,
      })
      if (attempt >= retries || delayMs === null) {
        const status = outcome.response?.status ?? null
        throw new OutboundError(status ? `${host} HTTP ${status}` : `${host} did not answer`, { code: 'unavailable', host, status })
      }
      await sleep(delayMs)
    }
  }

  const getJson = async ({ url, params, headers = {}, timeoutMs = JSON_TIMEOUT_MS, maxBytes = JSON_MAX_BYTES, retries = JSON_RETRIES }) => {
    const response = await send({ url, params, headers: { Accept: 'application/json', ...headers }, timeoutMs, maxBytes, retries })
    if (!response) return null
    if (!isJsonContentType(contentTypeOf(response.headers))) {
      throw new OutboundError(`${hostOf(url)} sent ${contentTypeOf(response.headers) || 'no content type'}`, { code: 'bad-content', host: hostOf(url) })
    }
    try {
      return JSON.parse(response.body.toString('utf8'))
    } catch {
      throw new OutboundError(`${hostOf(url)} sent invalid JSON`, { code: 'bad-content', host: hostOf(url) })
    }
  }

  const getImage = async ({ url, timeoutMs = IMAGE_TIMEOUT_MS, maxBytes = IMAGE_MAX_BYTES, retries = IMAGE_RETRIES }) => {
    const response = await send({ url, headers: { Accept: IMAGE_ACCEPT }, timeoutMs, maxBytes, retries })
    if (!response) return null
    const contentType = contentTypeOf(response.headers)
    if (!isImageContentType(contentType) || !response.body.length) return null
    return { body: response.body, contentType }
  }

  const isAllowedUrl = (url) => {
    try {
      allowedUrlOf({ url, isAllowedHost })
      return true
    } catch {
      return false
    }
  }

  const resetHost = (host) => breakers.get(host)?.recordSuccess()

  return { getJson, getImage, isAllowedUrl, resetHost }
}

export const allowedUrlOf = ({ url, isAllowedHost }) => {
  const target = parsedUrlOf(url)
  if (!target || target.protocol !== 'https:' || target.username || target.password || target.port) {
    throw new OutboundError('Only plain https addresses are allowed', { code: 'host-not-allowed' })
  }
  if (!isAllowedHost(target.hostname)) {
    throw new OutboundError(`${target.hostname} is not on the allow-list`, { code: 'host-not-allowed', host: target.hostname })
  }
  return target
}

export const responseVerdictOf = ({ status, error }) => {
  if (error || status == null) return 'retry'
  if (status >= 200 && status < 300) return 'ok'
  if (status === 404 || status === 410) return 'missing'
  if (RETRYABLE_STATUSES.has(status)) return 'retry'
  return 'rejected'
}

export const retryDelayMs = ({ attempt, baseMs, maxMs, retryAfterS = null, random = Math.random }) => {
  if (retryAfterS !== null) {
    const askedMs = retryAfterS * 1000
    return askedMs > maxMs ? null : askedMs
  }
  const exponentialMs = Math.min(maxMs, baseMs * 2 ** attempt)
  return Math.round(exponentialMs * (0.5 + random() / 2))
}

export const retryAfterOf = (headers = {}) => {
  const raw = headers?.['retry-after']
  if (raw == null || raw === '') return null
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds
  const atMs = Date.parse(raw)
  return Number.isFinite(atMs) ? Math.max(0, Math.ceil((atMs - Date.now()) / 1000)) : null
}

export const createCircuitBreaker = ({
  failureThreshold = BREAKER_FAILURE_THRESHOLD,
  baseCooldownMs = BREAKER_BASE_COOLDOWN_MS,
  maxCooldownMs = BREAKER_MAX_COOLDOWN_MS,
  now = Date.now,
} = {}) => {
  let failures = 0
  let trips = 0
  let openUntil = 0

  const allows = () => now() >= openUntil

  const recordFailure = () => {
    failures += 1
    if (failures < failureThreshold) return
    trips += 1
    openUntil = now() + Math.min(maxCooldownMs, baseCooldownMs * 2 ** (trips - 1))
    failures = failureThreshold - 1
  }

  const recordSuccess = () => {
    failures = 0
    trips = 0
    openUntil = 0
  }

  const state = () => ({ failures, trips, openUntil })

  return { allows, recordFailure, recordSuccess, state }
}

export const createHostLimiter = ({
  concurrency = 1,
  gapMs = 0,
  maxQueue = DEFAULT_MAX_QUEUE,
  now = Date.now,
  sleep = wait,
} = {}) => {
  const queue = []
  let active = 0
  let nextStartAt = 0

  const pump = () => {
    while (active < concurrency && queue.length) {
      const { task, resolve, reject } = queue.shift()
      active += 1
      const startAt = Math.max(now(), nextStartAt)
      nextStartAt = startAt + gapMs
      Promise.resolve(sleep(Math.max(0, startAt - now())))
        .then(task)
        .then(resolve, reject)
        .finally(() => {
          active -= 1
          pump()
        })
    }
  }

  const run = (task) => {
    if (queue.length >= maxQueue) return Promise.reject(Object.assign(new Error('queue full'), { code: 'queue-full' }))
    return new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject })
      pump()
    })
  }

  const size = () => ({ active, queued: queue.length })

  return { run, size }
}

export const isImageContentType = (contentType) => ALLOWED_IMAGE_TYPES.has(contentType)

const isJsonContentType = (contentType) => /(^|[/+])json$/.test(contentType)

const contentTypeOf = (headers = {}) => String(headers?.['content-type'] || '').split(';')[0].trim().toLowerCase()

const parsedUrlOf = (url) => {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

const hostOf = (url) => parsedUrlOf(url)?.hostname || 'unknown host'

const axiosRequest = async ({ url, params, headers, timeoutMs, maxBytes, isAllowedHost }) => {
  const res = await axios.get(url, {
    params,
    headers,
    timeout: timeoutMs,
    signal: AbortSignal.timeout(timeoutMs),
    responseType: 'arraybuffer',
    maxContentLength: maxBytes,
    maxBodyLength: maxBytes,
    maxRedirects: MAX_REDIRECTS,
    beforeRedirect: (options) => {
      if (options.protocol !== 'https:' || !isAllowedHost(options.hostname)) {
        throw new Error('Redirect left the allow-list')
      }
    },
    validateStatus: () => true,
  })
  return { status: res.status, headers: res.headers, body: Buffer.from(res.data || []) }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const IMAGE_ACCEPT = 'image/webp,image/jpeg,image/png,image/gif;q=0.8'
const JSON_TIMEOUT_MS = 8000
const JSON_MAX_BYTES = 2 * 1024 * 1024
const JSON_RETRIES = 2
const IMAGE_TIMEOUT_MS = 10000
const IMAGE_MAX_BYTES = 4 * 1024 * 1024
const IMAGE_RETRIES = 1
const RETRY_BASE_MS = 500
const RETRY_MAX_MS = 8000
const MAX_REDIRECTS = 3
const DEFAULT_MAX_QUEUE = 200
const BREAKER_FAILURE_THRESHOLD = 5
const BREAKER_BASE_COOLDOWN_MS = 60 * 1000
const BREAKER_MAX_COOLDOWN_MS = 30 * 60 * 1000
