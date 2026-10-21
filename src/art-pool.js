import axios from 'axios'
import crypto from 'crypto'
import path from 'path'

import { cachedStateOf } from './artwork-match.js'
import { findArtwork } from './artwork.js'
import { PLEX_ORIGIN_PREFIX, artworkChoices, choiceStampOf, plexSourceOf } from './artwork-choices.js'
import { db } from './db.js'
import { findArtSourceThumbnail } from './epg.js'
import { PROGRAMME_IMAGE_WIDTHS, createThumbnailStore, getThumbnailRoot, thumbnailWidthFrom } from './image-thumbnails.js'
import { groupKeyOf, isLibraryMember, ruleTitleOf } from './library.js'
import { matchPlexItem } from './library-actions.js'
import { getPlexConnection, listPlexSectionItems, plexSectionsToSearch } from './plex.js'
import { guideHintsFor, seriesShowFinder, showTitleKey, tvmazeImages, tvmazeLookupEnabled } from './show-artwork.js'
import { currentTimeZone } from './time-zone.js'
import { SERIES_MATCH_VERSION } from './web/artwork-stamps.js'
import { countryForTimeZone } from './zone-countries.js'

export { plexSourceOf }

export const mountArtPoolRoutes = ({ app, artPool = createArtPool(), warmAfterMs = WARM_DELAY_MS }) => {
  app.get('/api/recordings/:recording_id/image', serveRecordingImage())

  app.get('/api/library/shows/:key/art-pool', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const pool = await artPool.showPool(req.params.key)
    if (!pool) return res.status(404).json({ error: 'show not found' })
    res.json({ images: poolImagesOf({ entries: pool.entries, base: showPoolBase(req.params.key) }) })
  })

  app.get('/api/library/recordings/:recording_id/art', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const art = await artPool.recordingArt(req.params.recording_id)
    if (!art) return res.status(404).json({ error: 'recording not found' })
    res.json({ images: poolImagesOf({ entries: art.entries, base: recordingArtBase(req.params.recording_id) }) })
  })

  app.get('/api/library/shows/:key/art-pool/:image_id', serveEntry(artPool, async (req) =>
    (await artPool.showPool(req.params.key))?.entries))

  app.get('/api/library/recordings/:recording_id/art/:image_id', serveEntry(artPool, async (req) =>
    (await artPool.recordingArt(req.params.recording_id))?.entries))

  if (warmAfterMs !== null) scheduleWarmUp({ artPool, delayMs: warmAfterMs })
}

export const warmHomeArtPools = async ({ artPool, loadCandidates = homeCandidates }) => {
  const { showKeys, recordingIds } = await loadCandidates()
  for (const key of showKeys) await artPool.showPool(key).catch(() => null)
  for (const id of recordingIds) await artPool.recordingArt(id).catch(() => null)
  return { shows: showKeys.length, recordings: recordingIds.length }
}

export const serveRecordingImage = ({
  loadOriginal = (recordingId) => findArtwork({ kind: 'recording', id: recordingId }),
  thumbnails = recordingThumbnails,
} = {}) => async (req, res) => {
  const wantsThumbnail = req.query.w !== undefined
  const width = wantsThumbnail ? thumbnailWidthFrom({ requested: req.query.w, allowed: PROGRAMME_IMAGE_WIDTHS }) : null
  if (wantsThumbnail && width === null) return res.status(400).json({ error: `w must be one of ${PROGRAMME_IMAGE_WIDTHS.join(', ')}` })
  try {
    const original = await loadOriginal(req.params.recording_id).catch(() => null)
    const image = original && wantsThumbnail
      ? await thumbnails().thumbnailFor({
        key: `recording:${req.params.recording_id}:${contentKeyOf(original.body)}`,
        width,
        loadOriginal: async () => original,
      })
      : original
    if (!image) return sendMissing(res)
    res.setHeader('Content-Type', image.contentType)
    res.setHeader('Cache-Control', `public, max-age=${IMAGE_MAX_AGE_S}`)
    res.send(image.body)
  } catch {
    sendMissing(res)
  }
}

