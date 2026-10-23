import { db, getSetting } from './db.js'
import { showTitleKey } from './show-artwork.js'
import { createHostLimiter } from './outbound-http.js'
import { artworkClient, storedTmdbKey, TMDB_API } from './fallback-artwork.js'
import { currentTimeZone } from './time-zone.js'
import { countryForTimeZone } from './zone-countries.js'
import { pickReviewSnippet } from './review-snippet.js'
import { linkHealth } from './link-health.js'
import { lookupAllowed } from './lookup-gate.js'
import { SERIES_MATCH_VERSION } from './web/artwork-stamps.js'
import {
  artworkKindOf,
  cachedStateOf,
  dominantFilmOf,
  episodeTitleKeyOf,
  hintsForKind,
  lookupExpiryOf,
  matchEvidenceOf,
  programmeHintsByTitle,
  readSizedCache,
  sharesAnyTerm,
  sharesNetwork,
  tmdbAirsOnGuideChannel,
  tmdbAuthOf,
  tmdbCandidatesOf,
  tmdbSearchOf,
  tmdbTextOf,
  tmdbYearOf,
  titleVariantsOf,
  TMDB_FIRST_SAVED_AFTER_MS,
} from './artwork-match.js'

export const RATINGS_SETTING = 'ratings_lookup_enabled'
export const REVIEWS_SETTING = 'reviews_lookup_enabled'

export const ratingsLookupEnabled = async () => (await getSetting(RATINGS_SETTING)) !== 'false'

export const reviewsLookupEnabled = async () => (await getSetting(REVIEWS_SETTING)) !== 'false'

export const createProgrammeRatings = ({
  lookUp = createRatingsLookup(),
  cache = databaseCacheOf('programme_ratings'),
  ratingsEnabled = ratingsLookupEnabled,
  reviewsEnabled = reviewsLookupEnabled,
  tmdbKey = storedTmdbKey,
  hintsFor = async () => null,
  now = Date.now,
  hitTtlMs = HIT_TTL_MS,
  missTtlMs = MISS_TTL_MS,
  failureBackoffMs = FAILURE_BACKOFF_MS,
  lookupLimiter = createHostLimiter({ concurrency: LOOKUP_CONCURRENCY, maxQueue: LOOKUP_MAX_QUEUE }),
  waitMs = 0,
  linkOf = linkHealth.linkOf,
  staleBeforeMs = TMDB_FIRST_SAVED_AFTER_MS,
  isAllowed = lookupAllowed,
} = {}) => {
  const lookups = createBackgroundLookups({ lookUp, cache, hintsFor, now, hitTtlMs, missTtlMs, failureBackoffMs, lookupLimiter, waitMs, isOutdated: lacksFilmLanguage, staleBeforeMs, isAllowed })

  const settingsFor = async ({ title, kind, year }) => {
    const key = showTitleKey(title)
    if (!key) return null
    const [ratingsOn, reviewsOn] = await Promise.all([ratingsEnabled(), reviewsEnabled()])
    if (!ratingsOn && !reviewsOn) return null
    const apiKey = await tmdbKey()
    const ratingKind = artworkKindOf(kind)
    if (ratingKind && !apiKey) return null
    const filmYear = ratingKind ? year : null
    const cacheKey = lookupCacheKeyOf({ mode: apiKey ? 'tmdb' : 'open', kind: ratingKind, key, year: filmYear })
    return { apiKey, kind: ratingKind, year: filmYear, cacheKey, ratingsOn, reviewsOn }
  }

  const ratingsFor = async (title, { kind = null, year = null, wait = true } = {}) => {
    const settings = await settingsFor({ title, kind, year })
    if (!settings) return NO_RATINGS
    const { status, found } = await lookups.foundFor({ title, ...settings, wait })
    if (status === 'pending') return PENDING_RATINGS
    return status === 'ready' ? ratingsResponseOf({ found: withLiveLinksOf({ found, linkOf }), ...settings }) : NO_RATINGS
  }

  const forget = async (title) => {
    const key = showTitleKey(title)
    if (!key) return
    for (const mode of ['open', 'tmdb']) {
      for (const kind of [null, artworkKindOf('movie')]) await lookups.forget(lookupCacheKeyOf({ mode, kind, key }))
    }
  }

  const warmQueue = new Map()
  let warming = null

  const warm = (programmes = []) => {
    for (const programme of programmes.filter((candidate) => candidate?.title)) {
      const key = `${artworkKindOf(programme.kind) || ''}|${showTitleKey(programme.title)}`
      if (!warmQueue.has(key) && warmQueue.size < MAX_WARM_QUEUE) warmQueue.set(key, programme)
    }
    warming ??= warmQueued().finally(() => { warming = null })
    return warming
  }

  const warmQueued = async () => {
    while (warmQueue.size) {
      const [key, programme] = warmQueue.entries().next().value
      warmQueue.delete(key)
      const settings = await settingsFor({ title: programme.title, kind: programme.kind, year: null }).catch(() => null)
      if (settings) await lookups.warm({ title: programme.title, ...settings }).catch(() => null)
    }
  }

  return { ratingsFor, forget, warm }
}

