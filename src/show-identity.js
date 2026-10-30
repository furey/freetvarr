import { createTitleMatcher, pickRatedShow, showCountryOf } from './programme-ratings.js'
import { artworkClient, storedTmdbKey } from './fallback-artwork.js'
import { episodeTitleKeyOf, programmeHintsOf } from './artwork-match.js'
import { externalIdsOf } from './external-ids.js'
import { loadExternalIds } from './external-ids-store.js'
import { guideHintsFor, showTitleKey, tvmazeLookupEnabled } from './show-artwork.js'
import { createValidFilename } from './sync.js'
import { currentTimeZone } from './time-zone.js'
import { countryForTimeZone } from './zone-countries.js'

export const createShowIdentity = ({
  client = artworkClient,
  tmdbKey = storedTmdbKey,
  isTvmazeEnabled = tvmazeLookupEnabled,
  hintsFor = guideHintsFor,
  externalIdsFor = loadExternalIds,
  countryCode = () => countryForTimeZone(currentTimeZone()),
  knownReference = async () => null,
  waitMs = IDENTITY_WAIT_MS,
  now = Date.now,
  hitTtlMs = HIT_TTL_MS,
  missTtlMs = MISS_TTL_MS,
  failureBackoffMs = FAILURE_BACKOFF_MS,
} = {}) => {
  const matcher = createTitleMatcher({ client, countryCode, knownReference })
  const remembered = new Map()
  const inflight = new Map()
  let failedUntil = 0

  const searchTvmaze = async (query) => {
    const results = await client.getJson({ url: `${TVMAZE_API}/search/shows`, params: { q: query } })
    return Array.isArray(results) ? results : []
  }

  const episodesOf = async (show) => {
    const episodes = await client.getJson({ url: `${TVMAZE_API}/shows/${encodeURIComponent(show.id)}/episodes` })
    return Array.isArray(episodes) ? episodes : []
  }

  const showByIds = async (ids) => {
    for (const [source, id] of [['thetvdb', ids.tvdb], ['imdb', ids.imdb]]) {
      if (!id) continue
      const show = await client.getJson({ url: `${TVMAZE_API}/lookup/shows`, params: { [source]: id } })
      if (show?.id != null) return { show, results: await searchTvmaze(show.name) }
    }
    return null
  }

  const searchedShow = async ({ title, hints, episodes }) => {
    const titled = titleCountryOf(title)
    const found = await showForQuery({ ...titled, hints, episodes })
    return found || !titled.country ? found : showForQuery({ query: title, country: null, hints, episodes })
  }

  const showForQuery = async ({ query, country, hints, episodes }) => {
    const results = await searchTvmaze(query)
    const named = namedShowsOf({ results, key: showTitleKey(query) })
    const candidates = country ? named.filter((show) => isoCountryOf(showCountryOf(show)) === country) : named
    const show = await pickedShow({ candidates, key: showTitleKey(query), hints, episodes, country: country || isoCountryOf(countryCode()) })
    return show ? { show, results, titleCountry: country } : null
  }

  const pickedShow = async ({ candidates, key, hints, episodes, country }) => {
    if (candidates.length <= 1) return candidates[0] ?? null
    const shortlist = await episodeMatchedShows({ candidates, hints, episodes })
    if (shortlist.length === 1) return shortlist[0]
    const remaining = shortlist.length ? shortlist : candidates
    const picked = pickRatedShow({ results: remaining.map((show) => ({ show: { ...show, name: key } })), key, hints, country, strict: true })
    return remaining.find((show) => show.id === picked?.id) ?? null
  }

  const episodeMatchedShows = async ({ candidates, hints, episodes }) => {
    const wanted = guideEpisodesOf({ hints, episodes })
    if (!wanted.numbers.size && !wanted.titles.size) return []
    if (candidates.length > MAX_EPISODE_CHECKS) return []
    const matched = []
    for (const show of candidates) {
      if (hasGuideEpisode({ episodes: await episodesOf(show), wanted })) matched.push(show)
    }
    return matched
  }

  const tmdbIdOf = async ({ title, show }) => {
    if (show.externals?.thetvdb) return null
    const apiKey = await Promise.resolve().then(tmdbKey).catch(() => null)
    if (!apiKey) return null
    const details = await matcher.tmdbShow({ title, show, apiKey }).catch(() => null)
    return details?.id ?? null
  }

  const lookUp = async ({ title, channelName, episodes }) => {
    const ids = await externalIdsOf({ externalIdsFor, title, kind: null })
    const hints = hintsWithChannel({ hints: await Promise.resolve().then(() => hintsFor(title)).catch(() => null), title, channelName })
    const found = (ids && await showByIds(ids)) || await searchedShow({ title, hints, episodes })
    if (!found) return null
    return identityOf({ ...found, tmdbId: await tmdbIdOf({ title, show: found.show }) })
  }

  const rememberedFor = (key) => {
    const entry = remembered.get(key)
    if (!entry) return undefined
    if (entry.expiresAt > now()) return entry.identity
    remembered.delete(key)
    return undefined
  }

  const remember = ({ key, identity }) => {
    remembered.delete(key)
    remembered.set(key, { identity, expiresAt: now() + (identity ? hitTtlMs : missTtlMs) })
    while (remembered.size > MAX_REMEMBERED) remembered.delete(remembered.keys().next().value)
  }

  const startLookup = ({ key, request }) => {
    if (inflight.has(key)) return inflight.get(key)
    const pending = lookUp(request)
      .then((identity) => {
        remember({ key, identity })
        return { identity }
      }, () => {
        failedUntil = now() + failureBackoffMs
        return { identity: null }
      })
      .finally(() => inflight.delete(key))
    inflight.set(key, pending)
    return pending
  }

  return async ({ title, channelName = null, episodes = [] }) => {
    const key = showTitleKey(title)
    if (!key) return null
    const known = rememberedFor(key)
    if (known !== undefined) return known
    if (failedUntil > now()) return null
    if (!(await Promise.resolve().then(isTvmazeEnabled).catch(() => false))) return null
    const outcome = await withinMs(startLookup({ key, request: { title, channelName, episodes } }), waitMs)
    return outcome === TIMED_OUT ? null : outcome.identity
  }
}