export const createArtPool = ({
  loadShowRows = libraryShowRows,
  loadRuleTitle = ruleTitleOf,
  loadRecordingRow = recordingRow,
  plexConnection = () => getPlexConnection(),
  plexSections = plexSectionsToSearch,
  plexItems = listPlexSectionItems,
  plexArts = plexArtsFor,
  isTvmazeEnabled = tvmazeLookupEnabled,
  searchTvmaze = null,
  hintsFor = guideHintsFor,
  loadTvmazeImages = tvmazeImages,
  countryCode = () => countryForTimeZone(currentTimeZone()),
  findSeriesShow = seriesShowFinder({ searchTvmaze, countryCode }),
  cache = databaseCache,
  poolStore = databasePoolStore,
  thumbnailFor = findArtSourceThumbnail,
  loadSavedArtwork = findArtwork,
  chosenBackground = (key) => artworkChoices.chosenFor({ key, kind: 'background' }),
  now = Date.now,
  plexTtlMs = PLEX_TTL_MS,
  poolTtlMs = POOL_TTL_MS,
  poolMissTtlMs = POOL_MISS_TTL_MS,
  tvmazeHitTtlMs = TVMAZE_HIT_TTL_MS,
  tvmazeMissTtlMs = TVMAZE_MISS_TTL_MS,
} = {}) => {
  const plexMemo = createPersistedMemo({
    store: poolStore,
    now,
    memoryTtlMs: plexTtlMs,
    hitTtlMs: poolTtlMs,
    missTtlMs: poolMissTtlMs,
  })
  const tvmazeMemo = createMemo({ ttlMs: plexTtlMs, now })

  const plexMatchFor = async (filePaths) => {
    const connection = await plexConnection().catch(() => null)
    if (!connection || !filePaths.length) return { match: null, partial: false }
    const sections = await plexSections().catch(() => [])
    const listings = await Promise.all(sections.map((section) =>
      plexItems({ ...connection, section }).catch(() => null)))
    const matchIn = (section, at) => {
      const item = filePaths.map((filePath) => matchPlexItem({ items: listings[at] || [], filePath })).find(Boolean)
      return item && { item, section, connection }
    }
    const match = sections.map(matchIn).find(Boolean) || null
    return { match, partial: !match && listings.includes(null) }
  }

  const plexShowPart = (key, filePaths) => plexMemo.get(`show:${key}`, async () => {
    const { match, partial } = await plexMatchFor(filePaths)
    const ratingKey = match?.section.type === 'show' ? match.item.grandparentRatingKey : match?.item.ratingKey
    if (!ratingKey) return { found: false, entries: [], partial }
    const arts = await plexArts({ ...match.connection, ratingKey }).catch(() => null)
    return { found: true, entries: plexArtsPoolOf(arts || []), partial: !arts }
  }, { found: false, entries: [] })

  const tvmazePart = async (title) => {
    const titleKey = showTitleKey(title)
    if (!titleKey || !(await isTvmazeEnabled())) return []
    const cacheKey = `${TVMAZE_CACHE_PREFIX}${titleKey}`
    const cached = await cache.read(cacheKey).catch(() => null)
    const state = cachedStateOf({ cached, nowMs: now(), hitTtlMs: tvmazeHitTtlMs, hasValue: Boolean(cached?.sources?.length) })
    if (state === 'fresh') return cached.sources
    const lookup = lookUpTvmazePool({ title, cacheKey })
    return state === 'stale' ? lookup.catch(() => cached.sources) : lookup
  }

  const lookUpTvmazePool = async ({ title, cacheKey }) => {
    const hints = await Promise.resolve().then(() => hintsFor(title)).catch(() => null)
    const show = await findSeriesShow({ title, hints })
    const entries = show ? tvmazePoolOf({ show, images: await loadTvmazeImages(show.id) }) : []
    const missTtlMs = hints ? tvmazeMissTtlMs : TVMAZE_UNHINTED_MISS_TTL_MS
    const expiresAt = now() + (entries.length ? tvmazeHitTtlMs : missTtlMs)
    await cache.write({ key: cacheKey, sources: entries, expiresAt }).catch(() => {})
    return entries
  }

  const showSources = async (key) => {
    const rows = await loadShowRows(key)
    const title = rows.length ? newestTitleOf(rows) : await Promise.resolve().then(() => loadRuleTitle(key)).catch(() => null)
    if (!title) return null
    const filePaths = rows.map((row) => row.file_path).filter(Boolean)
    const [plex, tvmaze] = await Promise.all([
      plexShowPart(key, filePaths).catch(() => ({ found: false, entries: [] })),
      tvmazeMemo.get(showTitleKey(title), () => tvmazePart(title).catch(() => [])),
    ])
    return { title, rows, plex, tvmaze }
  }

  const showPool = async (key) => {
    const sources = await showSources(key)
    if (!sources) return null
    const { title, plex, tvmaze } = sources
    const stamp = choiceStampOf(await chosenBackground(key).catch(() => null))
    return { title, entries: withIds(composeShowPool({ title, plex, tvmaze, stamp })) }
  }

  const recordingArt = async (recordingId) => {
    const row = await loadRecordingRow(recordingId)
    if (!row) return null
    const art = await plexMemo.get(recordingPoolKeyOf(row), () => recordingEntriesOf(row), { entries: [] })
    return { entries: art.entries }
  }

  const recordingEntriesOf = async (row) => {
    const saved = row.image_path
      ? await loadSavedArtwork({ kind: 'recording', id: row.recording_id }).catch(() => null)
      : null
    const guide = await keepLoadable(guideEpisodePoolOf({ row, saved }))
    const { match, partial } = row.file_path ? await plexMatchFor([row.file_path]) : { match: null, partial: false }
    return { entries: withIds([...guide, ...plexEpisodePoolOf(match)]), partial }
  }

  const keepLoadable = async (entries) => {
    const loadable = await Promise.all(entries.map(async (entry) =>
      !entry.origin || Boolean(await imageFor({ origin: entry.origin, width: HERO_WIDTH }).catch(() => null))))
    return entries.filter((_, at) => loadable[at])
  }

  const imageFor = async ({ origin, width }) => {
    const source = await sourceOfOrigin({ origin, plexConnection })
    return source ? thumbnailFor({ source, width }) : null
  }

  return { showPool, showSources, recordingArt, imageFor }
}