export const createBackgroundLookups = ({
  lookUp, cache, hintsFor, now, hitTtlMs, missTtlMs, failureBackoffMs, lookupLimiter, waitMs = 0, isOutdated = () => false, staleBeforeMs = 0, isAllowed = async () => true,
}) => {
  const inflight = new Map()
  const failedUntil = new Map()

  const recentlyFailed = (cacheKey) => {
    const until = failedUntil.get(cacheKey)
    if (until === undefined) return false
    if (until > now()) return true
    failedUntil.delete(cacheKey)
    return false
  }

  const noteFailure = ({ cacheKey, error }) => {
    if (error?.code === 'queue-full') return
    failedUntil.delete(cacheKey)
    failedUntil.set(cacheKey, now() + failureBackoffMs)
    while (failedUntil.size > MAX_FAILED_KEYS) failedUntil.delete(failedUntil.keys().next().value)
  }

  const cachedFound = async (cacheKey) => {
    const cached = await cache.read(cacheKey).catch(() => null)
    const state = cachedStateOf({ cached, nowMs: now(), hitTtlMs, hasValue: Boolean(cached?.found), staleBeforeMs })
    return state === 'missing' ? null : { ...cached, stale: state === 'stale' }
  }

  const startLookup = ({ title, kind, year, apiKey, cacheKey, isBackground = false }) => {
    if (inflight.has(cacheKey)) {
      if (!isBackground) lookupLimiter.promote?.(cacheKey)
      return inflight.get(cacheKey)
    }
    const pending = lookupLimiter.run(async () =>
      lookUp({ title, kind, year, hints: hintsForKind({ hints: await hintsFor(title), kind }), apiKey }), { isBackground, id: cacheKey })
      .then(async (found) => {
        const result = found?.missReason ? null : found || null
        const expiresAt = lookupExpiryOf({ found: Boolean(result), nowMs: now(), hitTtlMs, missTtlMs })
        await cache.write({ key: cacheKey, found: result, expiresAt, missReason: found?.missReason ?? null }).catch(() => {})
        return result
      })
      .catch((error) => {
        noteFailure({ cacheKey, error })
        return null
      })
      .finally(() => inflight.delete(cacheKey))
    inflight.set(cacheKey, pending)
    return pending
  }

  const foundFor = async ({ cacheKey, wait = true, ...request }) => {
    const cached = await cachedFound(cacheKey)
    const refresh = cached && (cached.stale || isOutdated(cached.found)) && !recentlyFailed(cacheKey)
    if (refresh) startLookup({ cacheKey, ...request })
    if (cached) return { status: 'ready', found: cached.found }
    if (recentlyFailed(cacheKey)) return PENDING_LOOKUP
    if (!inflight.has(cacheKey) && !(await isAllowed(request.title))) return NO_LOOKUP
    const lookup = startLookup({ cacheKey, ...request })
    if (!wait || waitMs <= 0) return PENDING_LOOKUP
    const settled = await settledWithin({ promise: lookup, ms: waitMs })
    if (!settled.done || recentlyFailed(cacheKey)) return PENDING_LOOKUP
    return { status: 'ready', found: settled.value }
  }

  const warm = async ({ cacheKey, ...request }) => {
    const cached = await cachedFound(cacheKey)
    if (cached && !cached.stale && !isOutdated(cached.found)) return
    if (recentlyFailed(cacheKey) || !(await isAllowed(request.title))) return
    await startLookup({ cacheKey, ...request, isBackground: true })
  }

  const forget = async (cacheKey) => {
    for (const key of [...failedUntil.keys()]) {
      if (key === cacheKey || key.startsWith(`${cacheKey}@`)) failedUntil.delete(key)
    }
    await cache.remove?.(cacheKey).catch(() => {})
    await cache.removeDated?.(cacheKey).catch(() => {})
  }

  return { foundFor, warm, forget }
}

