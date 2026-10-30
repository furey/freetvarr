import axios from 'axios'

import { createCircuitBreaker, retryDelayMs } from './outbound-http.js'

export const ARR_APPS = ['sonarr', 'radarr']
export const ARR_DEFAULT_PORTS = { sonarr: 8989, radarr: 7878 }
export const ARR_NAMES = { sonarr: 'Sonarr', radarr: 'Radarr' }
export const READ_TIMEOUT_MS = 8000
export const WRITE_TIMEOUT_MS = 15_000
export const MAX_BYTES = 20 * 1024 * 1024
export const READ_RETRIES = 1

export class ArrError extends Error {
  constructor(message, { app, kind = 'unreachable', status = null } = {}) {
    super(message)
    this.name = 'ArrError'
    this.app = app
    this.kind = kind
    this.status = status
  }
}

export const createArrClient = ({ app, url, apiKey, request = axiosRequest, breaker = createCircuitBreaker(), sleep = wait, random = Math.random }) => {
  const base = String(url || '').replace(/\/+$/, '')
  const name = ARR_NAMES[app] || app

  const send = async ({ method, path, params, data, timeoutMs, retries }) => {
    for (let attempt = 0; ; attempt += 1) {
      if (!breaker.allows()) throw new ArrError(`${name} is not answering, so Freetvarr is waiting before it tries again`, { app, kind: 'backing-off' })
      const outcome = await request({
        method,
        url: `${base}${path}`,
        params,
        data,
        headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
        timeoutMs,
        maxBytes: MAX_BYTES,
      }).then((response) => ({ response }), (error) => ({ error }))
      const status = outcome.response?.status
      if (status === 401) {
        breaker.recordSuccess()
        throw new ArrError(`${name} rejected the API key`, { app, kind: 'key', status })
      }
      if (status >= 200 && status < 300) {
        breaker.recordSuccess()
        return outcome.response.data
      }
      if (status === 404) {
        breaker.recordSuccess()
        throw new ArrError(`${name} has no such item`, { app, kind: 'missing', status })
      }
      if (status === 409) {
        breaker.recordSuccess()
        throw new ArrError(`${name} refused: ${messageOf(outcome.response.data) || 'its root folder is missing or empty'}`, { app, kind: 'conflict', status })
      }
      if (status != null && status < 500) {
        breaker.recordSuccess()
        throw new ArrError(`${name} HTTP ${status}${messageOf(outcome.response.data) ? `: ${messageOf(outcome.response.data)}` : ''}`, { app, kind: 'rejected', status })
      }
      breaker.recordFailure()
      if (attempt >= retries) {
        throw new ArrError(status ? `${name} HTTP ${status}` : `${name} did not answer (${outcome.error?.code || outcome.error?.message || 'no reply'})`, { app, status })
      }
      await sleep(retryDelayMs({ attempt, baseMs: RETRY_BASE_MS, maxMs: RETRY_MAX_MS, random }))
    }
  }

  const get = (path, params) => send({ method: 'get', path, params, timeoutMs: READ_TIMEOUT_MS, retries: READ_RETRIES })
  const put = (path, data) => send({ method: 'put', path, data, timeoutMs: WRITE_TIMEOUT_MS, retries: 0 })
  const del = (path, params) => send({ method: 'delete', path, params, timeoutMs: WRITE_TIMEOUT_MS, retries: 0 })

  return {
    app,
    status: () => get('/api/v3/system/status'),
    mediaManagement: () => get('/api/v3/config/mediamanagement'),
    series: () => get('/api/v3/series'),
    episodeFiles: (seriesId) => get('/api/v3/episodefile', { seriesId }),
    episodesOfFile: (episodeFileId) => get('/api/v3/episode', { episodeFileId }),
    movies: () => get('/api/v3/movie'),
    unmonitorEpisodes: (episodeIds) => put('/api/v3/episode/monitor', { episodeIds, monitored: false }),
    monitorEpisodes: (episodeIds) => put('/api/v3/episode/monitor', { episodeIds, monitored: true }),
    unmonitorMovies: (movieIds) => put('/api/v3/movie/editor', { movieIds, monitored: false }),
    monitorMovies: (movieIds) => put('/api/v3/movie/editor', { movieIds, monitored: true }),
    deleteEpisodeFile: (id) => del(`/api/v3/episodefile/${encodeURIComponent(id)}`),
    deleteMovieFile: (id) => del(`/api/v3/moviefile/${encodeURIComponent(id)}`),
    deleteSeries: (id) => del(`/api/v3/series/${encodeURIComponent(id)}`, { deleteFiles: false, addImportListExclusion: true }),
  }
}

export const pingArr = async ({ url, request = axiosRequest, timeoutMs = PING_TIMEOUT_MS }) => {
  try {
    const response = await request({ method: 'get', url: `${String(url).replace(/\/+$/, '')}/ping`, headers: { Accept: 'application/json' }, timeoutMs, maxBytes: PING_MAX_BYTES })
    return response.status >= 200 && response.status < 300
  } catch {
    return false
  }
}

export const arrConfigOf = (xml) => {
  const text = String(xml || '')
  const field = (name) => text.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1]?.trim() || null
  const port = Number(field('Port'))
  const urlBase = (field('UrlBase') || '').replace(/^\/+|\/+$/g, '')
  return {
    apiKey: field('ApiKey'),
    port: Number.isInteger(port) && port > 0 ? port : null,
    urlBase: urlBase ? `/${urlBase}` : '',
  }
}

export const recycleBinOf = (management) => {
  const folder = String(management?.recycleBin || '').trim()
  if (!folder) return { on: false, days: null }
  const days = Number(management?.recycleBinCleanupDays)
  return { on: true, days: Number.isFinite(days) && days > 0 ? days : null }
}

const messageOf = (data) => {
  if (!data) return ''
  if (typeof data === 'string') return data.slice(0, 200)
  if (Array.isArray(data)) return data.map((entry) => entry?.errorMessage).filter(Boolean).join('; ').slice(0, 200)
  return String(data.message || data.errorMessage || '').slice(0, 200)
}

const axiosRequest = ({ method, url, params, data, headers, timeoutMs, maxBytes }) => axios.request({
  method,
  url,
  params,
  data,
  headers,
  timeout: timeoutMs,
  signal: AbortSignal.timeout(timeoutMs),
  maxContentLength: maxBytes,
  maxBodyLength: maxBytes,
  maxRedirects: 0,
  validateStatus: () => true,
})

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const RETRY_BASE_MS = 500
const RETRY_MAX_MS = 4000
const PING_TIMEOUT_MS = 2000
const PING_MAX_BYTES = 64 * 1024