export const tvmazePoolOf = ({ show, images = [] }) => {
  const entryOf = (image, kind) => ({
    origin: image.resolutions?.original?.url,
    kind,
    source: 'tvmaze',
    width: image.resolutions?.original?.width ?? null,
    height: image.resolutions?.original?.height ?? null,
    main: Boolean(image.main),
  })
  const ofType = (type) => images
    .filter((image) => image.type === type && image.resolutions?.original?.url)
    .sort((a, b) => Number(Boolean(b.main)) - Number(Boolean(a.main)))
  const showPoster = show?.image?.original
    ? [{ origin: show.image.original, kind: 'poster', source: 'tvmaze', width: null, height: null, main: true }]
    : []
  return uniqueByOrigin([
    ...ofType('background').map((image) => entryOf(image, 'background')),
    ...showPoster,
    ...ofType('poster').map((image) => entryOf(image, 'poster')),
    ...ofType('banner').map((image) => entryOf(image, 'poster')),
  ])
}

export const plexArtsPoolOf = (arts = []) => uniqueByOrigin(arts
  .filter((art) => art?.key)
  .sort((a, b) => Number(Boolean(b.selected)) - Number(Boolean(a.selected)))
  .map((art) => ({
    origin: plexTranscodeOrigin(art.key),
    kind: 'background',
    source: 'plex',
    width: null,
    height: null,
    selected: Boolean(art.selected),
  })))