export const forYouProgrammesOf = (result) => [result?.topPick, ...(result?.sections || []).flatMap((section) => section.items || [])]
  .filter(Boolean)
  .map((item) => ({ title: item.title, kind: item.programmeKind ?? null }))

export const upcomingProgrammesOf = ({ guide, nowMs, windowMs }) => [...(guide?.programByEventId?.values() || [])]
  .filter((programme) => programme.end > nowMs && programme.start < nowMs + windowMs)

export const upcomingFilmsOf = ({ guide, nowMs, windowMs = WEEK_MS }) => upcomingProgrammesOf({ guide, nowMs, windowMs })
  .filter((programme) => programme.kind === 'movie')

export const withLiveLinksOf = ({ found, linkOf }) => (found
  ? { ...found, url: linkOf(found.url), reviews: found.reviews ? { ...found.reviews, url: linkOf(found.reviews.url) } : null }
  : found)

export const ratingsResponseOf = ({ found, ratingsOn = true, reviewsOn = true }) => {
  const scored = ratingsOn && found?.score != null
  const reviews = reviewsOn && found?.reviews ? found.reviews : null
  if (!scored && !reviews) return NO_RATINGS
  return {
    status: 'ready',
    score: scored ? found.score : null,
    votes: scored ? found.votes ?? null : null,
    source: scored ? found.source : null,
    url: scored ? found.url : null,
    reviews,
  }
}

export const createRatingsLookup = ({
  client = artworkClient,
  countryCode = () => countryForTimeZone(currentTimeZone()),
  knownReference = storedTmdbReference,
  matcher = createTitleMatcher({ client, countryCode, knownReference }),
} = {}) => {
  const filmRatings = async ({ title, hints, apiKey, year }) => {
    const details = await matcher.matchedFilm({ title, hints, apiKey, year })
    if (!details) return missOf(hints || year ? 'no-match' : 'no-guide-details')
    return filmRatingsOf(details) || missOf('no-score')
  }

  const seriesRatings = async ({ title, hints, apiKey }) => {
    const tmdb = await settledOf(matcher.matchedSeries({ title, hints, apiKey }))
    const fromTmdb = tmdb.value
    if (fromTmdb?.type && !isCinematicSeries({ tmdbType: fromTmdb.type })) return missOf('not-story', fromTmdb.type)
    const rated = fromTmdb?.type ? tmdbSeriesRatingsOf(fromTmdb) : null
    if (rated?.score != null) return rated
    const found = await tvmazeSeriesRatings({ title, hints, apiKey, fromTmdb })
    if (tmdb.error && found?.missReason && !found.missReason.startsWith('not-story')) throw tmdb.error
    return found?.missReason && rated ? rated : found
  }

  const tvmazeSeriesRatings = async ({ title, hints, apiKey, fromTmdb }) => {
    const show = await matcher.tvmazeShow({ title, hints })
    if (!show) return missOf('no-match')
    if (show.type && !isCinematicSeries({ tvmazeType: show.type })) return missOf('not-story', show.type)
    const details = fromTmdb || await matcher.tmdbShow({ title, show, apiKey })
    if (!show.type && !isCinematicSeries({ tmdbType: details?.type })) return missOf('not-story', details?.type || 'unknown')
    return seriesRatingsOf({ show, details }) || missOf('no-score')
  }

  return async ({ title, kind, hints, apiKey, year = null }) => (artworkKindOf(kind)
    ? filmRatings({ title, hints, apiKey, year })
    : seriesRatings({ title, hints, apiKey }))
}

