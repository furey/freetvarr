import axios from 'axios'

import { db, getSetting } from './db.js'
import { artworkKindOf, cachedStateOf, readSizedCache, sizedKeyOf } from './artwork-match.js'
import { createGuideHints, createTitleMatcher } from './programme-ratings.js'
import { externalIdsOf, hasExternalIds, idKeyedCacheKeyOf } from './external-ids.js'
import { currentTimeZone } from './time-zone.js'
import { countryForTimeZone } from './zone-countries.js'
import { storedPlexToken } from './plex.js'
import { POSTER_SHAPE } from './show-poster.js'
import { SERIES_MATCH_VERSION } from './web/artwork-stamps.js'
import { artworkClient } from './fallback-artwork.js'

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
  loadPlexShows = (previous) => plexShowSources({ previous }),
  searchTvmaze = null,
  findSeriesShow = null,
  hintsFor = guideHintsFor,
  externalIdsFor = async () => null,
  loadTvmazeImages = tvmazeImages,
  cache = databaseCache,
  isTvmazeEnabled = tvmazeLookupEnabled,
  countryCode = () => countryForTimeZone(currentTimeZone()),
  now = Date.now,
  plexTtlMs = PLEX_TTL_MS,
  hitTtlMs = TVMAZE_HIT_TTL_MS,
  missTtlMs = TVMAZE_MISS_TTL_MS,
  unhintedMissTtlMs = TVMAZE_UNHINTED_MISS_TTL_MS,
  lookupGapMs = TVMAZE_LOOKUP_GAP_MS,
  failureBackoffMs = TVMAZE_FAILURE_BACKOFF_MS,
  plexWaitMs = PLEX_WAIT_MS,
  onTvmazeShow = () => {},
} = {}) => {
  const plexShows = createExpiringValue({ load: loadPlexShows, ttlMs: plexTtlMs, fallback: new Map(), now })
  const runSpaced = createSpacedQueue({ gapMs: lookupGapMs })
  const inflight = new Map()
  const failedUntil = new Map()
  const findShow = findSeriesShow || seriesShowFinder({ searchTvmaze, countryCode })

  const plexEntrySources = async ({ key, title, kind, shape }) => {
    const entry = await plexEntryFor({ entries: (await plexShows.get()).get(key) || [], title, kind })
    if (!entry) return []
    return shape === POSTER_SHAPE ? entry.posters ?? entry.sources : entry.sources
  }

  const plexEntryFor = async ({ entries, title, kind }) => {
    const film = entries.find((entry) => entry.section === PLEX_MOVIES) ?? null
    if (isFilmKind(kind)) return film
    const show = entries.find((entry) => entry.section !== PLEX_MOVIES)
    if (show) return show
    return film && !(await hasEpisodeDetails(title)) ? film : null
  }

  const hasEpisodeDetails = async (title) => Boolean((await Promise.resolve().then(() => hintsFor(title)).catch(() => null))?.isEpisode)

  const recentlyFailed = (key) => (failedUntil.get(key) || 0) > now()

  const tvmazeLookupOf = async ({ key, title }) => {
    const ids = await externalIdsOf({ externalIdsFor, title, kind: null })
    return { cacheKey: idKeyedCacheKeyOf({ cacheKey: seriesCacheKeyOf(key), ids }), ids, title }
  }

  const cachedTvmazeSources = async (cacheKey) => {
    const cached = await readSizedCache({ read: cache.read, key: cacheKey })
    const state = cachedStateOf({ cached, nowMs: now(), hitTtlMs, hasValue: Boolean(cached?.sources?.length) })
    return state === 'missing' ? { stale: false, sources: null } : { stale: state === 'stale', sources: cached.sources }
  }

  const tvmazeSourcesFor = async ({ key, title }) => {
    if (!(await isTvmazeEnabled())) return []
    const lookup = await tvmazeLookupOf({ key, title })
    const cached = await cachedTvmazeSources(lookup.cacheKey)
    refreshStale({ cached, lookup })
    if (cached.sources) return cached.sources
    if (recentlyFailed(lookup.cacheKey)) return []
    return startTvmazeLookup(lookup)
  }

  const refreshStale = ({ cached, lookup }) => {
    if (cached.stale && !recentlyFailed(lookup.cacheKey)) startTvmazeLookup({ ...lookup, refreshingHit: Boolean(cached.sources?.length) })
  }

  const startTvmazeLookup = ({ cacheKey, ids, title, refreshingHit = false }) => {
    if (inflight.has(cacheKey)) return inflight.get(cacheKey)
    const pending = runSpaced(() => lookUpTvmaze({ title, ids }))
      .then(async ({ sources, hinted }) => {
        if (!sources.length && refreshingHit && !hinted && !hasExternalIds(ids)) throw new Error('refresh had no guide details')
        const missMs = hinted ? missTtlMs : unhintedMissTtlMs
        const expiresAt = now() + (sources.length ? hitTtlMs : missMs)
        await cache.write({ key: sizedKeyOf(cacheKey), sources, expiresAt }).catch(() => {})
        return sources
      })
      .catch(() => {
        failedUntil.set(cacheKey, now() + failureBackoffMs)
        return []
      })
      .finally(() => inflight.delete(cacheKey))
    inflight.set(cacheKey, pending)
    return pending
  }

  const lookUpTvmaze = async ({ title, ids }) => {
    const hints = await Promise.resolve().then(() => hintsFor(title)).catch(() => null)
    const show = await findShow({ title, hints, ids })
    if (!show) return { sources: [], hinted: Boolean(hints) }
    Promise.resolve().then(() => onTvmazeShow({ title, show })).catch(() => {})
    const images = await loadTvmazeImages(show.id)
    return { sources: tvmazeSourcesOf({ show, images }), hinted: Boolean(hints) }
  }

  const sourcesFor = async (title, { kind = null, shape = null } = {}) => {
    const key = showTitleKey(title)
    if (!key) return []
    const fromPlex = await plexEntrySources({ key, title, kind, shape }).catch(() => [])
    if (fromPlex.length || isFilmKind(kind)) return fromPlex
    return tvmazeSourcesFor({ key, title })
  }

  const plexSourcesFor = async (title, { kind = null, shape = null } = {}) => {
    const key = showTitleKey(title)
    return key ? plexEntrySources({ key, title, kind, shape }).catch(() => []) : []
  }

  const plexArtworkFor = async (title, { kind = null, shape = null } = {}) => {
    const fromPlex = await withinMs(plexSourcesFor(title, { kind, shape }), plexWaitMs)
    return fromPlex === TIMED_OUT ? PENDING_ARTWORK : { sources: fromPlex, pending: false }
  }

  const artworkFor = async (title, { kind = null, shape = null } = {}) => {
    const key = showTitleKey(title)
    if (!key) return NO_ARTWORK
    const fromPlex = await plexArtworkFor(title, { kind, shape })
    if (fromPlex.pending || fromPlex.sources.length) return fromPlex
    return isFilmKind(kind) ? NO_ARTWORK : tvmazeArtworkFor(title)
  }

  const tvmazeArtworkFor = async (title) => {
    const key = showTitleKey(title)
    if (!key || !(await isTvmazeEnabled())) return NO_ARTWORK
    const lookup = await tvmazeLookupOf({ key, title })
    const cached = await cachedTvmazeSources(lookup.cacheKey)
    refreshStale({ cached, lookup })
    if (cached.sources) return { sources: cached.sources, pending: false }
    if (recentlyFailed(lookup.cacheKey)) return NO_ARTWORK
    startTvmazeLookup(lookup)
    return PENDING_ARTWORK
  }

  const forget = async (title) => {
    const key = showTitleKey(title)
    if (!key) return
    const { cacheKey: idKey } = await tvmazeLookupOf({ key, title })
    for (const cacheKey of new Set([seriesCacheKeyOf(key), idKey])) {
      failedUntil.delete(cacheKey)
      await cache.remove?.(sizedKeyOf(cacheKey)).catch(() => {})
      await cache.remove?.(cacheKey).catch(() => {})
    }
    plexShows.reset()
  }

  return { sourcesFor, artworkFor, tvmazeArtworkFor, plexSourcesFor, plexArtworkFor, forget }
}