export const plexEpisodePoolOf = (match) => {
  if (!match) return []
  const { item, section } = match
  const entryOf = (path, kind) => ({ origin: plexTranscodeOrigin(path), kind, source: 'plex', width: null, height: null })
  if (section.type === 'show') return item.thumb ? [entryOf(item.thumb, 'episode')] : []
  return [item.art && entryOf(item.art, 'background'), item.thumb && entryOf(item.thumb, 'poster')].filter(Boolean)
}

export const guideEpisodePoolOf = ({ row, saved = null }) => {
  if (saved?.body) {
    return [{
      url: `/api/recordings/${encodeURIComponent(row.recording_id)}/image?w=${HERO_IMAGE_WIDTH}`,
      kind: 'episode',
      source: 'guide',
      contentKey: contentKeyOf(saved.body),
    }]
  }
  return row.image_url && !row.image_path ? [{ origin: row.image_url, kind: 'episode', source: 'guide' }] : []
}

export const composeShowPool = ({ title, plex = { found: false, entries: [] }, tvmaze = [], stamp = null }) => {
  const library = { url: showImageUrlOf({ title, stamp }), kind: 'background', source: 'library' }
  const plexAlternates = plex.entries.filter((entry) => !entry.selected)
  const tvmazeBackgrounds = tvmaze.filter((entry) => entry.kind === 'background')
  const libraryUsesTvmaze = !plex.found
  const tvmazeAlternates = libraryUsesTvmaze ? tvmazeBackgrounds.slice(1) : tvmazeBackgrounds
  return [
    library,
    ...plexAlternates.slice(0, MAX_PER_SOURCE),
    ...tvmazeAlternates.slice(0, MAX_PER_SOURCE),
    ...tvmaze.filter((entry) => entry.kind === 'poster').slice(0, MAX_POSTERS),
  ]
}

export const poolImagesOf = ({ entries, base }) => entries.map((entry) => ({
  url: entry.url ?? `${base}/${entry.id}?w=${HERO_WIDTH}`,
  kind: entry.kind,
  source: entry.source,
  width: entry.width ?? null,
  height: entry.height ?? null,
  contentKey: entry.contentKey ?? null,
}))

export const imageIdOf = (origin) => contentKeyOf(origin)

export const contentKeyOf = (data) => crypto.createHash('sha1').update(data).digest('hex').slice(0, 16)

export const plexTranscodeOrigin = (path) =>
  `${PLEX_ORIGIN_PREFIX}/photo/:/transcode?width=${PLEX_ART_WIDTH}&height=${PLEX_ART_HEIGHT}&minSize=1&upscale=0`
  + `&url=${encodeURIComponent(path)}`

const serveEntry = (artPool, loadEntries) => async (req, res) => {
  const width = thumbnailWidthFrom({ requested: req.query.w, allowed: PROGRAMME_IMAGE_WIDTHS })
  if (width === null) return res.status(400).json({ error: `w must be one of ${PROGRAMME_IMAGE_WIDTHS.join(', ')}` })
  try {
    const entry = ((await loadEntries(req)) || []).find((candidate) => candidate.id === req.params.image_id)
    const image = entry?.origin && await artPool.imageFor({ origin: entry.origin, width })
    if (!image) return sendMissing(res)
    res.setHeader('Content-Type', image.contentType)
    res.setHeader('Cache-Control', `public, max-age=${IMAGE_MAX_AGE_S}`)
    res.send(image.body)
  } catch {
    sendMissing(res)
  }
}

const sourceOfOrigin = async ({ origin, plexConnection }) => {
  if (!origin.startsWith(PLEX_ORIGIN_PREFIX)) return origin
  const connection = await plexConnection().catch(() => null)
  return connection ? plexSourceOf({ origin, ...connection }) : null
}