export const createTitleMatcher = ({
  client = artworkClient,
  countryCode = () => countryForTimeZone(currentTimeZone()),
  knownReference = storedTmdbReference,
  searchTvmaze = (query) => client.getJson({ url: `${TVMAZE_API}/search/shows`, params: { q: query } }),
} = {}) => {
  const tmdbGet = ({ apiKey, path, params = {} }) => {
    const auth = tmdbAuthOf(apiKey)
    return client.getJson({ url: `${TMDB_API}${path}`, params: { ...auth.params, ...params }, headers: auth.headers })
  }

  const tmdbDetails = ({ apiKey, type, id }) => tmdbGet({
    apiKey,
    path: `/${type}/${encodeURIComponent(id)}`,
    params: { language: TMDB_LANGUAGE, append_to_response: 'credits,reviews' },
  })

  const matchedFilm = async ({ title, hints, apiKey, year = null }) => {
    const known = await knownReference({ title, kind: FILM_KIND })
    if (known?.type === 'movie') {
      const details = await tmdbDetails({ apiKey, type: 'movie', id: known.id })
      if (details && releaseYearFits({ details, year })) return details
    }
    if (!hints) return year ? datedFilm({ title, apiKey, year }) : null
    for (const variant of titleVariantsOf(title)) {
      const found = await searchedFilm({ title: variant, hints, apiKey, year })
      if (found) return found
    }
    return null
  }

  const datedFilm = async ({ title, apiKey, year }) => {
    const found = await tmdbGet({ apiKey, path: '/search/movie', params: { query: title, year, include_adult: 'false', language: TMDB_LANGUAGE } })
    const key = showTitleKey(title)
    const exact = (found?.results || []).filter((result) => showTitleKey(result.title) === key || showTitleKey(result.original_title) === key)
    const dated = exact.filter((result) => releaseYearFits({ details: result, year }))
    return dated.length === 1 ? tmdbDetails({ apiKey, type: 'movie', id: dated[0].id }) : null
  }

  const searchedFilm = async ({ title, hints, apiKey, year }) => {
    const search = tmdbSearchOf({ title, hints })
    const found = await tmdbGet({ apiKey, path: search.path, params: { ...search.params, include_adult: 'false', language: TMDB_LANGUAGE } })
    const results = (found?.results || []).map((result) => ({ ...result, media_type: result.media_type || search.mediaType }))
    const fitting = []
    for (const result of tmdbCandidatesOf({ results, title, hints })) {
      const details = await tmdbDetails({ apiKey, type: 'movie', id: result.id })
      if (!details || !releaseYearFits({ details, year })) continue
      if (filmEvidenceAccepted({ details, hints })) return details
      fitting.push(details)
    }
    const dominant = dominantFilmOf(fitting)
    return dominant && sharesAnyTerm({ hints, text: tmdbTextOf(dominant) }) ? dominant : null
  }

  const tvmazeShow = async ({ title, hints }) => {
    for (const variant of titleVariantsOf(title)) {
      const results = await searchTvmaze(variant)
      const key = showTitleKey(variant)
      const show = pickRatedShow({ results: results || [], key, hints, country: countryCode() })
        || await episodeMatchedShow({ candidates: exactShowsOf({ results: results || [], key }), hints })
      if (show) return show
    }
    return null
  }

  const episodeMatchedShow = async ({ candidates, hints }) => {
    const wanted = new Set(hints?.episodeTitles || [])
    if (!wanted.size || candidates.length > MAX_EPISODE_CHECKS) return null
    const matched = []
    for (const show of candidates) {
      const episodes = await client.getJson({ url: `${TVMAZE_API}/shows/${encodeURIComponent(show.id)}/episodes` })
      if ((episodes || []).some((episode) => wanted.has(episodeTitleKeyOf(episode?.name)))) matched.push(show)
    }
    return matched.length === 1 ? matched[0] : null
  }

  const tmdbShowId = async ({ title, show, apiKey }) => {
    const known = await knownReference({ title, kind: null })
    if (known?.type === 'tv') return known.id
    const imdb = show.externals?.imdb
    if (!imdb) return null
    const found = await tmdbGet({ apiKey, path: `/find/${encodeURIComponent(imdb)}`, params: { external_source: 'imdb_id' } })
    return found?.tv_results?.[0]?.id ?? null
  }

  const tmdbShow = async ({ title, show, apiKey }) => {
    if (!apiKey) return null
    const id = await tmdbShowId({ title, show, apiKey })
    return id == null ? null : tmdbDetails({ apiKey, type: 'tv', id })
  }

  const matchedSeries = async ({ title, hints, apiKey }) => {
    if (!apiKey) return null
    const known = await knownReference({ title, kind: null })
    if (known?.type === 'tv') return tmdbDetails({ apiKey, type: 'tv', id: known.id })
    if (!hints) return null
    for (const variant of titleVariantsOf(title)) {
      const found = await searchedSeries({ title: variant, hints, apiKey })
      if (found) return found
    }
    return null
  }

  const searchedSeries = async ({ title, hints, apiKey }) => {
    const found = await tmdbGet({ apiKey, path: '/search/tv', params: { query: title, include_adult: 'false', language: TMDB_LANGUAGE } })
    const results = (found?.results || []).map((result) => ({ ...result, media_type: 'tv' }))
    const country = countryCode()
    for (const result of tmdbCandidatesOf({ results, title, hints, country })) {
      const details = await tmdbDetails({ apiKey, type: 'tv', id: result.id })
      if (details && tmdbSeriesProven({ details, hints, country })) return details
    }
    return null
  }

  const tvmazeGet = (path) => client.getJson({ url: `${TVMAZE_API}${path}` })

  return { matchedFilm, matchedSeries, tvmazeShow, tmdbShow, tvmazeGet }
}

