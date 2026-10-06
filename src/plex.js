import fs from 'fs/promises'
import dgram from 'node:dgram'

import axios from 'axios'
import { XMLParser } from 'fast-xml-parser'

import { getSetting, setSetting } from './db.js'
import { currentTimeZone } from './time-zone.js'
import { countryForTimeZone } from './zone-countries.js'

export const notifyPlexSectionRefresh = async (overrides = {}) => {
  const saved = await getConfig()
  const url = (overrides.url ?? saved.url ?? '').replace(/\/$/, '')
  const token = overrides.token ?? saved.token
  const sectionId = overrides.sectionId ?? saved.sectionId
  if (!url || !token || !sectionId) return { skipped: true, reason: 'plex not configured' }
  try {
    const res = await axios.get(
      `${url}/library/sections/${encodeURIComponent(sectionId)}/refresh`,
      { params: { 'X-Plex-Token': token }, timeout: 5000, validateStatus: () => true },
    )
    return res.status >= 200 && res.status < 300
      ? { triggered: true, status: res.status }
      : { error: `Plex HTTP ${res.status}`, status: res.status }
  } catch (err) {
    return { error: err.code || err.message }
  }
}

export const detectPlexTokenFromPreferences = async () => {
  const path = await resolvePlexPrefsPath()
  let raw
  try {
    raw = await fs.readFile(path, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {
        ok: false,
        path,
        reason: `Preferences.xml not found at ${path}. `
          + 'Check the bind-mount in docker-compose or edit the path in Settings.',
      }
    }
    return { ok: false, path, reason: `read failed: ${err.code || err.message}` }
  }
  const parsed = prefsXml.parse(raw)
  const token = parsed?.Preferences?.PlexOnlineToken
  if (!token || typeof token !== 'string') {
    return {
      ok: false,
      path,
      reason: 'PlexOnlineToken attribute not found — has Plex been signed in to plex.tv?',
    }
  }
  await setSetting('plex_token', token)
  return { ok: true, path, source: 'preferences.xml', token }
}

export const listPlexSections = async (connection = {}) => {
  const { url, token } = await resolveConnection(connection)
  const res = await axios.get(`${url}/library/sections`, {
    params: { 'X-Plex-Token': token },
    headers: { Accept: 'application/json' },
    timeout: 5000,
    validateStatus: () => true,
  })
  if (res.status === 401) throw new Error('Plex rejected the token (401)')
  if (res.status >= 400) throw new Error(`Plex HTTP ${res.status}`)

  const dirs = res.data?.MediaContainer?.Directory
  const list = Array.isArray(dirs) ? dirs : dirs ? [dirs] : []
  return list.map((d) => ({
    key: String(d.key),
    title: d.title,
    type: d.type,
    locations: [d.Location || []].flat().map((l) => l.path).filter(Boolean),
  }))
}

export const planPlexLibraries = ({ sections, roots }) =>
  Object.entries(PLEX_LIBRARY_KINDS)
    .filter(([kind]) => roots[kind])
    .map(([kind, spec]) => {
      const existing = sectionAt(sections, roots[kind])
      return {
        kind,
        name: spec.name,
        location: roots[kind],
        existing: existing ? { key: existing.key, title: existing.title } : null,
      }
    })

export const plexLibraryLocale = (timeZone) => {
  const code = countryForTimeZone(timeZone).toUpperCase()
  const country = code === 'UK' ? 'GB' : code
  return { language: PLEX_LIBRARY_LANGUAGES[country] || DEFAULT_PLEX_LIBRARY_LANGUAGE, country }
}

export const createPlexLibraries = async ({ libraries, timeZone = currentTimeZone(), ...connection }) => {
  const { url, token } = await resolveConnection(connection)
  const sections = await listPlexSections({ url, token })
  const results = []
  for (const library of libraries) {
    results.push(await createPlexLibrary({ url, token, sections, library, locale: plexLibraryLocale(timeZone) }))
  }
  return results
}

// Plex's GDM ("G'Day Mate") discovery: UDP broadcast on 32414. Servers reply
// with HTTP-like headers describing themselves. Plex listens for GDM the same
// way fetcharr's fetchtv dep listens for SSDP — host networking required for
// Docker so the broadcast traverses the LAN.
export const discoverLocalPlexServers = async () => {
  const socket = dgram.createSocket('udp4')
  const found = new Map()

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (val) => {
      if (settled) return
      settled = true
      try { socket.close() } catch { /* already closed */ }
      resolve(val)
    }

    socket.on('error', (err) => {
      if (settled) return
      settled = true
      try { socket.close() } catch { /* already closed */ }
      reject(err)
    })

    socket.on('message', (msg, rinfo) => {
      const text = msg.toString('utf8')
      if (!/^HTTP\/1\.[01]\s+200/i.test(text)) return
      const headers = {}
      for (const line of text.split(/\r?\n/).slice(1)) {
        const idx = line.indexOf(':')
        if (idx < 0) continue
        headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim()
      }
      const port = Number(headers.port) || 32400
      const key = `${rinfo.address}:${port}`
      if (found.has(key)) return
      found.set(key, {
        ip: rinfo.address,
        port,
        name: headers.name || '',
        version: headers.version || '',
        identifier: headers['resource-identifier'] || '',
      })
    })

    socket.bind(() => {
      try {
        socket.setBroadcast(true)
        const msg = Buffer.from('M-SEARCH * HTTP/1.0\r\n\r\n')
        socket.send(msg, 0, msg.length, GDM_PORT, '255.255.255.255')
      } catch (err) {
        if (settled) return
        settled = true
        try { socket.close() } catch { /* already closed */ }
        reject(err)
      }
    })

    setTimeout(() => finish(Array.from(found.values())), GDM_TIMEOUT_MS)
  })
}

