import { createTitleMatcher } from './programme-ratings.js'
import { artworkClient, storedTmdbKey } from './fallback-artwork.js'
import { showTitleKey, tvmazeLookupEnabled } from './show-artwork.js'
import { createValidFilename } from './sync.js'
import { currentTimeZone } from './time-zone.js'
import { countryForTimeZone } from './zone-countries.js'
import { loadIdentityPick } from './show-identity-store.js'
import {
  countryOf,
  countryTagOf,
  createShowMatcher,
  nameKeysOf,
  networkFamilyOf,
  titleCountryOf,
  tvdbIdOfShow,
  yearsOf,
} from './show-match.js'

export const createShowIdentity = ({
  client = artworkClient,
  tmdbKey = storedTmdbKey,
  isTvmazeEnabled = tvmazeLookupEnabled,
  countryCode = () => countryForTimeZone(currentTimeZone()),
  loadPick = async () => null,
  knownReference = async () => null,
  waitMs = IDENTITY_WAIT_MS,
  now = Date.now,
  hitTtlMs = HIT_TTL_MS,
  missTtlMs = MISS_TTL_MS,
  failureBackoffMs = FAILURE_BACKOFF_MS,
} = {}) => {
  const tmdbMatcher = createTitleMatcher({ client, countryCode, knownReference })
  const remembered = new Map()
  const inflight = new Map()
  let failedUntil = 0

  const tvmazeGet = async ({ path, params }) => client.getJson({ url: `${TVMAZE_API}${path}`, ...(params ? { params } : {}) })
  const listOf = (value) => (Array.isArray(value) ? value : [])

  const matchShow = createShowMatcher({
    search: async (query) => listOf(await tvmazeGet({ path: '/search/shows', params: { q: query } })),
    akasOf: async (id) => listOf(await tvmazeGet({ path: `/shows/${encodeURIComponent(id)}/akas` })),
    seasonsOf: async (id) => listOf(await tvmazeGet({ path: `/shows/${encodeURIComponent(id)}/seasons` })),
    episodesByDate: async ({ id, date }) => listOf(await tvmazeGet({ path: `/shows/${encodeURIComponent(id)}/episodesbydate`, params: { date } })),
  })

  const tmdbIdOf = async ({ title, show, tvdbId }) => {
    if (tvdbId) return null
    const apiKey = await Promise.resolve().then(tmdbKey).catch(() => null)
    if (!apiKey) return null
    const details = await tmdbMatcher.tmdbShow({ title, show, apiKey }).catch(() => null)
    return details?.id ?? null
  }

  const lookUp = async (airing) => {
    const found = await matchShow({ ...airing, homeCountry: countryCode() })
    const candidates = found.candidates.map((show) => candidateOf({ show, named: found.named, titleCountry: found.titleCountry }))
    if (!found.show) return { state: candidates.length ? 'choose' : 'none', identity: null, candidates }
    const identity = identityOf({
      show: found.show,
      named: found.named,
      titleCountry: found.titleCountry,
      tvdbId: found.tvdbId,
      tmdbId: await tmdbIdOf({ title: airing.title, show: found.show, tvdbId: found.tvdbId }),
      needsConfirm: found.borrowedTvdb,
    })
    return { state: found.borrowedTvdb ? 'confirm' : 'matched', identity, candidates }
  }

  const rememberedFor = (key) => {
    const entry = remembered.get(key)
    if (!entry) return undefined
    if (entry.expiresAt > now()) return entry.match
    remembered.delete(key)
    return undefined
  }

  const remember = ({ key, match }) => {
    remembered.delete(key)
    remembered.set(key, { match, expiresAt: now() + (match.identity ? hitTtlMs : missTtlMs) })
    while (remembered.size > MAX_REMEMBERED) remembered.delete(remembered.keys().next().value)
  }

  const startLookup = ({ key, airing }) => {
    if (inflight.has(key)) return inflight.get(key)
    const pending = lookUp(airing)
      .then((match) => {
        remember({ key, match })
        return match
      }, () => {
        failedUntil = now() + failureBackoffMs
        return UNREACHABLE
      })
      .finally(() => inflight.delete(key))
    inflight.set(key, pending)
    return pending
  }

  const forget = ({ title, channelName = null }) => remembered.delete(lookupKeyOf({ title, channelName }))

  const identify = async ({ title, channelName = null, start = null, durationS = null, season = null, episode = null, wait = waitMs, usePick = true }) => {
    const titleKey = showTitleKey(title)
    if (!titleKey) return NO_MATCH
    const picked = usePick && await Promise.resolve().then(() => loadPick({ titleKey, family: networkFamilyOf(channelName) })).catch(() => null)
    if (picked) return { state: 'chosen', identity: picked, candidates: [] }
    const key = lookupKeyOf({ title, channelName })
    const known = rememberedFor(key)
    if (known !== undefined) return known
    if (failedUntil > now()) return UNREACHABLE
    if (!(await Promise.resolve().then(isTvmazeEnabled).catch(() => false))) return NO_MATCH
    const airing = { title, channelName, start: Number(start) || null, durationS, season: integerOf(season), episode: integerOf(episode) }
    const outcome = await withinMs(startLookup({ key, airing }), wait)
    return outcome === TIMED_OUT ? STILL_LOOKING : outcome
  }

  return Object.assign(identify, { forget })
}