const isFilmKind = (kind) => Boolean(artworkKindOf(kind))

const withinMs = (promise, ms) => Promise.race([
  promise,
  new Promise((resolve) => setTimeout(resolve, ms, TIMED_OUT).unref?.()),
])

export const seriesShowFinder = ({ searchTvmaze = null, countryCode } = {}) => {
  let matcher = null
  return ({ title, hints, ids = null }) => {
    matcher ??= createTitleMatcher({ ...(countryCode ? { countryCode } : {}), ...(searchTvmaze ? { searchTvmaze } : {}) })
    return matcher.tvmazeShow({ title, hints, ids })
  }
}

export const guideHintsFor = (title) => {
  sharedGuideHints ??= createGuideHints({ loadGuide: async () => (await import('./epg.js')).getGuideSnapshot() })
  return sharedGuideHints(title)
}

export const seriesCacheKeyOf = (key) => `${SERIES_MATCH_VERSION}:${key}`

export const widestFirst = (images = []) => [...images].sort((a, b) =>
  heroWidthOf(b) - heroWidthOf(a)
  || Number(Boolean(b.main)) - Number(Boolean(a.main))
  || originalWidthOf(b) - originalWidthOf(a))

export const tvmazeSourcesOf = ({ show, images = [] }) => {
  const [background] = widestFirst(images.filter((image) => image.type === 'background' && image.resolutions?.original?.url))
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
    const posters = [item.thumb, item.art].filter(Boolean).map(sourceOf)
    if (key && sources.length && !byTitle.has(key)) byTitle.set(key, { sources, posters })
  }
  return byTitle
}

