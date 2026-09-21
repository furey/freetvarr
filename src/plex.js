import fs from 'fs/promises'
import dgram from 'node:dgram'

import axios from 'axios'
import { XMLParser } from 'fast-xml-parser'

import { getSetting, setSetting } from './db.js'

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

export const listPlexSections = async ({ url, token } = {}) => {
  if (!url || !token) {
    const cfg = await getConfig()
    url ??= cfg.url
    token ??= cfg.token
  }
  url = (url || '').replace(/\/$/, '')
  if (!url || !token) throw new Error('plex_url and plex_token are required')

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
  return list.map((d) => ({ key: String(d.key), title: d.title, type: d.type }))
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

const DEFAULT_PLEX_PREFS_PATH = '/plex-preferences.xml'
const GDM_PORT = 32414
const GDM_TIMEOUT_MS = 2000
