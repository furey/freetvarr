import { ref, computed } from '/vendor/vue.esm-browser.prod.js'
import { isStaleBuild } from '/stale-build.js'
import { withCsrfRetry } from '/shared/csrf-retry.js'

export let csrfToken = null

const BUILD_HEADER = 'X-Freetvarr-Build'
export const loadedBuild = document.querySelector('meta[name="freetvarr-build"]')?.content || null
export const latestBuild = ref(null)

export const noteBuild = (res) => {
  const build = res.headers.get(BUILD_HEADER)
  if (build) latestBuild.value = build
  return res
}

export const serverAbout = ref({})

export const fetchServerAbout = async (query = '') => {
  const res = noteBuild(await fetch(`/api/version${query}`, { cache: 'no-store' }))
  const about = await res.json()
  serverAbout.value = { ...serverAbout.value, ...about }
  return about
}

export const checkForNewBuild = () => fetchServerAbout().catch(() => {})

const REPO_URL = 'https://github.com/furey/freetvarr'
export const releaseUrl = (version) => `${REPO_URL}/tree/${encodeURIComponent(version)}`

export const staleBuild = computed(() => isStaleBuild({
  loaded: loadedBuild,
  latest: latestBuild.value,
}))

const getCsrf = async ({ force = false } = {}) => {
  if (csrfToken && !force) return csrfToken
  const res = noteBuild(await fetch('/api/csrf-token'))
  if (!res.ok) throw new Error(`csrf-token HTTP ${res.status}`)
  const data = await res.json().catch(() => {
    throw new Error(`csrf-token returned non-JSON (HTTP ${res.status})`)
  })
  csrfToken = data.token
  return csrfToken
}

const apiCall = async (method, url, body, headersExtra = {}) => {
  const isFile = typeof Blob !== 'undefined' && body instanceof Blob
  const contentType = isFile ? body.type || 'application/octet-stream' : 'application/json'
  const headers = { 'Content-Type': contentType, ...headersExtra }
  const res = noteBuild(await fetch(url, {
    method,
    headers,
    body: isFile ? body : body ? JSON.stringify(body) : undefined,
  }))
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || data.reason || `HTTP ${res.status}`)
    err.code = data.code || null
    err.stage = data.stage || null
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

export const prefetchGet = (url) => {
  if (freshPrefetchOf(url)) return
  const request = apiCall('GET', url)
  request.catch(() => {})
  prefetchedGets.set(url, { request, at: Date.now() })
}

const PREFETCH_TTL_MS = 5000
const prefetchedGets = new Map()

const freshPrefetchOf = (url) => {
  const entry = prefetchedGets.get(url)
  return entry && Date.now() - entry.at < PREFETCH_TTL_MS ? entry : null
}

const takePrefetchedGet = (url) => {
  const entry = freshPrefetchOf(url)
  prefetchedGets.delete(url)
  return entry ? entry.request.catch(() => apiCall('GET', url)) : null
}

export const api = async (method, url, body) => {
  if (method === 'GET') return takePrefetchedGet(url) ?? apiCall(method, url, body)
  prefetchedGets.clear()
  return withCsrfRetry({
    send: (token) => apiCall(method, url, body, { 'x-csrf-token': token }),
    tokenOf: getCsrf,
  })
}

let settingsRequest = null

export const fetchSettings = () => {
  settingsRequest ??= api('GET', '/api/settings').finally(() => { settingsRequest = null })
  return settingsRequest
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) checkForNewBuild()
})