export const releaseYearFits = ({ details, year }) => {
  if (!year) return true
  const released = tmdbYearOf(details)
  return Boolean(released) && Math.abs(released - year) <= 1
}

export const requestedYearOf = (value) => {
  const year = Number(value)
  return Number.isInteger(year) && year >= MIN_REQUESTED_YEAR && year <= MAX_REQUESTED_YEAR ? year : null
}

export const exactShowsOf = ({ results = [], key }) => results
  .map((result) => result?.show)
  .filter((show) => show && showTitleKey(show.name) === key)

export const pickRatedShow = ({ results = [], key, hints, country }) => {
  const candidates = exactShowsOf({ results, key })
  if (!candidates.length) return null
  const verdicts = candidates.map((show) => ({ show, evidence: tvmazeEvidenceOf({ show, hints }) }))
  const proven = verdicts.find(({ evidence }) => evidence?.accepted)
  if (proven) return proven.show
  const plausible = verdicts.filter(({ evidence }) => !CONTRADICTIONS.has(evidence?.reason))
  const onGuideNetwork = plausible.filter(({ show }) => airsOnGuideChannel({ show, hints, country }))
  if (onGuideNetwork.length === 1) return onGuideNetwork[0].show
  const shortlist = onGuideNetwork.length ? onGuideNetwork : plausible
  const local = shortlist.filter(({ show }) => isLocalShow({ show, country }))
  if (local.length === 1) return local[0].show
  if (candidates.length === 1 && plausible.length === 1) return plausible[0].show
  const english = shortlist.filter(({ show }) => show.language === 'English')
  if (english.length === 1) return english[0].show
  return dominantShowOf(english)
}

const dominantShowOf = (verdicts) => {
  const [top, next] = [...verdicts].sort((a, b) => (b.show.weight || 0) - (a.show.weight || 0))
  if (!top || (top.show.weight || 0) < MIN_DOMINANT_WEIGHT) return null
  return !next || top.show.weight >= (next.show.weight || 0) * DOMINANT_WEIGHT_RATIO ? top.show : null
}

