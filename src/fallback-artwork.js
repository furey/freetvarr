import { db, getSetting } from './db.js'
import { showTitleKey, tvmazeLookupEnabled } from './show-artwork.js'
import { createOutboundClient, createHostLimiter } from './outbound-http.js'
import {
  articleCandidateIdsOf,
  artworkKindOf,
  candidateIdsOf,
  dominantFilmOf,
  entityQueryOf,
  entityRowsOf,
  hintsForKind,
  lookupExpiryOf,
  matchEvidenceOf,
  pageArtOf,
  rankEntities,
  sharesAnyTerm,
  tmdbAuthOf,
  tmdbCandidatesOf,
  tmdbSearchOf,
  tmdbSourcesOf,
  tmdbTextOf,
  tmdbYearOf,
  titleVariantsOf,
} from './artwork-match.js'

export const TMDB_KEY_SETTING = 'tmdb_api_key'

export const createFallbackArtwork = ({
  lookUp = createArtworkLookup(),
  cache = databaseCache,
  isEnabled = tvmazeLookupEnabled,
  tmdbKey = storedTmdbKey,
  hintsFor = async () => null,
  now = Date.now,
  hitTtlMs = HIT_TTL_MS,
  missTtlMs = MISS_TTL_MS,
  failureBackoffMs = FAILURE_BACKOFF_MS,
  lookupLimiter = createHostLimiter({ concurrency: LOOKUP_CONCURRENCY, maxQueue: LOOKUP_MAX_QUEUE }),
} = {}) => {
  const inflight = new Map()
  const failedUntil = new Map()

  const recentlyFailed = (cacheKey) => (failedUntil.get(cacheKey) || 0) > now()

  const settingsFor = async ({ title, kind }) => {
    const key = showTitleKey(title)
    if (!key || !(await isEnabled())) return null
    const apiKey = await tmdbKey()
    const artworkKind = artworkKindOf(kind)
    return { key, apiKey, kind: artworkKind, cacheKey: cacheKeyOf({ mode: apiKey ? 'tmdb' : 'open', kind: artworkKind, key }) }
  }

  const cachedSources = async (cacheKey) => {
    const cached = await cache.read(cacheKey).catch(() => null)
    return cached && cached.expiresAt > now() ? cached.sources : null
  }

  const startLookup = ({ title, kind, apiKey, cacheKey }) => {
    if (inflight.has(cacheKey)) return inflight.get(cacheKey)
    const pending = lookupLimiter.run(async () =>
      lookUp({ title, hints: hintsForKind({ hints: await hintsFor(title), kind }), apiKey }))
      .then(async (found) => {
        const sources = found?.sources || []
        const expiresAt = lookupExpiryOf({ found: sources.length > 0, nowMs: now(), hitTtlMs, missTtlMs })
        await cache.write({ key: cacheKey, sources, reference: found?.reference || null, expiresAt }).catch(() => {})
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

  const sourcesFor = async (title, { kind = null } = {}) => {
    const settings = await settingsFor({ title, kind })
    if (!settings || recentlyFailed(settings.cacheKey)) return []
    const cached = await cachedSources(settings.cacheKey)
    if (cached) return cached
    return startLookup({ title, ...settings })
  }

  const artworkFor = async (title, { kind = null } = {}) => {
    const settings = await settingsFor({ title, kind })
    if (!settings || recentlyFailed(settings.cacheKey)) return NO_ARTWORK
    const cached = await cachedSources(settings.cacheKey)
    if (cached) return { sources: cached, pending: false }
    startLookup({ title, ...settings })
    return PENDING_ARTWORK
  }

  const forget = async (title) => {
    const key = showTitleKey(title)
    if (!key) return
    for (const mode of ['open', 'tmdb']) {
      for (const kind of [null, artworkKindOf('movie')]) {
        const cacheKey = cacheKeyOf({ mode, kind, key })
        failedUntil.delete(cacheKey)
        await cache.remove?.(cacheKey).catch(() => {})
      }
    }
  }

  return { sourcesFor, artworkFor, forget }
}

export const createArtworkLookup = ({ client = artworkClient } = {}) => {
  const candidatesFor = async (title) => {
    for (const variant of titleVariantsOf(title)) {
      const ids = await wikidataCandidates(variant)
      if (ids.length) return ids
    }
    return []
  }

  const wikidataCandidates = async (title) => {
    const search = await client.getJson({
      url: WIKIDATA_API,
      params: { action: 'wbsearchentities', search: title, language: 'en', uselang: 'en', type: 'item', limit: WIKIDATA_SEARCH_LIMIT, format: 'json' },
    })
    const fromLabels = candidateIdsOf({ results: search?.search, title })
    return fromLabels.length ? fromLabels : wikipediaCandidates(title)
  }

  const wikipediaCandidates = async (title) => {
    const found = await client.getJson({
      url: WIKIPEDIA_API,
      params: {
        action: 'query',
        format: 'json',
        formatversion: 2,
        redirects: 1,
        generator: 'search',
        gsrsearch: title,
        gsrlimit: WIKIPEDIA_SEARCH_LIMIT,
        gsrnamespace: 0,
        prop: 'pageprops',
        ppprop: 'wikibase_item',
      },
    })
    return articleCandidateIdsOf({ pages: found?.query?.pages, title })
  }

  const wikidataEntities = async (ids) => entityRowsOf(await client.getJson({
    url: WIKIDATA_SPARQL,
    params: { query: entityQueryOf(ids), format: 'json' },
    headers: { Accept: 'application/sparql-results+json' },
    timeoutMs: SPARQL_TIMEOUT_MS,
  }))

  const wikipediaPage = async (article) => pageArtOf(await client.getJson({
    url: WIKIPEDIA_API,
    params: {
      action: 'query',
      format: 'json',
      formatversion: 2,
      redirects: 1,
      titles: article,
      prop: 'pageimages|extracts',
      piprop: 'thumbnail|original',
      pithumbsize: WIKIPEDIA_THUMB_WIDTH,
      pilicense: 'any',
      explaintext: 1,
      exsectionformat: 'plain',
    },
  }))

  const verifiedWikipediaMatch = async ({ title, hints }) => {
    if (!hints) return null
    const ids = await candidatesFor(title)
    if (!ids.length) return null
    const ranked = rankEntities({ rows: await wikidataEntities(ids), hints, order: ids })
    for (const entity of ranked) {
      const page = await wikipediaPage(entity.article)
      if (page && matchEvidenceOf({ hints, candidateYear: entity.year, text: page.text }).accepted) return { entity, page }
    }
    return null
  }

  const tmdbGet = ({ apiKey, path, params = {} }) => {
    const auth = tmdbAuthOf(apiKey)
    return client.getJson({ url: `${TMDB_API}${path}`, params: { ...auth.params, ...params }, headers: auth.headers })
  }

  const tmdbDetails = async ({ apiKey, type, id, withCredits = false }) => tmdbGet({
    apiKey,
    path: `/${type}/${encodeURIComponent(id)}`,
    params: { language: 'en-AU', ...(withCredits ? { append_to_response: 'credits' } : {}) },
  })

  const tmdbIdsOf = async ({ apiKey, entity }) => {
    if (entity.tmdbMovie) return { type: 'movie', id: entity.tmdbMovie }
    if (entity.tmdbTv) return { type: 'tv', id: entity.tmdbTv }
    if (!entity.imdb) return null
    const found = await tmdbGet({ apiKey, path: `/find/${encodeURIComponent(entity.imdb)}`, params: { external_source: 'imdb_id' } })
    const movie = found?.movie_results?.[0]
    const show = found?.tv_results?.[0]
    if (movie) return { type: 'movie', id: movie.id }
    return show ? { type: 'tv', id: show.id } : null
  }

  const tmdbForEntity = async ({ apiKey, entity }) => {
    const ids = await tmdbIdsOf({ apiKey, entity })
    if (!ids) return null
    const sources = tmdbSourcesOf(await tmdbDetails({ apiKey, ...ids }))
    return sources.length ? { sources, reference: `tmdb:${ids.type}:${ids.id}` } : null
  }

  const tmdbSearch = async ({ apiKey, title, hints }) => {
    if (!hints) return null
    for (const variant of titleVariantsOf(title)) {
      const found = await tmdbSearchFor({ apiKey, title: variant, hints })
      if (found) return found
    }
    return null
  }

  const tmdbSearchFor = async ({ apiKey, title, hints }) => {
    const search = tmdbSearchOf({ title, hints })
    const found = await tmdbGet({ apiKey, path: search.path, params: { ...search.params, include_adult: 'false', language: 'en-AU' } })
    const results = (found?.results || []).map((result) => ({ ...result, media_type: result.media_type || search.mediaType }))
    const unproven = []
    for (const result of tmdbCandidatesOf({ results, title, hints })) {
      const details = await tmdbDetails({ apiKey, type: result.media_type, id: result.id, withCredits: true })
      if (!details) continue
      const evidence = matchEvidenceOf({ hints, candidateYear: tmdbYearOf(details), text: tmdbTextOf(details) })
      const sources = evidence.accepted ? tmdbSourcesOf(details) : []
      if (sources.length) return { sources, reference: `tmdb:${result.media_type}:${result.id}` }
      if (result.media_type === 'movie' && evidence.reason === 'no-evidence') unproven.push({ details, id: result.id })
    }
    if (hints.kind !== 'movie') return null
    const dominant = dominantFilmOf(unproven.map(({ details }) => details))
    if (!dominant || !sharesAnyTerm({ hints, text: tmdbTextOf(dominant) })) return null
    const sources = tmdbSourcesOf(dominant)
    return sources.length ? { sources, reference: `tmdb:movie:${dominant.id}` } : null
  }

  return async ({ title, hints, apiKey }) => {
    const attempt = await verifiedWikipediaMatch({ title, hints }).then((match) => ({ match }), (error) => ({ error }))
    if (attempt.error) {
      const fromSearch = apiKey ? await tmdbSearch({ apiKey, title, hints }).catch(() => null) : null
      if (fromSearch) return fromSearch
      throw attempt.error
    }
    const { match } = attempt
    if (match && apiKey) {
      const fromTmdb = await tmdbForEntity({ apiKey, entity: match.entity }).catch(() => null)
      if (fromTmdb) return fromTmdb
    }
    if (match?.page.image) return { sources: [match.page.image], reference: `wikidata:${match.entity.id}` }
    if (!match && apiKey) return tmdbSearch({ apiKey, title, hints })
    return null
  }
}

export const validateTmdbKey = async ({ apiKey, client = artworkClient }) => {
  const auth = tmdbAuthOf(apiKey)
  if (!auth) return { ok: false, reason: 'empty' }
  client.resetHost(TMDB_API_HOST)
  try {
    const body = await client.getJson({
      url: `${TMDB_API}/configuration`,
      params: auth.params,
      headers: auth.headers,
      retries: 0,
    })
    return body?.images ? { ok: true } : { ok: false, reason: 'unexpected' }
  } catch (err) {
    return { ok: false, reason: err.status === 401 ? 'invalid' : 'unreachable' }
  }
}

export const isFallbackImageSource = (source) => artworkClient.isAllowedUrl(source)
  && IMAGE_HOSTS.has(new URL(source).hostname)

export const fetchFallbackImage = (source) => artworkClient.getImage({ url: source }).catch(() => null)

const cacheKeyOf = ({ mode, kind, key }) => (kind ? `${mode}:${kind}:${key}` : `${mode}:${key}`)

export const storedTmdbKey = async () => String((await getSetting(TMDB_KEY_SETTING)) || '').trim() || null

const databaseCache = {
  read: async (key) => {
    const row = await db('artwork_lookups').where({ lookup_key: key }).first()
    return row ? { sources: JSON.parse(row.sources_json), expiresAt: Number(row.expires_at) } : null
  },
  write: ({ key, sources, reference, expiresAt }) => db('artwork_lookups')
    .insert({ lookup_key: key, sources_json: JSON.stringify(sources), reference, expires_at: expiresAt })
    .onConflict('lookup_key')
    .merge(),
  remove: (key) => db('artwork_lookups').where({ lookup_key: key }).del(),
}

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php'
const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql'
const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php'
const TMDB_API_HOST = 'api.themoviedb.org'
export const TMDB_API = `https://${TMDB_API_HOST}/3`
const IMAGE_HOSTS = new Set(['upload.wikimedia.org', 'image.tmdb.org'])

export const artworkClient = createOutboundClient({
  hosts: {
    'www.wikidata.org': { concurrency: 2, gapMs: 200 },
    'query.wikidata.org': { concurrency: 1, gapMs: 1000 },
    'en.wikipedia.org': { concurrency: 2, gapMs: 200 },
    'upload.wikimedia.org': { concurrency: 2, gapMs: 250 },
    [TMDB_API_HOST]: { concurrency: 4, gapMs: 50 },
    'image.tmdb.org': { concurrency: 4, gapMs: 50 },
    'api.tvmaze.com': { concurrency: 1, gapMs: 500 },
  },
})

const NO_ARTWORK = { sources: [], pending: false }
const PENDING_ARTWORK = { sources: [], pending: true }
const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000
const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000
const FAILURE_BACKOFF_MS = 10 * 60 * 1000
const LOOKUP_CONCURRENCY = 2
const LOOKUP_MAX_QUEUE = 300
const WIKIDATA_SEARCH_LIMIT = 10
const WIKIPEDIA_SEARCH_LIMIT = 5
const WIKIPEDIA_THUMB_WIDTH = 960
const SPARQL_TIMEOUT_MS = 20000