const scheduleWarmUp = ({ artPool, delayMs }) => {
  const timer = setTimeout(() => {
    warmHomeArtPools({ artPool }).catch((err) => console.warn(`[art-pool] warm-up failed: ${err.message}`))
  }, delayMs)
  timer.unref?.()
}

const homeCandidates = async () => {
  const recent = (column) => db('recordings').whereNull('purged_at').whereNotNull(column).orderBy(column, 'desc').limit(WARM_ROW_LIMIT)
  const [played, aired] = await Promise.all([recent('played_at'), recent('aired_at')])
  const rows = [...played.slice(0, WARM_PLAYED), ...aired]
    .filter((row) => isLibraryMember(row) && row.status !== 'failed')
  return {
    showKeys: [...new Set(rows.map(groupKeyOf).filter(Boolean))].slice(0, WARM_SHOWS),
    recordingIds: [...new Set(rows.map((row) => row.recording_id))].slice(0, WARM_RECORDINGS),
  }
}

const recordingPoolKeyOf = (row) =>
  `recording:${row.recording_id}:${contentKeyOf(`${row.file_path ?? ''}|${row.image_path ?? ''}|${row.image_url ?? ''}`)}`

const recordingThumbnails = () => {
  recordingThumbnailStore ??= createThumbnailStore({
    dir: path.join(getThumbnailRoot(), RECORDING_THUMBNAIL_DIR),
    maxBytes: RECORDING_THUMBNAIL_MAX_BYTES,
  })
  return recordingThumbnailStore
}

const withIds = (entries) => entries.map((entry) => (entry.origin ? { ...entry, id: imageIdOf(entry.origin) } : entry))

const uniqueByOrigin = (entries) => {
  const seen = new Set()
  return entries.filter((entry) => {
    if (seen.has(entry.origin)) return false
    seen.add(entry.origin)
    return true
  })
}

const newestTitleOf = (rows) => [...rows]
  .sort((a, b) => Number(b.aired_at ?? 0) - Number(a.aired_at ?? 0))[0].title

const showImageUrlOf = ({ title, stamp }) => `/api/epg/show-image?title=${encodeURIComponent(title)}&w=${HERO_WIDTH}${stamp ? `&c=${stamp}` : ''}`

const showPoolBase = (key) => `/api/library/shows/${encodeURIComponent(key)}/art-pool`

const recordingArtBase = (recordingId) => `/api/library/recordings/${encodeURIComponent(recordingId)}/art`

const sendMissing = (res) => {
  res.setHeader('Cache-Control', `public, max-age=${MISSING_IMAGE_MAX_AGE_S}`)
  res.status(404).end()
}

const createMemo = ({ ttlMs, now }) => {
  const values = new Map()
  const get = (key, load) => {
    const cached = values.get(key)
    if (cached && cached.expiresAt > now()) return cached.value
    const value = Promise.resolve().then(load)
    values.set(key, { value, expiresAt: now() + ttlMs })
    value.catch(() => values.delete(key))
    if (values.size > MAX_MEMO_ENTRIES) values.delete(values.keys().next().value)
    return value
  }
  return { get }
}

