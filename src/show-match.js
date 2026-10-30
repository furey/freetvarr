import { networkKeysOf } from './artwork-match.js'
import { showTitleKey } from './show-artwork.js'

export const createShowMatcher = ({ search, akasOf, seasonsOf, episodesByDate }) => async (airing) => {
  const parsed = parsedTitleOf(airing.title)
  const homeCountry = isoCountryOf(airing.homeCountry)
  const wantedCountry = parsed.country || homeCountry
  const pool = new Map()
  const addResults = (results) => {
    for (const show of (results || []).map((result) => result?.show)) {
      if (show?.id != null && !pool.has(show.id)) pool.set(show.id, show)
    }
  }
  for (const query of [...new Set([parsed.raw, parsed.stripped])]) addResults(await search(query))
  if (wantedCountry && !namedShowsOf({ shows: pool.values(), keys: parsed.keys }).some((show) => countryOf(show) === wantedCountry)) {
    const countryName = COUNTRY_SEARCH_NAMES[wantedCountry]
    if (countryName) addResults(await search(`${parsed.stripped} ${countryName}`))
  }
  const named = namedShowsOf({ shows: pool.values(), keys: parsed.keys })
  if (wantedCountry && !named.some((show) => countryOf(show) === wantedCountry)) {
    named.push(...await akaNamedShows({ shows: [...pool.values()].filter((show) => !named.includes(show)), keys: parsed.keys, akasOf }))
  }
  const plausible = await plausibleShowsOf({ named, airing, parsed, seasonsOf })
  const scored = await scoredShowsOf({ shows: plausible, airing, parsed, homeCountry, episodesByDate })
  const winner = winnerOf(scored)
  return {
    show: winner,
    tvdbId: winner ? tvdbIdOfShow({ show: winner, named }) : null,
    borrowedTvdb: Boolean(winner && !winner.externals?.thetvdb && tvdbIdOfShow({ show: winner, named })),
    titleCountry: parsed.country,
    named,
    candidates: (scored.length ? scored.map(({ show }) => show) : named).slice(0, MAX_CANDIDATES),
  }
}

export const parsedTitleOf = (title) => {
  const raw = String(title ?? '').trim()
  const { query, country } = titleCountryOf(raw)
  return { raw, stripped: query, country, keys: new Set([showTitleKey(raw), showTitleKey(query)].filter(Boolean)) }
}

export const titleCountryOf = (title) => {
  const text = String(title ?? '').trim()
  const trailing = text.match(TRAILING_COUNTRY)
  if (trailing && text.slice(0, trailing.index).trim() && !isPlainWordCode(trailing)) {
    return { query: text.slice(0, trailing.index).trim(), country: TITLE_COUNTRIES[trailing[1].toLowerCase()] }
  }
  const leading = text.match(LEADING_DEMONYM)
  if (leading && text.slice(leading[0].length).trim()) {
    return { query: text.slice(leading[0].length).trim(), country: DEMONYMS[leading[1].toLowerCase()] }
  }
  return { query: text, country: null }
}

export const nameKeysOf = (name) => [showTitleKey(name), showTitleKey(titleCountryOf(name).query)].filter(Boolean)

export const countryOf = (show) => isoCountryOf(show?.network?.country?.code || show?.webChannel?.country?.code)

export const isoCountryOf = (code) => {
  const upper = String(code ?? '').toUpperCase()
  if (upper === 'UK') return 'GB'
  return /^[A-Z]{2}$/.test(upper) ? upper : null
}

export const countryTagOf = (iso) => (iso === 'GB' ? 'UK' : iso)

export const networkFamilyOf = (name) => String(name ?? '')
  .split(/\s+/)
  .map((word) => [...networkKeysOf(word)].at(-1))
  .find(Boolean) || ''

export const yearsOf = (show) => {
  const first = String(show?.premiered || '').slice(0, 4)
  const last = String(show?.ended || '').slice(0, 4)
  if (!first) return ''
  if (show?.status === 'Running' || !last) return `${first}–`
  return first === last ? first : `${first}–${last}`
}

const namedShowsOf = ({ shows, keys }) => [...shows]
  .filter((show) => show?.name && nameKeysOf(show.name).some((key) => keys.has(key)))

const akaNamedShows = async ({ shows, keys, akasOf }) => {
  const matched = []
  for (const show of shows.slice(0, MAX_AKA_CHECKS)) {
    const akas = await akasOf(show.id).catch(() => [])
    if ((akas || []).some((aka) => aka?.name && nameKeysOf(aka.name).some((key) => keys.has(key)))) matched.push(show)
  }
  return matched
}

const plausibleShowsOf = async ({ named, airing, parsed, seasonsOf }) => {
  const plausible = []
  let seasonChecks = 0
  for (const show of named) {
    if (parsed.country && countryOf(show) !== parsed.country) continue
    if (premieredAfter({ show, start: airing.start })) continue
    if (!needsSeasonCheck({ show, named, season: airing.season }) || seasonChecks >= MAX_SEASON_CHECKS) {
      plausible.push(show)
      continue
    }
    seasonChecks++
    const seasons = await seasonsOf(show.id).catch(() => null)
    const maxSeason = Math.max(0, ...(seasons || []).map((season) => Number(season?.number) || 0))
    if (!maxSeason || airing.season <= maxSeason + 1) plausible.push(show)
  }
  return plausible
}