export const plexShowSources = async ({ previous = new Map(), loadSettings = plexSettings, listSection = plexSectionItems } = {}) => {
  const { url, token, sections } = await loadSettings()
  if (!url || !token || !sections.length) return new Map()
  const listed = await Promise.allSettled(sections.map(({ id }) => listSection({ url, token, id })))
  if (listed.every((result) => result.status === 'rejected')) throw listed[0].reason
  const entries = new Map()
  const add = (key, entry) => {
    const kept = entries.get(key) || []
    if (!kept.some((other) => other.section === entry.section)) entries.set(key, [...kept, entry])
  }
  sections.forEach((section, at) => {
    if (listed[at].status === 'rejected') {
      for (const [key, saved] of previous) saved.filter((entry) => entry.section === section.kind).forEach((entry) => add(key, entry))
      return
    }
    for (const [key, found] of plexSourcesOf({ items: listed[at].value, url, token })) add(key, { ...found, section: section.kind })
  })
  return entries
}

const plexSettings = async () => ({
  url: ((await getSetting('plex_url')) || '').replace(/\/$/, ''),
  token: await storedPlexToken(),
  sections: [
    { id: await getSetting('plex_tv_section_id'), kind: PLEX_SHOWS },
    { id: await getSetting('plex_movies_section_id'), kind: PLEX_MOVIES },
  ].filter((section) => section.id),
})

const plexSectionItems = async ({ url, token, id }) => {
  const res = await axios.get(`${url}/library/sections/${encodeURIComponent(id)}/all`, {
    params: { 'X-Plex-Token': token },
    headers: { Accept: 'application/json' },
    timeout: PLEX_TIMEOUT_MS,
    validateStatus: () => true,
  })
  if (res.status >= 400) throw new Error(`Plex HTTP ${res.status}`)
  return res.data?.MediaContainer?.Metadata || []
}

export const tvmazeSearch = async (title, { client = artworkClient } = {}) => {
  const results = await client.getJson({ url: `${TVMAZE_API}/search/shows`, params: { q: title } })
  return Array.isArray(results) ? results : []
}

export const tvmazeImages = async (showId, { client = artworkClient } = {}) => {
  const images = await client.getJson({ url: `${TVMAZE_API}/shows/${encodeURIComponent(showId)}/images` })
  return Array.isArray(images) ? images : []
}

export const tvmazeLookupEnabled = async () => (await getSetting('show_artwork_lookup')) !== 'false'

const databaseCache = {
  read: async (key) => {
    const row = await db('show_artwork').where({ title_key: key }).first()
    return row ? { sources: JSON.parse(row.sources_json), expiresAt: Number(row.expires_at) } : null
  },
  write: ({ key, sources, expiresAt }) => db('show_artwork')
    .insert({ title_key: key, sources_json: JSON.stringify(sources), expires_at: expiresAt })
    .onConflict('title_key')
    .merge(),
  remove: (key) => db('show_artwork').where({ title_key: key }).del(),
}

const createExpiringValue = ({ load, ttlMs, fallback, now }) => {
  let value = fallback
  let expiresAt = 0
  let pending = null
  const refresh = () => {
    pending ??= Promise.resolve()
      .then(() => load(value))
      .then((loaded) => { value = loaded })
      .catch(() => {})
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
  const reset = () => { expiresAt = 0 }
  return { get, reset }
}

const createSpacedQueue = ({ gapMs }) => {
  let tail = Promise.resolve()
  return (task) => {
    const run = tail.then(task)
    tail = run.catch(() => {}).then(() => wait(gapMs))
    return run
  }
}

let sharedGuideHints = null

const originalWidthOf = (image) => Number(image?.resolutions?.original?.width) || 0

const heroWidthOf = (image) => Math.min(originalWidthOf(image), HERO_SOURCE_WIDTH)

const TIMED_OUT = Symbol('timed out')
const NO_ARTWORK = { sources: [], pending: false }
const PENDING_ARTWORK = { sources: [], pending: true }

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const TVMAZE_API = 'https://api.tvmaze.com'
const PLEX_TIMEOUT_MS = 15000
const PLEX_SHOWS = 'show'
const PLEX_MOVIES = 'movie'
const PLEX_TTL_MS = 10 * 60 * 1000
const TVMAZE_HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000
const TVMAZE_MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000
const TVMAZE_UNHINTED_MISS_TTL_MS = 6 * 60 * 60 * 1000
const TVMAZE_LOOKUP_GAP_MS = 1000
const TVMAZE_FAILURE_BACKOFF_MS = 10 * 60 * 1000
const PLEX_WAIT_MS = 1500
const HERO_SOURCE_WIDTH = 1920