export const identityOf = ({ show, named = [], titleCountry = null, tvdbId = null, tmdbId = null, needsConfirm = false }) => {
  const name = databaseTitleOf({ show, named, titleCountry })
  if (!name) return null
  return {
    tvmazeId: positiveIdOf(show.id),
    name,
    tvdbId: positiveIdOf(tvdbId ?? show.externals?.thetvdb),
    tmdbId: positiveIdOf(tmdbId),
    needsConfirm: Boolean(needsConfirm),
  }
}

export const databaseTitleOf = ({ show, named = [], titleCountry = null }) => {
  const name = String(show?.name ?? '').trim()
  if (!name || titleCountryOf(name).country) return name
  const country = countryOf(show)
  if (!country) return name
  const keys = new Set(nameKeysOf(name))
  const sharedAbroad = named
    .filter((other) => other && other.id !== show.id && nameKeysOf(other.name || '').some((key) => keys.has(key)))
    .some((other) => countryOf(other) !== country)
  return sharedAbroad || titleCountry ? `${name} (${countryTagOf(country)})` : name
}

export const candidateOf = ({ show, named = [], titleCountry = null }) => {
  const tvdbId = tvdbIdOfShow({ show, named })
  const identity = identityOf({ show, named, titleCountry, tvdbId, needsConfirm: Boolean(tvdbId && !show.externals?.thetvdb) })
  return {
    tvmazeId: positiveIdOf(show.id),
    name: show.name,
    country: countryTagOf(countryOf(show)),
    network: show.network?.name || show.webChannel?.name || null,
    years: yearsOf(show),
    identity,
    folder: identityFolderOf(identity),
  }
}

export const identityFolderOf = (identity) => {
  const name = createValidFilename(identity?.name ?? '')
  if (!name) return null
  if (identity.tvdbId) return `${name} {tvdb-${identity.tvdbId}}`
  return identity.tmdbId ? `${name} {tmdb-${identity.tmdbId}}` : null
}

export const lookupKeyOf = ({ title, channelName }) => `${showTitleKey(title)}|${networkFamilyOf(channelName)}`

let sharedIdentity = null

export const showIdentityFor = (request) => {
  sharedIdentity ??= createShowIdentity({ loadPick: loadIdentityPick })
  return sharedIdentity(request)
}

export const forgetShowIdentity = (request) => sharedIdentity?.forget?.(request)

const integerOf = (value) => (Number.isInteger(Number(value)) && value !== null && value !== '' ? Number(value) : null)

const positiveIdOf = (value) => (Number.isInteger(Number(value)) && Number(value) > 0 ? String(Number(value)) : null)

const withinMs = (promise, ms) => Promise.race([
  promise,
  new Promise((resolve) => setTimeout(resolve, ms, TIMED_OUT).unref?.()),
])

const NO_MATCH = Object.freeze({ state: 'none', identity: null, candidates: [] })
const UNREACHABLE = Object.freeze({ state: 'unreachable', identity: null, candidates: [] })
const STILL_LOOKING = Object.freeze({ state: 'pending', identity: null, candidates: [] })
const TIMED_OUT = Symbol('timed-out')
const TVMAZE_API = 'https://api.tvmaze.com'
const IDENTITY_WAIT_MS = 15000
const HIT_TTL_MS = 24 * 60 * 60 * 1000
const MISS_TTL_MS = 6 * 60 * 60 * 1000
const FAILURE_BACKOFF_MS = 10 * 60 * 1000
const MAX_REMEMBERED = 500