export const isCinematicSeries = ({ tvmazeType = null, tmdbType = null }) => (tvmazeType
  ? TVMAZE_CINEMATIC_TYPES.has(tvmazeType)
  : TMDB_CINEMATIC_TYPES.has(tmdbType))

export const lacksFilmLanguage = (found) => Boolean(found)
  && String(found.url || '').startsWith(`${TMDB_WEB}/movie/`)
  && found.originalLanguage === undefined

export const filmRatingsOf = (details) => {
  const { score, votes } = tmdbScoreOf(details)
  const reviews = tmdbReviewsOf({ type: 'movie', details })
  if (score == null && !reviews) return null
  return { score, votes, source: 'tmdb', url: `${TMDB_WEB}/movie/${details.id}`, reviews, originalLanguage: details.original_language || null }
}

export const tmdbSeriesProven = ({ details, hints, country }) => {
  const evidence = matchEvidenceOf({ hints, candidateYear: tmdbYearOf(details), text: tmdbTextOf(details) })
  return evidence.accepted || (evidence.reason === 'no-evidence' && tmdbAirsOnGuideChannel({ details, hints, country }))
}

export const tmdbSeriesRatingsOf = (details) => {
  const { score, votes } = tmdbScoreOf(details)
  const reviews = tmdbReviewsOf({ type: 'tv', details })
  if (score == null && !reviews) return null
  return { score, votes, source: 'tmdb', url: `${TMDB_WEB}/tv/${details.id}`, reviews }
}

export const seriesRatingsOf = ({ show, details = null }) => {
  const average = Number(show.rating?.average)
  const score = Number.isFinite(average) && average > 0 ? roundedScore(average) : null
  const reviews = details ? tmdbReviewsOf({ type: 'tv', details, average: score }) : null
  if (score == null && !reviews) return null
  return { score, votes: null, source: 'tvmaze', url: show.url || null, reviews }
}

export const tmdbScoreOf = (details) => {
  const votes = Number(details?.vote_count) || 0
  const average = Number(details?.vote_average)
  const shown = votes >= MIN_TMDB_VOTES && Number.isFinite(average) && average > 0
  return { score: shown ? roundedScore(average) : null, votes: shown ? votes : null }
}

export const tmdbReviewsOf = ({ type, details, average = null }) => {
  const reviews = details?.reviews?.results || []
  const snippet = pickReviewSnippet({ reviews, average: Number(details?.vote_average) || average })
  if (!snippet) return null
  return {
    snippet,
    count: Number(details.reviews.total_results) || reviews.length,
    url: `${TMDB_WEB}/${type}/${details.id}/reviews`,
  }
}

export const createGuideHints = ({ loadGuide }) => {
  const hintsByGuide = new WeakMap()
  return async (title) => {
    const guide = await Promise.resolve().then(loadGuide).catch(() => null)
    if (!guide?.programByEventId) return null
    if (!hintsByGuide.has(guide)) {
      hintsByGuide.set(guide, programmeHintsByTitle([...guide.programByEventId.values()], { channels: guide.channels || [] }))
    }
    return hintsByGuide.get(guide).get(showTitleKey(title)) || null
  }
}

const filmEvidenceAccepted = ({ details, hints }) =>
  matchEvidenceOf({ hints, candidateYear: tmdbYearOf(details), text: tmdbTextOf(details) }).accepted

const tvmazeEvidenceOf = ({ show, hints }) => (hints
  ? matchEvidenceOf({ hints: { ...hints, castNames: [] }, candidateYear: premiereYearOf(show), text: tvmazeTextOf(show) })
  : null)

const tvmazeTextOf = (show) => `${show.name || ''} ${String(show.summary || '').replace(/<[^>]*>/g, ' ')}`

const premiereYearOf = (show) => {
  const year = Number(String(show.premiered || '').slice(0, 4))
  return year > 0 ? year : null
}

const showCountryOf = (show) => show.network?.country?.code || show.webChannel?.country?.code || null

