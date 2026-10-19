import { ref, computed } from '/vendor/vue.esm-browser.prod.js'
import { isStaleBuild } from '/stale-build.js'

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
  const headers = { 'Content-Type': 'application/json', ...headersExtra }
  const res = noteBuild(await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
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

export const api = async (method, url, body) => {
  if (method === 'GET') return apiCall(method, url, body)
  try {
    return await apiCall(method, url, body, { 'x-csrf-token': await getCsrf() })
  } catch (err) {
    if (!/HTTP 403/.test(err.message)) throw err
    csrfToken = null
    return apiCall(method, url, body, { 'x-csrf-token': await getCsrf({ force: true }) })
  }
}

let settingsRequest = null

export const fetchSettings = () => {
  settingsRequest ??= api('GET', '/api/settings').finally(() => { settingsRequest = null })
  return settingsRequest
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) checkForNewBuild()
})
