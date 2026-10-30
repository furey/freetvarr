import fs from 'fs/promises'

import { getSetting, setSetting } from './db.js'
import { ARR_APPS, ARR_DEFAULT_PORTS, arrConfigOf, createArrClient, pingArr, recycleBinOf } from './arr-client.js'
import { createCircuitBreaker } from './outbound-http.js'
import { radarrEntryOf, sonarrEntryOf } from './arr-files.js'

export const loadArrSettings = async ({ readConfig = readArrConfig } = {}) => {
  const entries = await Promise.all(ARR_APPS.map(async (app) => {
    const [url, savedKey, fileConfig] = await Promise.all([
      getSetting(`${app}_url`),
      getSetting(`${app}_api_key`),
      readConfig(app),
    ])
    return [app, arrSettingOf({ url, savedKey, fileConfig })]
  }))
  const unmonitor = await getSetting(UNMONITOR_KEY)
  return { ...Object.fromEntries(entries), unmonitorOnDelete: unmonitor !== 'false' }
}

export const arrSettingOf = ({ url, savedKey, fileConfig }) => {
  const key = savedKey || fileConfig?.apiKey || null
  return {
    url: (url || '').trim().replace(/\/+$/, '') || null,
    apiKey: key,
    keySource: savedKey ? 'saved' : fileConfig?.apiKey ? 'config.xml' : null,
    configFound: Boolean(fileConfig),
  }
}

export const saveArrSettings = async (patch) => {
  for (const app of ARR_APPS) {
    const entry = patch[app]
    if (!entry) continue
    if (entry.url !== undefined) await setSetting(`${app}_url`, entry.url || '')
    if (entry.apiKey !== undefined) await setSetting(`${app}_api_key`, entry.apiKey || '')
    clients.delete(app)
  }
  if (typeof patch.unmonitorOnDelete === 'boolean') await setSetting(UNMONITOR_KEY, String(patch.unmonitorOnDelete))
  return loadArrSettings()
}

export const arrClientFor = async (app, { settings } = {}) => {
  const chosen = (settings ?? await loadArrSettings())[app]
  if (!chosen?.url || !chosen.apiKey) return null
  const cacheKey = `${chosen.url}|${chosen.apiKey}`
  const cached = clients.get(app)
  if (cached?.cacheKey === cacheKey) return cached.client
  const client = createArrClient({ app, url: chosen.url, apiKey: chosen.apiKey, breaker: createCircuitBreaker() })
  clients.set(app, { cacheKey, client })
  return client
}

export const testArr = async (app, { settings } = {}) => {
  const client = await arrClientFor(app, { settings })
  if (!client) return { ok: false, error: 'Add the URL and the API key first.' }
  try {
    const [status, management, items] = await Promise.all([
      client.status(),
      client.mediaManagement().catch(() => null),
      app === 'sonarr' ? client.series() : client.movies(),
    ])
    return {
      ok: true,
      version: status?.version ?? null,
      count: Array.isArray(items) ? items.length : 0,
      recycleBin: recycleBinOf(management),
    }
  } catch (err) {
    return { ok: false, error: err.message, kind: err.kind ?? null }
  }
}

export const findArr = async ({ hosts, readConfig = readArrConfig, ping = pingArr }) => {
  const found = {}
  for (const app of ARR_APPS) {
    const config = await readConfig(app)
    const port = config?.port ?? ARR_DEFAULT_PORTS[app]
    const urlBase = config?.urlBase ?? ''
    found[app] = { url: null, keyFound: Boolean(config?.apiKey) }
    for (const host of hosts) {
      const url = `http://${host}:${port}${urlBase}`
      if (await ping({ url })) {
        found[app] = { url, keyFound: Boolean(config?.apiKey) }
        break
      }
    }
  }
  return found
}

export const discoveryHostsOf = ({ plexUrl, tvhUrl }) => unique([
  hostOf(plexUrl),
  hostOf(tvhUrl),
  'localhost',
  'host.docker.internal',
  'sonarr',
  'radarr',
].filter(Boolean))

export const loadDiscoveryHosts = async () => discoveryHostsOf({
  plexUrl: await getSetting('plex_url'),
  tvhUrl: await getSetting('tvh_url'),
})

export const buildManagerIndex = async ({ settings, clientFor = arrClientFor } = {}) => {
  const chosen = settings ?? await loadArrSettings()
  const [sonarr, radarr] = await Promise.all([clientFor('sonarr', { settings: chosen }), clientFor('radarr', { settings: chosen })])
  if (!sonarr && !radarr) return new Map()
  const index = new Map()
  if (sonarr) {
    for (const series of await sonarr.series()) {
      for (const file of await sonarr.episodeFiles(series.id)) addEntry(index, sonarrEntryOf({ series, file }))
    }
  }
  if (radarr) {
    for (const movie of await radarr.movies()) addEntry(index, radarrEntryOf(movie))
  }
  return index
}

export const listSonarrSeries = async ({ clientFor = arrClientFor } = {}) => {
  const sonarr = await clientFor('sonarr')
  return sonarr ? sonarr.series() : null
}

export const readArrConfig = async (app) => {
  const file = configPathOf(app)
  const text = await fs.readFile(file, 'utf8').catch(() => null)
  if (!text || !text.includes('<Config')) return null
  return arrConfigOf(text)
}

export const configPathOf = (app) => process.env[`${app.toUpperCase()}_CONFIG_PATH`] || `/${app}-config.xml`

const hostOf = (url) => {
  try {
    return url ? new URL(url).hostname : null
  } catch {
    return null
  }
}

const addEntry = (index, entry) => {
  if (entry) index.set(entry.path, entry)
}

const unique = (items) => [...new Set(items)]

const clients = new Map()
const UNMONITOR_KEY = 'arr_unmonitor_on_delete'