const createPersistedMemo = ({ store, now, memoryTtlMs, hitTtlMs, missTtlMs }) => {
  const held = new Map()
  const refreshing = new Map()

  const hold = (key, value) => {
    held.set(key, { value, expiresAt: now() + memoryTtlMs })
    if (held.size > MAX_MEMO_ENTRIES) held.delete(held.keys().next().value)
    return value
  }

  const save = async (key, value) => {
    const ttlMs = value.entries.length ? hitTtlMs : missTtlMs
    await store.write({ key, value: { ...value, partial: undefined }, expiresAt: now() + ttlMs }).catch(() => {})
    return value
  }

  const refresh = (key, load, stale) => {
    if (refreshing.has(key)) return refreshing.get(key)
    const pending = Promise.resolve()
      .then(load)
      .then((value) => (value.partial ? stale ?? value : save(key, value)))
      .then((value) => {
        hold(key, Promise.resolve(value))
        return value
      })
      .finally(() => refreshing.delete(key))
    refreshing.set(key, pending)
    return pending
  }

  const resolve = async (key, load) => {
    const saved = await store.read(key).catch(() => null)
    if (!saved) return refresh(key, load)
    if (saved.expiresAt <= now()) refresh(key, load, saved.value).catch(() => {})
    return saved.value
  }

  const get = (key, load, fallback) => {
    const cached = held.get(key)
    if (cached && cached.expiresAt > now()) return cached.value
    return hold(key, resolve(key, load).catch(() => fallback))
  }

  return { get }
}

const plexArtsFor = async ({ url, token, ratingKey }) => {
  const res = await axios.get(`${url}/library/metadata/${encodeURIComponent(ratingKey)}/arts`, {
    params: { 'X-Plex-Token': token },
    headers: { Accept: 'application/json' },
    timeout: REQUEST_TIMEOUT_MS,
    validateStatus: () => true,
  })
  if (res.status >= 400) throw new Error(`Plex HTTP ${res.status}`)
  return res.data?.MediaContainer?.Metadata || []
}

const libraryShowRows = async (key) => (await db('recordings').whereNull('purged_at'))
  .filter((row) => isLibraryMember(row) && row.status !== 'failed' && groupKeyOf(row) === key)

const recordingRow = (recordingId) => db('recordings').where({ recording_id: recordingId }).first()

const databaseCache = {
  read: async (key) => {
    const row = await db('show_artwork').where({ title_key: key }).first()
    return row ? { sources: JSON.parse(row.sources_json), expiresAt: Number(row.expires_at) } : null
  },
  write: ({ key, sources, expiresAt }) => db('show_artwork')
    .insert({ title_key: key, sources_json: JSON.stringify(sources), expires_at: expiresAt })
    .onConflict('title_key')
    .merge(),
}

const databasePoolStore = {
  read: async (key) => {
    const row = await db('art_pools').where({ pool_key: key }).first()
    return row ? { value: JSON.parse(row.value_json), expiresAt: Number(row.expires_at) } : null
  },
  write: ({ key, value, expiresAt }) => db('art_pools')
    .insert({ pool_key: key, value_json: JSON.stringify(value), expires_at: expiresAt })
    .onConflict('pool_key')
    .merge(),
}

let recordingThumbnailStore = null

const HERO_WIDTH = 768
const PLEX_ART_WIDTH = 1280
const PLEX_ART_HEIGHT = 720
const TVMAZE_CACHE_PREFIX = `art-pool:tvmaze-${SERIES_MATCH_VERSION}:`
const MAX_PER_SOURCE = 12
const MAX_POSTERS = 3
const MAX_MEMO_ENTRIES = 500
const REQUEST_TIMEOUT_MS = 5000
const IMAGE_MAX_AGE_S = 24 * 60 * 60
const MISSING_IMAGE_MAX_AGE_S = 5 * 60
const PLEX_TTL_MS = 10 * 60 * 1000
const POOL_TTL_MS = 7 * 24 * 60 * 60 * 1000
const POOL_MISS_TTL_MS = 60 * 60 * 1000
const WARM_DELAY_MS = 15 * 1000
const WARM_ROW_LIMIT = 40
const WARM_SHOWS = 12
const WARM_PLAYED = 4
const WARM_RECORDINGS = 12
const RECORDING_THUMBNAIL_DIR = 'recordings'
const RECORDING_THUMBNAIL_MAX_BYTES = 20 * 1024 * 1024
const TVMAZE_HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000
const TVMAZE_MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000
const TVMAZE_UNHINTED_MISS_TTL_MS = 6 * 60 * 60 * 1000
const HERO_IMAGE_WIDTH = 768
