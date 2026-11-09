import axios from 'axios'

import { artFeed } from './art-feed.js'
import { db, getSetting } from './db.js'
import { listPlexSections, storedPlexToken } from './plex.js'
import { itemArtOf } from './plex-library.js'
import { showKeyOf } from './web/show-key.js'
import { IMAGE_RESPONSE_CSP, rasterTypeOf } from './raster-type.js'
import { loadWholeLibrarySettings, saveWholeLibrarySettings } from './plex-library-store.js'

export const mountPlexLibraryRoutes = ({
  app,
  csrf,
  limiter,
  sync,
  fetchImage = fetchPlexImage,
  itemImage = createItemImage({ fetchImage }),
}) => {
  app.get('/api/plex/whole-library', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json(await wholeLibraryBody())
  })

  app.put('/api/plex/whole-library', limiter, csrf, async (req, res) => {
    const patch = wholeLibraryPatchFrom(req.body)
    if (patch.error) return res.status(400).json({ error: patch.error })
    await saveWholeLibrarySettings(patch)
    sync.request({ trigger: 'settings', full: true })
    res.json(await wholeLibraryBody())
  })

  app.get('/api/library/items/:ratingKey/image', async (req, res) => {
    const kind = req.query.kind === 'art' ? 'art' : 'thumb'
    const width = imageWidthFrom(req.query.w)
    const image = await itemImage({ ratingKey: String(req.params.ratingKey), kind, width })
    const contentType = image && rasterTypeOf(image.body)
    if (!contentType) return res.status(404).end()
    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Security-Policy', IMAGE_RESPONSE_CSP)
    res.setHeader('Cache-Control', 'private, max-age=86400')
    res.end(image.body)
  })
}

export const createItemImage = ({
  fetchImage = fetchPlexImage,
  loadRow = (ratingKey) => db('library_items').where({ rating_key: ratingKey }).first(),
  fetchMetadata = fetchPlexItemMetadata,
  saveArt = (ratingKey, art) => db('library_items').where({ rating_key: ratingKey }).update(art),
  publish = artFeed.publish,
  cache = createImageCache(),
  now = Date.now,
  refreshGapMs = REFRESH_GAP_MS,
} = {}) => {
  const refreshedAt = new Map()

  const imageOf = ({ row, kind, width }) => {
    const source = row?.[kind] || row?.thumb || null
    return source ? cache.get({ key: `${source}|${width}`, load: () => fetchImage({ source, width }) }) : null
  }

  const refreshArt = async ({ ratingKey, row }) => {
    if (now() - (refreshedAt.get(ratingKey) ?? -Infinity) < refreshGapMs) return null
    refreshedAt.set(ratingKey, now())
    if (refreshedAt.size > MAX_REFRESHED) refreshedAt.delete(refreshedAt.keys().next().value)
    const metadata = await fetchMetadata(ratingKey).catch(() => null)
    if (!metadata) return null
    const art = itemArtOf(metadata)
    if (art.thumb === row.thumb && art.art === row.art) return null
    await saveArt(ratingKey, art)
    const fresh = { ...row, ...art }
    const key = showKeyOf(fresh.show_title || fresh.title)
    for (const artKind of ['poster', 'background']) publish({ key, kind: artKind, stamp: null })
    return fresh
  }

  return async ({ ratingKey, kind, width }) => {
    const row = await loadRow(ratingKey)
    if (!row) return null
    const image = await imageOf({ row, kind, width })
    if (image) return image
    const fresh = await refreshArt({ ratingKey, row })
    return fresh ? imageOf({ row: fresh, kind, width }) : null
  }
}

export const wholeLibraryPatchFrom = (body = {}) => {
  const patch = {}
  if (body?.enabled !== undefined) {
    if (typeof body.enabled !== 'boolean') return { error: 'enabled must be true or false' }
    patch.enabled = body.enabled
  }
  if (body?.section_ids !== undefined) {
    const ids = body.section_ids
    if (!Array.isArray(ids) || ids.length > MAX_SECTIONS || !ids.every((id) => /^\d{1,9}$/.test(String(id)))) {
      return { error: `section_ids must be a list of up to ${MAX_SECTIONS} Plex library ids` }
    }
    patch.sectionIds = ids.map(String)
  }
  if (!Object.keys(patch).length) return { error: 'send enabled or section_ids' }
  return patch
}

export const imageWidthFrom = (value) => {
  const width = Number(value)
  return Number.isInteger(width) && width >= MIN_WIDTH && width <= MAX_WIDTH ? width : DEFAULT_WIDTH
}

export const createImageCache = ({ maxEntries = CACHE_ENTRIES, missMs = MISS_MS, now = Date.now } = {}) => {
  const entries = new Map()
  const get = async ({ key, load }) => {
    const hit = entries.get(key)
    if (hit && (hit.value || now() < hit.expiresAt)) {
      entries.delete(key)
      entries.set(key, hit)
      return hit.value
    }
    const value = await load().catch(() => null)
    entries.set(key, { value, expiresAt: now() + missMs })
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value)
    return value
  }
  return { get }
}

const wholeLibraryBody = async () => {
  const settings = await loadWholeLibrarySettings()
  const sections = await listPlexSections().catch(() => null)
  return {
    enabled: settings.enabled,
    sectionIds: settings.sectionIds,
    sections: sections
      ? sections
        .filter((section) => ['show', 'movie'].includes(section.type) && section.key !== settings.oneOffSectionId)
        .map((section) => ({ id: section.key, title: section.title, type: section.type }))
      : null,
    itemCount: await db('library_items').whereIn('section_id', settings.sectionIds).countDistinct('rating_key as n').first().then((row) => Number(row?.n) || 0),
  }
}

const fetchPlexImage = async ({ source, width }) => {
  const [url, token] = await Promise.all([getSetting('plex_url'), storedPlexToken()])
  if (!url || !token) return null
  const height = Math.round(width * 1.5)
  const response = await axios.get(`${url.replace(/\/$/, '')}/photo/:/transcode`, {
    params: { url: source, width, height, minSize: 1, upscale: 1, 'X-Plex-Token': token },
    responseType: 'arraybuffer',
    timeout: IMAGE_TIMEOUT_MS,
    maxContentLength: IMAGE_MAX_BYTES,
    validateStatus: () => true,
  })
  const contentType = String(response.headers['content-type'] || '').split(';')[0]
  if (response.status !== 200 || !contentType.startsWith('image/')) return null
  return { body: Buffer.from(response.data), contentType }
}

const fetchPlexItemMetadata = async (ratingKey) => {
  const [url, token] = await Promise.all([getSetting('plex_url'), storedPlexToken()])
  if (!url || !token) return null
  const response = await axios.get(`${url.replace(/\/$/, '')}/library/metadata/${encodeURIComponent(ratingKey)}`, {
    params: { 'X-Plex-Token': token },
    headers: { Accept: 'application/json' },
    timeout: IMAGE_TIMEOUT_MS,
    validateStatus: () => true,
  })
  if (response.status !== 200) return null
  return response.data?.MediaContainer?.Metadata?.[0] ?? null
}

const MAX_SECTIONS = 20
const MIN_WIDTH = 64
const MAX_WIDTH = 1280
const DEFAULT_WIDTH = 384
const CACHE_ENTRIES = 300
const MISS_MS = 5 * 60 * 1000
const IMAGE_TIMEOUT_MS = 10_000
const IMAGE_MAX_BYTES = 4 * 1024 * 1024
const REFRESH_GAP_MS = 5 * 60 * 1000
const MAX_REFRESHED = 1000