const createPlexLibrary = async ({ url, token, sections, library, locale }) => {
  const spec = PLEX_LIBRARY_KINDS[library.kind]
  const name = String(library.name || '').trim()
  const location = String(library.location || '').trim().replace(/(.)\/+$/, '$1')
  const result = { kind: library.kind, name, location }
  if (!spec) return { ...result, status: 'failed', error: `Unknown library kind "${library.kind}"` }
  if (!name) return { ...result, status: 'failed', error: 'The library needs a name.' }
  if (!location.startsWith('/')) {
    return { ...result, status: 'failed', error: 'The folder must be a full path, starting with /.' }
  }
  const existing = sectionAt(sections, location)
  if (existing) return { ...result, status: 'exists', key: existing.key, title: existing.title }
  if (await plexSeesFolder({ url, token, location }) === false) {
    return { ...result, status: 'failed', error: `Plex cannot see ${location}. Check the folder Plex mounts.` }
  }
  const res = await axios.post(`${url}/library/sections`, null, {
    params: {
      name,
      type: spec.type,
      agent: spec.agent,
      scanner: spec.scanner,
      language: locale.language,
      ...(locale.country && { 'prefs[country]': locale.country }),
      location,
      'X-Plex-Token': token,
    },
    headers: { Accept: 'application/json' },
    timeout: 10000,
    validateStatus: () => true,
  })
  if (res.status === 401) return { ...result, status: 'failed', error: 'Plex rejected the token (401)' }
  if (res.status >= 400) return { ...result, status: 'failed', error: `Plex HTTP ${res.status}` }
  const created = [res.data?.MediaContainer?.Directory || []].flat()[0]
  if (!created?.key) return { ...result, status: 'failed', error: 'Plex did not return the new library.' }
  return { ...result, status: 'created', key: String(created.key), title: created.title }
}

const plexSeesFolder = async ({ url, token, location }) => {
  const parent = location.slice(0, location.lastIndexOf('/')) || '/'
  const res = await axios.get(
    `${url}/services/browse/${Buffer.from(parent).toString('base64')}`,
    {
      params: { includeFiles: 0, 'X-Plex-Token': token },
      headers: { Accept: 'application/json' },
      timeout: 5000,
      validateStatus: () => true,
    },
  ).catch(() => null)
  if (!res || res.status !== 200 || typeof res.data !== 'object') return null
  const folders = [res.data?.MediaContainer?.Path || []].flat()
  return folders.some((folder) => folder.path === location)
}

const sectionAt = (sections, location) =>
  sections.find((section) => section.locations.some((path) => samePath(path, location)))

const samePath = (a, b) => a.replace(/(.)\/+$/, '$1') === b.replace(/(.)\/+$/, '$1')

const resolveConnection = async ({ url, token } = {}) => {
  if (!url || !token) {
    const cfg = await getConfig()
    url ||= cfg.url
    token ||= cfg.token
  }
  url = (url || '').replace(/\/$/, '')
  if (!url || !token) throw new Error('plex_url and plex_token are required')
  return { url, token }
}

const resolvePlexPrefsPath = async () => {
  const fromSetting = await getSetting('plex_prefs_path')
  if (fromSetting && fromSetting.trim()) return fromSetting.trim()
  return process.env.PLEX_PREFS_PATH || DEFAULT_PLEX_PREFS_PATH
}

export const getPlexPrefsPath = resolvePlexPrefsPath

const getConfig = async () => {
  const url = (await getSetting('plex_url')) || ''
  const token = (await getSetting('plex_token')) || ''
  const sectionId = (await getSetting('plex_tv_section_id')) || ''
  return { url: url.replace(/\/$/, ''), token, sectionId }
}

const prefsXml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' })

const DEFAULT_PLEX_PREFS_PATH = '/plex/Library/Application Support/Plex Media Server/Preferences.xml'
const PLEX_LIBRARY_KINDS = {
  tv: { name: 'TV Shows', type: 'show', agent: 'tv.plex.agents.series', scanner: 'Plex TV Series' },
  oneoff: { name: 'One-offs', type: 'movie', agent: 'tv.plex.agents.none', scanner: 'Plex Video Files' },
  movies: { name: 'Movies', type: 'movie', agent: 'tv.plex.agents.movie', scanner: 'Plex Movie' },
}
const DEFAULT_PLEX_LIBRARY_LANGUAGE = 'en-US'
const PLEX_LIBRARY_LANGUAGES = { AU: 'en-AU', NZ: 'en-AU', CA: 'en-CA', GB: 'en-GB', IE: 'en-GB' }
const GDM_PORT = 32414
const GDM_TIMEOUT_MS = 2000