const isLocalShow = ({ show, country }) => Boolean(country)
  && String(showCountryOf(show) || '').toUpperCase() === String(country).toUpperCase()

const airsOnGuideChannel = ({ show, hints, country }) => {
  if (!hints?.channelNames?.length) return false
  if (country && showCountryOf(show) && !isLocalShow({ show, country })) return false
  const networkNames = [show.network?.name, show.webChannel?.name].filter(Boolean)
  return sharesNetwork({ networkNames, channelNames: hints.channelNames })
}

const roundedScore = (value) => Math.round(value * 10) / 10

export const cacheKeyOf = ({ mode, kind, key, year = null }) => {
  const base = kind ? `${mode}:${kind}:${key}` : `${mode}:${key}`
  return kind && year ? `${base}@${year}` : base
}

export const lookupCacheKeyOf = ({ kind, key, ...rest }) => cacheKeyOf({
  ...rest,
  kind,
  key: kind ? key : `${SERIES_MATCH_VERSION}:${key}`,
})

export const storedTmdbReference = async ({ title, kind }) => {
  const key = showTitleKey(title)
  if (!key) return null
  const row = await readSizedCache({
    read: (lookupKey) => db('artwork_lookups').where({ lookup_key: lookupKey }).first(),
    key: cacheKeyOf({ mode: 'tmdb', kind, key }),
  })
  const match = String(row?.reference || '').match(/^tmdb:(movie|tv):(\d+)$/)
  return match ? { type: match[1], id: match[2] } : null
}

export const databaseCacheOf = (table) => ({
  read: async (key) => {
    const row = await db(table).where({ lookup_key: key }).first()
    return row ? { found: JSON.parse(row.found_json), expiresAt: Number(row.expires_at) } : null
  },
  write: ({ key, found, expiresAt, missReason = null }) => db(table)
    .insert({ lookup_key: key, found_json: JSON.stringify(found), expires_at: expiresAt, miss_reason: missReason })
    .onConflict('lookup_key')
    .merge(),
  remove: (key) => db(table).where({ lookup_key: key }).del(),
  removeDated: (key) => db(table).where('lookup_key', '>', `${key}@`).where('lookup_key', '<', `${key}A`).del(),
})

const missOf = (reason, detail = null) => ({ missReason: detail ? `${reason}:${detail}` : reason })

const NO_RATINGS = { status: 'none', score: null, votes: null, source: null, url: null, reviews: null }
const PENDING_RATINGS = { ...NO_RATINGS, status: 'pending' }
const FILM_KIND = 'movie'
const TVMAZE_API = 'https://api.tvmaze.com'
export const TMDB_WEB = 'https://www.themoviedb.org'
const TMDB_LANGUAGE = 'en-US'
const MAX_EPISODE_CHECKS = 4
const MIN_DOMINANT_WEIGHT = 50
const DOMINANT_WEIGHT_RATIO = 3
const TVMAZE_CINEMATIC_TYPES = new Set(['Scripted', 'Animation', 'Documentary'])
const TMDB_CINEMATIC_TYPES = new Set(['Scripted', 'Documentary', 'Miniseries'])
const CONTRADICTIONS = new Set(['year', 'cast'])
const MIN_TMDB_VOTES = 50
export const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const FAILURE_BACKOFF_MS = 10 * 60 * 1000
export const LOOKUP_CONCURRENCY = 2
export const LOOKUP_MAX_QUEUE = 300
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const MIN_REQUESTED_YEAR = 1900
const MAX_REQUESTED_YEAR = 2100

const PENDING_LOOKUP = { status: 'pending', found: null }
const NO_LOOKUP = { status: 'none', found: null }
const MAX_FAILED_KEYS = 2000
const MAX_WARM_QUEUE = 2000

export const settledOf = (promise) => Promise.resolve(promise).then((value) => ({ value }), (error) => ({ error, value: null }))

const settledWithin = ({ promise, ms }) => new Promise((resolve) => {
  const timer = setTimeout(() => resolve({ done: false }), ms)
  promise.then((value) => {
    clearTimeout(timer)
    resolve({ done: true, value })
  })
})
