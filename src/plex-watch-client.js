import axios from 'axios'

export const PAGE_SIZE = 500
export const MAX_PAGES = 40
export const MAX_PAGE_BYTES = 20 * 1024 * 1024
export const READ_TIMEOUT_MS = 15_000
export const WRITE_TIMEOUT_MS = 10_000
export const METADATA_BATCH = 50

export class PlexWatchError extends Error {
  constructor(message, { kind = 'unreachable', status = null } = {}) {
    super(message)
    this.name = 'PlexWatchError'
    this.kind = kind
    this.status = status
  }
}

export const createPlexWatchClient = ({ url, token, request = axiosRequest }) => {
  const base = url.replace(/\/$/, '')

  const get = async ({ path, params = {}, headers = {}, timeoutMs = READ_TIMEOUT_MS, maxBytes = MAX_PAGE_BYTES }) => {
    const response = await request({
      url: `${base}${path}`,
      params: { ...params, 'X-Plex-Token': token },
      headers: { Accept: 'application/json', ...headers },
      timeoutMs,
      maxBytes,
    }).catch((err) => {
      throw new PlexWatchError(`Plex did not answer: ${err.code || err.message}`)
    })
    if (response.status === 401) throw new PlexWatchError('Plex rejected the token', { kind: 'token', status: 401 })
    if (response.status >= 400) throw new PlexWatchError(`Plex HTTP ${response.status}`, { status: response.status })
    return response.data
  }

  const listItems = async ({ section, viewedSinceS = null }) => {
    const items = []
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const data = await get({
        path: `/library/sections/${encodeURIComponent(section.id)}/all`,
        params: {
          type: section.type === 'show' ? 4 : 1,
          ...(viewedSinceS != null ? { 'lastViewedAt>>': viewedSinceS } : {}),
        },
        headers: { 'X-Plex-Container-Start': String(page * PAGE_SIZE), 'X-Plex-Container-Size': String(PAGE_SIZE) },
      })
      const batch = metadataOf(data)
      items.push(...batch)
      const total = Number(data?.MediaContainer?.totalSize)
      if (batch.length < PAGE_SIZE || (Number.isFinite(total) && items.length >= total)) return items
    }
    return items
  }

  const metadata = async (ratingKeys) => {
    const items = []
    for (let start = 0; start < ratingKeys.length; start += METADATA_BATCH) {
      const keys = ratingKeys.slice(start, start + METADATA_BATCH).map(encodeURIComponent).join(',')
      items.push(...metadataOf(await get({ path: `/library/metadata/${keys}` })))
    }
    return items
  }

  const write = ({ action, ratingKey, seconds }) => {
    const params = { key: ratingKey, identifier: PLEX_LIBRARY_IDENTIFIER }
    if (action === 'progress') {
      return get({ path: '/:/progress', params: { ...params, time: seconds * 1000, state: 'stopped' }, timeoutMs: WRITE_TIMEOUT_MS })
    }
    return get({ path: `/:/${action}`, params, timeoutMs: WRITE_TIMEOUT_MS })
  }

  return { listItems, metadata, write }
}

export const metadataOf = (data) => {
  const list = data?.MediaContainer?.Metadata
  if (Array.isArray(list)) return list
  return list ? [list] : []
}

const axiosRequest = ({ url, params, headers, timeoutMs, maxBytes }) => axios.get(url, {
  params,
  headers,
  timeout: timeoutMs,
  maxContentLength: maxBytes,
  maxBodyLength: maxBytes,
  validateStatus: () => true,
})

const PLEX_LIBRARY_IDENTIFIER = 'com.plexapp.plugins.library'
