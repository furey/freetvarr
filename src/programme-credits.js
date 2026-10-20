import { getSetting } from './db.js'
import { showTitleKey } from './show-artwork.js'
import { createHostLimiter } from './outbound-http.js'
import { storedTmdbKey } from './fallback-artwork.js'
import { artworkKindOf } from './artwork-match.js'
import {
  cacheKeyOf,
  createBackgroundLookups,
  createTitleMatcher,
  databaseCacheOf,
  FAILURE_BACKOFF_MS,
  HIT_TTL_MS,
  LOOKUP_CONCURRENCY,
  LOOKUP_MAX_QUEUE,
  MISS_TTL_MS,
  TMDB_WEB,
} from './programme-ratings.js'

export const CREDITS_SETTING = 'credits_lookup_enabled'

export const creditsLookupEnabled = async () => (await getSetting(CREDITS_SETTING)) !== 'false'

export const createProgrammeCredits = ({
  lookUp = createCreditsLookup(),
  cache = databaseCacheOf('programme_credits'),
  creditsEnabled = creditsLookupEnabled,
  tmdbKey = storedTmdbKey,
  hintsFor = async () => null,
  now = Date.now,
  hitTtlMs = HIT_TTL_MS,
  missTtlMs = MISS_TTL_MS,
  failureBackoffMs = FAILURE_BACKOFF_MS,
  lookupLimiter = createHostLimiter({ concurrency: LOOKUP_CONCURRENCY, maxQueue: LOOKUP_MAX_QUEUE }),
  waitMs = 0,
} = {}) => {
  const lookups = createBackgroundLookups({ lookUp, cache, hintsFor, now, hitTtlMs, missTtlMs, failureBackoffMs, lookupLimiter, waitMs })

  const settingsFor = async ({ title, kind, year }) => {
    const key = showTitleKey(title)
    if (!key || !(await creditsEnabled())) return null
    const apiKey = await tmdbKey()
    const creditsKind = artworkKindOf(kind)
    if (creditsKind && !apiKey) return null
    const filmYear = creditsKind ? year : null
    const cacheKey = cacheKeyOf({ mode: apiKey ? 'tmdb' : 'open', kind: creditsKind, key, year: filmYear })
    return { apiKey, kind: creditsKind, year: filmYear, cacheKey }
  }

  const creditsFor = async (title, { kind = null, year = null } = {}) => {
    const settings = await settingsFor({ title, kind, year })
    if (!settings) return NO_CREDITS
    const { status, found } = await lookups.foundFor({ title, ...settings })
    if (status === 'pending') return PENDING_CREDITS
    return status === 'ready' && found ? { status: 'ready', ...found } : NO_CREDITS
  }

  return { creditsFor }
}

export const createCreditsLookup = ({ matcher = createTitleMatcher() } = {}) => {
  const filmCredits = async ({ title, hints, apiKey, year }) => {
    const details = await matcher.matchedFilm({ title, hints, apiKey, year })
    return details ? filmCreditsOf(details) : null
  }

  const seriesCredits = async ({ title, hints, apiKey }) => {
    const show = await matcher.tvmazeShow({ title, hints })
    if (!show) return null
    const cast = await matcher.tvmazeGet(`/shows/${encodeURIComponent(show.id)}/cast`)
    const crew = await matcher.tvmazeGet(`/shows/${encodeURIComponent(show.id)}/crew`)
    const details = apiKey ? await matcher.tmdbShow({ title, show, apiKey }) : null
    const overview = plainTextOf(show.summary) || plainTextOf(details?.overview)
    return seriesCreditsOf({ show, cast, crew, overview, currentCast: details?.credits?.cast })
  }

  return async ({ title, kind, hints, apiKey, year = null }) => (artworkKindOf(kind)
    ? filmCredits({ title, hints, apiKey, year })
    : seriesCredits({ title, hints, apiKey }))
}

export const filmCreditsOf = (details) => creditsOrNull({
  overview: plainTextOf(details.overview),
  cast: [...(details.credits?.cast || [])]
    .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity))
    .map(tmdbCastMemberOf),
  crew: crewOf({ people: (details.credits?.crew || []).map(tmdbCrewMemberOf), roles: FILM_CREW_ROLES }),
  source: 'tmdb',
  url: `${TMDB_WEB}/movie/${details.id}`,
})

export const seriesCreditsOf = ({ show, cast, crew, overview = null, currentCast = null }) => creditsOrNull({
  overview: overview || null,
  cast: currentCast?.length
    ? [...currentCast].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity)).map(tmdbCastMemberOf)
    : (Array.isArray(cast) ? cast : []).map(tvmazeCastMemberOf),
  crew: crewOf({ people: (Array.isArray(crew) ? crew : []).map(tvmazeCrewMemberOf), roles: SERIES_CREW_ROLES }),
  source: 'tvmaze',
  url: show.url || null,
})

export const plainTextOf = (html) => {
  const text = String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (entity, name) => HTML_ENTITIES[name])
    .replace(/\s+/g, ' ')
    .trim()
  return text || null
}

export const httpsImageOf = (url) => {
  const text = String(url || '')
  if (text.startsWith('https://')) return text
  return text.startsWith('http://') ? `https://${text.slice('http://'.length)}` : null
}

const creditsOrNull = ({ overview, cast, crew, source, url }) => {
  const billed = uniqueBy(cast.filter((person) => person.name), (person) => person.url || person.name).slice(0, MAX_CAST)
  if (!overview && !billed.length && !crew.length) return null
  return { overview, cast: billed, crew, source, url }
}

const crewOf = ({ people, roles }) => roles.flatMap(({ job, matches, limit }) =>
  uniqueBy(people.filter((person) => person.name && matches.has(person.job)), (person) => person.name)
    .slice(0, limit)
    .map(({ name }) => ({ name, job })))

const tmdbCastMemberOf = (person) => ({
  name: person.name || null,
  character: person.character || null,
  image: person.profile_path ? `${TMDB_PROFILE_BASE}${person.profile_path}` : null,
  url: person.id != null ? `${TMDB_WEB}/person/${person.id}` : null,
})

const tmdbCrewMemberOf = (person) => ({ name: person.name || null, job: person.job || null })

const tvmazeCastMemberOf = ({ person, character }) => ({
  name: person?.name || null,
  character: character?.name || null,
  image: httpsImageOf(person?.image?.medium),
  url: person?.url || null,
})

const tvmazeCrewMemberOf = ({ person, type }) => ({ name: person?.name || null, job: type || null })

const uniqueBy = (items, keyOf) => {
  const seen = new Set()
  return items.filter((item) => {
    const key = keyOf(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const NO_CREDITS = { status: 'none', overview: null, cast: [], crew: [], source: null, url: null }
const PENDING_CREDITS = { ...NO_CREDITS, status: 'pending' }
const MAX_CAST = 12
const TMDB_PROFILE_BASE = 'https://image.tmdb.org/t/p/w185'
const HTML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' }
const FILM_CREW_ROLES = [
  { job: 'Director', matches: new Set(['Director']), limit: Infinity },
  { job: 'Writer', matches: new Set(['Screenplay', 'Writer']), limit: 2 },
  { job: 'Producer', matches: new Set(['Producer']), limit: 2 },
]
const SERIES_CREW_ROLES = [
  { job: 'Creator', matches: new Set(['Creator']), limit: Infinity },
  { job: 'Executive Producer', matches: new Set(['Executive Producer']), limit: 2 },
]