const needsSeasonCheck = ({ show, named, season }) => Number.isInteger(season)
  && season >= 1
  && season < CALENDAR_SEASON_FROM
  && named.length > 1
  && !hasEraSibling({ show, named })

const hasEraSibling = ({ show, named }) => named.some((other) => other.id !== show.id
  && countryOf(other) === countryOf(show)
  && showTitleKey(other.name) === showTitleKey(show.name))

const premieredAfter = ({ show, start }) => {
  const premiered = Date.parse(show?.premiered || '')
  return Number.isFinite(premiered) && Number.isFinite(start) && premiered > start + DAY_MS
}

const scoredShowsOf = async ({ shows, airing, parsed, homeCountry, episodesByDate }) => {
  const scored = []
  for (const [index, show] of shows.entries()) {
    const domestic = Boolean(homeCountry) && countryOf(show) === homeCountry
    const channelFamily = networkFamilyOf(airing.channelName)
    const onChannelNetwork = domestic && Boolean(channelFamily)
      && networkNamesOf(show).some((name) => networkFamilyOf(name) === channelFamily)
    const airedThen = index < MAX_AIR_TIME_CHECKS && shows.length > 1
      && await airsAt({ show, airing, episodesByDate }).catch(() => false)
    const score = (airedThen ? SCORES.airTime : 0)
      + (onChannelNetwork ? SCORES.network : 0)
      + (parsed.country && countryOf(show) === parsed.country ? SCORES.titleCountry : 0)
      + (domestic && (onChannelNetwork || airedThen) ? SCORES.domestic : 0)
      + (runsAt({ show, start: airing.start }) ? SCORES.running : 0)
    scored.push({ show, score })
  }
  return scored.sort((a, b) => b.score - a.score)
}

const winnerOf = (scored) => {
  if (scored.length === 1) return scored[0].show
  const [top, next] = scored
  if (!top || top.score < MIN_WINNING_SCORE || top.score - next.score < WINNING_MARGIN) return null
  return top.show
}

const airsAt = async ({ show, airing, episodesByDate }) => {
  if (!Number.isFinite(airing.start)) return false
  const date = localDateOf({ ms: airing.start, timeZone: show.network?.country?.timezone })
  const episodes = await episodesByDate({ id: show.id, date })
  const earliest = airing.start - EARLY_START_MS
  const latest = airing.start + Math.max(0, Number(airing.durationS) || 0) * 1000
  return (episodes || []).some((episode) => {
    const at = Date.parse(episode?.airstamp || '')
    return Number.isFinite(at) && at >= earliest && at <= latest
  })
}

const runsAt = ({ show, start }) => {
  const at = Number.isFinite(start) ? start : Date.now()
  const premiered = Date.parse(show?.premiered || '')
  const ended = Date.parse(show?.ended || '')
  if (Number.isFinite(premiered) && premiered > at + DAY_MS) return false
  return !Number.isFinite(ended) || ended >= at - YEAR_MS
}

const localDateOf = ({ ms, timeZone }) => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms)
  } catch {
    return new Date(ms).toISOString().slice(0, 10)
  }
}

const networkNamesOf = (show) => [show?.network?.name, show?.webChannel?.name].filter(Boolean)

export const tvdbIdOfShow = ({ show, named }) => {
  if (show.externals?.thetvdb) return String(show.externals.thetvdb)
  const sibling = named
    .filter((other) => other.externals?.thetvdb && countryOf(other) === countryOf(show) && showTitleKey(other.name) === showTitleKey(show.name))
    .sort((a, b) => String(b.premiered || '').localeCompare(String(a.premiered || '')))[0]
  return sibling ? String(sibling.externals.thetvdb) : null
}

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

const DEMONYMS = { australian: 'AU', british: 'GB', american: 'US', canadian: 'CA', 'new zealand': 'NZ' }

const COUNTRY_SEARCH_NAMES = { AU: 'Australia', NZ: 'New Zealand', GB: 'UK', US: 'US', CA: 'Canada' }

const TRAILING_COUNTRY = /[\s:-]+\(?(uk|gb|usa?|aus?|australia|nz|new zealand|canada)\)?$/i
const LEADING_DEMONYM = /^(australian|british|american|canadian|new zealand)\s+/i

const isPlainWordCode = ([whole, code]) => !whole.includes('(') && code.length <= 3 && code !== code.toUpperCase()

const SCORES = { airTime: 100, network: 40, titleCountry: 30, domestic: 20, running: 5 }
const MIN_WINNING_SCORE = 10
const WINNING_MARGIN = 20
const MAX_CANDIDATES = 6
const MAX_AKA_CHECKS = 4
const MAX_SEASON_CHECKS = 4
const MAX_AIR_TIME_CHECKS = 4
const CALENDAR_SEASON_FROM = 1900
const EARLY_START_MS = 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const YEAR_MS = 365 * DAY_MS
