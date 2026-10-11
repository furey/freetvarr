import axios from 'axios'

import { db, getSetting } from './db.js'
import { currentTimeZone } from './time-zone.js'
import { countryForTimeZone } from './zone-countries.js'

export const showTitleKey = (title) => String(title || '')
  .normalize('NFKD')
  .replace(/\p{M}/gu, '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/\(\d{4}\)/g, ' ')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()
  .replace(/(.)\s+\d{4}$/, '$1')
  .replace(/^the\s+/, '')

export const createShowArtwork = ({
  loadPlexShows = plexShowSources,
  searchTvmaze = tvmazeSearch,
  loadTvmazeImages = tvmazeImages,
  cache = databaseCache,
  isTvmazeEnabled = tvmazeLookupEnabled,
  countryCode = () => countryForTimeZone(currentTimeZone()),
  now = Date.now,
  plexTtlMs = PLEX_TTL_MS,
  hitTtlMs = TVMAZE_HIT_TTL_MS,
  missTtlMs = TVMAZE_MISS_TTL_MS,
  lookupGapMs = TVMAZE_LOOKUP_GAP_MS,
  failureBackoffMs = TVMAZE_FAILURE_BACKOFF_MS,
  plexWaitMs = PLEX_WAIT_MS,
} = {}) => {
  const plexShows = createExpiringValue({ load: loadPlexShows, ttlMs: plexTtlMs, fallback: new Map(), now })
  const runSpaced = createSpacedQueue({ gapMs: lookupGapMs })
  const inflight = new Map()
  const failedUntil = new Map()

  const plexSourcesFor = async (key) => (await plexShows.get()).get(key) || []

  const recentlyFailed = (key) => (failedUntil.get(key) || 0) > now()

  const cachedTvmazeSources = async (key) => {
    const cached = await cache.read(key).catch(() => null)
    return cached && cached.expiresAt > now() ? cached.sources : null
  }

  const tvmazeSourcesFor = async ({ key, title }) => {
    if (!(await isTvmazeEnabled()) || recentlyFailed(key)) return []
    const cached = await cachedTvmazeSources(key)
    if (cached) return cached
    if (inflight.has(key)) return inflight.get(key)
    const pending = runSpaced(() => lookUpTvmaze({ key, title }))
      .then(async (sources) => {
        const expiresAt = now() + (sources.length ? hitTtlMs : missTtlMs)
        await cache.write({ key, sources, expiresAt }).catch(() => {})
        return sources
      })
      .catch(() => {
        failedUntil.set(key, now() + failureBackoffMs)
        return []
      })
      .finally(() => inflight.delete(key))
    inflight.set(key, pending)
    return pending
  }

  const lookUpTvmaze = async ({ key, title }) => {
    const show = pickShow({ results: await searchTvmaze(title), key, country: countryCode() })
    if (!show) return []
    const images = await loadTvmazeImages(show.id).catch(() => [])
    return tvmazeSourcesOf({ show, images })
  }

  const sourcesFor = async (title) => {
    const key = showTitleKey(title)
    if (!key) return []
    const fromPlex = await plexSourcesFor(key).catch(() => [])
    if (fromPlex.length) return fromPlex
    return tvmazeSourcesFor({ key, title })
  }

  const artworkFor = async (title) => {
    const key = showTitleKey(title)
    if (!key) return NO_ARTWORK
    const fromPlex = await withinMs(plexSourcesFor(key).catch(() => []), plexWaitMs)
    if (fromPlex === TIMED_OUT) return PENDING_ARTWORK
    if (fromPlex.length) return { sources: fromPlex, pending: false }
    if (!(await isTvmazeEnabled()) || recentlyFailed(key)) return NO_ARTWORK
    const cached = await cachedTvmazeSources(key)
    if (cached) return { sources: cached, pending: false }
    tvmazeSourcesFor({ key, title })
    return PENDING_ARTWORK
  }

  return { sourcesFor, artworkFor }
}

const withinMs = (promise, ms) => Promise.race([
  promise,
  new Promise((resolve) => setTimeout(resolve, ms, TIMED_OUT).unref?.()),
])

export const pickShow = ({ results = [], key, country }) => {
  const matches = results
    .map((result) => result.show)
    .filter((show) => show?.image && showTitleKey(show.name) === key)
  return matches.find((show) => countryOf(show) === country) || matches[0] || null
}

export const tvmazeSourcesOf = ({ show, images = [] }) => {
  const backgrounds = images.filter((image) => image.type === 'background')
  const background = backgrounds.find((image) => image.main) || backgrounds[0]
  return [
    background?.resolutions?.original?.url,
    show.image?.original || show.image?.medium,
  ].filter(Boolean)
}

export const plexSourcesOf = ({ items = [], url, token }) => {
  const byTitle = new Map()
  const sourceOf = (path) => `${url}${path}?X-Plex-Token=${encodeURIComponent(token)}`
  for (const item of items) {
    const key = showTitleKey(item.title)
    const sources = [item.art, item.thumb].filter(Boolean).map(sourceOf)
    if (key && sources.length && !byTitle.has(key)) byTitle.set(key, sources)
  }
  return byTitle
}

const countryOf = (show) => show.network?.country?.code || show.webChannel?.country?.code || null

const plexShowSources = async () => {
  const url = ((await getSetting('plex_url')) || '').replace(/\/$/, '')
  const token = await getSetting('plex_token')
  const sectionIds = [await getSetting('plex_tv_section_id'), await getSetting('plex_movies_section_id')]
    .filter(Boolean)
  if (!url || !token || !sectionIds.length) return new Map()
  const sections = await Promise.all(sectionIds.map((id) => plexSectionItems({ url, token, id })))
  return plexSourcesOf({ items: sections.flat(), url, token })
}

const plexSectionItems = async ({ url, token, id }) => {
  const res = await axios.get(`${url}/library/sections/${encodeURIComponent(id)}/all`, {
    params: { 'X-Plex-Token': token },
    headers: { Accept: 'application/json' },
    timeout: REQUEST_TIMEOUT_MS,
    validateStatus: () => true,
  })
  if (res.status >= 400) throw new Error(`Plex HTTP ${res.status}`)
  return res.data?.MediaContainer?.Metadata || []
}

const tvmazeSearch = async (title) => {
  const res = await axios.get(`${TVMAZE_API}/search/shows`, {
    params: { q: title },
    timeout: REQUEST_TIMEOUT_MS,
    validateStatus: () => true,
  })
  if (res.status !== 200) throw new Error(`TVmaze HTTP ${res.status}`)
  return Array.isArray(res.data) ? res.data : []
}

const tvmazeImages = async (showId) => {
  const res = await axios.get(`${TVMAZE_API}/shows/${encodeURIComponent(showId)}/images`, {
    timeout: REQUEST_TIMEOUT_MS,
    validateStatus: () => true,
  })
  return res.status === 200 && Array.isArray(res.data) ? res.data : []
}

const tvmazeLookupEnabled = async () => (await getSetting('show_artwork_lookup')) !== 'false'

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

const createExpiringValue = ({ load, ttlMs, fallback, now }) => {
  let value = fallback
  let expiresAt = 0
  let pending = null
  const refresh = () => {
    pending ??= Promise.resolve()
      .then(load)
      .then((loaded) => { value = loaded })
      .catch(() => { value = fallback })
      .finally(() => {
        expiresAt = now() + ttlMs
        pending = null
      })
    return pending
  }
  const get = async () => {
    if (expiresAt <= now()) await refresh()
    return value
  }
  return { get }
}

const createSpacedQueue = ({ gapMs }) => {
  let tail = Promise.resolve()
  return (task) => {
    const run = tail.then(task)
    tail = run.catch(() => {}).then(() => wait(gapMs))
    return run
  }
}

const TIMED_OUT = Symbol('timed out')
const NO_ARTWORK = { sources: [], pending: false }
const PENDING_ARTWORK = { sources: [], pending: true }

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const TVMAZE_API = 'https://api.tvmaze.com'
const REQUEST_TIMEOUT_MS = 5000
const PLEX_TTL_MS = 10 * 60 * 1000
const TVMAZE_HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000
const TVMAZE_MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000
const TVMAZE_LOOKUP_GAP_MS = 1000
const TVMAZE_FAILURE_BACKOFF_MS = 10 * 60 * 1000
const PLEX_WAIT_MS = 1500