export const identityOf = ({ show, results = [], titleCountry = null, tmdbId = null }) => {
  const name = databaseTitleOf({ show, results, titleCountry })
  if (!name) return null
  return {
    name,
    tvdbId: positiveIdOf(show.externals?.thetvdb),
    tmdbId: positiveIdOf(tmdbId),
  }
}

export const databaseTitleOf = ({ show, results = [], titleCountry = null }) => {
  const name = String(show?.name ?? '').trim()
  if (!name || titleCountryOf(name).country) return name
  const country = isoCountryOf(showCountryOf(show))
  if (!country) return name
  const key = showTitleKey(name)
  const sharedAbroad = results
    .map((result) => result?.show)
    .filter((other) => other && other.id !== show.id && showTitleKey(other.name) === key)
    .some((other) => isoCountryOf(showCountryOf(other)) !== country)
  return sharedAbroad || titleCountry ? `${name} (${countryTagOf(country)})` : name
}

export const titleCountryOf = (title) => {
  const text = String(title ?? '').trim()
  const match = text.match(TRAILING_COUNTRY)
  const country = match && TITLE_COUNTRIES[match[1].toLowerCase()]
  if (!country) return { query: text, country: null }
  const query = text.slice(0, match.index).trim()
  return query ? { query, country } : { query: text, country: null }
}

export const identityFolderOf = (identity) => {
  const name = createValidFilename(identity?.name ?? '')
  if (!name) return null
  if (identity.tvdbId) return `${name} {tvdb-${identity.tvdbId}}`
  return identity.tmdbId ? `${name} {tmdb-${identity.tmdbId}}` : null
}

export const hintsWithChannel = ({ hints, title, channelName }) => {
  if (!channelName) return hints
  if (!hints) return programmeHintsOf([{ title, channel_id: 'guide' }], { channelNameOf: () => channelName })
  const channelNames = hints.channelNames || []
  return channelNames.includes(channelName) ? hints : { ...hints, channelNames: [...channelNames, channelName] }
}

export const guideEpisodesOf = ({ hints, episodes = [] }) => ({
  numbers: new Set(episodes
    .filter((episode) => Number.isInteger(episode?.season) && Number.isInteger(episode?.episode) && episode.season > 0)
    .map((episode) => `${episode.season}x${episode.episode}`)),
  titles: new Set([
    ...(hints?.episodeTitles || []),
    ...episodes.map((episode) => episodeTitleKeyOf(episode?.title)),
  ].filter(Boolean)),
})

export const hasGuideEpisode = ({ episodes, wanted }) => episodes.some((episode) =>
  wanted.numbers.has(`${episode?.season}x${episode?.number}`) || wanted.titles.has(episodeTitleKeyOf(episode?.name)))

const namedShowsOf = ({ results, key }) => results
  .map((result) => result?.show)
  .filter((show) => show?.name && [show.name, titleCountryOf(show.name).query].some((name) => showTitleKey(name) === key))

let sharedIdentity = null

export const showIdentityFor = (request) => {
  sharedIdentity ??= createShowIdentity()
  return sharedIdentity(request)
}

const isoCountryOf = (code) => {
  const upper = String(code ?? '').toUpperCase()
  if (upper === 'UK') return 'GB'
  return /^[A-Z]{2}$/.test(upper) ? upper : null
}

const countryTagOf = (iso) => (iso === 'GB' ? 'UK' : iso)

const positiveIdOf = (value) => (Number.isInteger(Number(value)) && Number(value) > 0 ? String(Number(value)) : null)

const withinMs = (promise, ms) => Promise.race([
  promise,
  new Promise((resolve) => setTimeout(resolve, ms, TIMED_OUT).unref?.()),
])

const TITLE_COUNTRIES = {
  uk: 'GB',
  gb: 'GB',
  us: 'US',
  usa: 'US',
  au: 'AU',
  aus: 'AU',
  australia: 'AU',
  nz: 'NZ',
  'new zealand': 'NZ',
  canada: 'CA',
}

const TIMED_OUT = Symbol('timed-out')
const TVMAZE_API = 'https://api.tvmaze.com'
const TRAILING_COUNTRY = /[\s:-]+\(?(uk|gb|usa?|aus?|australia|nz|new zealand|canada)\)?$/i
const IDENTITY_WAIT_MS = 8000
const HIT_TTL_MS = 24 * 60 * 60 * 1000
const MISS_TTL_MS = 6 * 60 * 60 * 1000
const FAILURE_BACKOFF_MS = 10 * 60 * 1000
const MAX_REMEMBERED = 500
const MAX_EPISODE_CHECKS = 4
