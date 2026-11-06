import { db, getSetting } from './db.js'
import { artworkClient } from './fallback-artwork.js'
import { GENRE_LOOKUP_KEY, genreLookupEnabledFrom } from './genre-enrichment.js'
import { RATINGS_SETTING } from './programme-ratings.js'
import { showTitleKey } from './show-artwork.js'
import { currentTimeZone } from './time-zone.js'
import { countryForTimeZone } from './zone-countries.js'
import { SERIES_RATINGS_PREFIX, dominantShowOf, seriesFactsByKeyOf } from './top-rated.js'
import { showKeyOf } from './web/show-key.js'

export const TVMAZE_WEB = 'https://www.tvmaze.com'

export const seriesRatingOf = (show) => {
  if (!show || typeof show !== 'object') return null
  return {
    score: Number(show.rating?.average) || null,
    weight: Number(show.weight) || 0,
    type: typeof show.type === 'string' ? show.type : null,
    runtime: Number(show.runtime || show.averageRuntime) || null,
    url: tvmazeUrlOf(show.url),
  }
}

export const confidentShowOf = ({ results = [], title, country = null }) => {
  const key = showTitleKey(title)
  if (!key) return null
  const sameTitle = (Array.isArray(results) ? results : [])
    .map((result) => result?.show)
    .filter((show) => show && typeof show === 'object' && showTitleKey(show.name) === key)
  const dominant = dominantShowOf(sameTitle)
  if (dominant) return dominant
  const local = country ? sameTitle.filter((show) => countryOf(show) === country) : []
  return local.length === 1 ? local[0] : null
}

export const seriesRatingsEnabledFrom = ({ genreLookup, ratingsLookup }) => genreLookupEnabledFrom(genreLookup) && ratingsLookup !== 'false'

export const createSeriesRatings = ({
  client = artworkClient,
  searchShows = (title) => client.getJson({
    url: `${TVMAZE_API}/search/shows`,
    params: { q: title },
    timeoutMs: REQUEST_TIMEOUT_MS,
    maxBytes: MAX_RESPONSE_BYTES,
    isBackground: true,
  }),
  cache = databaseCache,
  isEnabled = lookupEnabled,
  countryOfZone = () => countryForTimeZone(currentTimeZone()),
  now = Date.now,
  gapMs = LOOKUP_GAP_MS,
  sleep = wait,
  budget = DEFAULT_BUDGET,
} = {}) => {
  let running = null

  const refresh = async ({ titles = [] } = {}) => {
    if (!(await isEnabled())) return { looked: 0, found: 0, failed: 0, skipped: true }
    const fresh = await cache.freshKeys(now())
    const country = countryOfZone()
    const pending = pendingTitlesOf({ titles, fresh }).slice(0, budget)
    let looked = 0
    let found = 0
    let failed = 0
    let failuresInRow = 0
    for (const { key, title } of pending) {
      if (failuresInRow >= MAX_FAILURES_IN_ROW) break
      await sleep(gapMs)
      looked += 1
      const results = await searchShows(title).catch(() => FAILED)
      if (results === FAILED) {
        failed += 1
        failuresInRow += 1
        continue
      }
      failuresInRow = 0
      const facts = seriesRatingOf(confidentShowOf({ results, title, country }))
      if (facts) found += 1
      await cache.write({ key, facts, expiresAt: now() + (facts ? HIT_TTL_MS : MISS_TTL_MS) }).catch(() => {})
    }
    return { looked, found, failed, stopped: failuresInRow >= MAX_FAILURES_IN_ROW }
  }

  const run = (options) => {
    running ??= refresh(options).finally(() => { running = null })
    return running
  }

  return { run, isRunning: () => Boolean(running) }
}

export const loadSeriesRatings = async ({ isEnabled = lookupEnabled } = {}) => {
  if (!(await isEnabled().catch(() => false))) return new Map()
  return seriesFactsByKeyOf(await seriesRatingRows().select('lookup_key', 'found_json').catch(() => []))
}

export const seriesRatingStamp = async ({ isEnabled = lookupEnabled } = {}) => {
  const [enabled, rows] = await Promise.all([
    isEnabled().catch(() => false),
    seriesRatingRows().first(db.raw('count(*) as count'), db.raw('max(expires_at) as latest')).catch(() => null),
  ])
  return enabled ? rows : { count: 0, latest: 0 }
}

export const hasSavedSeriesRatings = async () => Boolean(await db('programme_ratings')
  .where('lookup_key', 'like', `${SERIES_RATINGS_PREFIX}%`)
  .first('lookup_key')
  .catch(() => null))

export const warmSeriesRatingsIfEmpty = async ({ hasSaved = hasSavedSeriesRatings, refresh }) => {
  if (await hasSaved()) return { skipped: true }
  return refresh()
}

const pendingTitlesOf = ({ titles, fresh }) => {
  const byKey = new Map()
  for (const title of titles) {
    const key = showKeyOf(title)
    if (title && key && !fresh.has(key) && !byKey.has(key)) byKey.set(key, { key, title })
  }
  return [...byKey.values()]
}

const seriesRatingRows = () => db('programme_ratings').where('lookup_key', 'like', `${SERIES_RATINGS_PREFIX}%`).whereNot('found_json', 'null')

const countryOf = (show) => show.network?.country?.code || show.webChannel?.country?.code || null

const tvmazeUrlOf = (url) => (typeof url === 'string' && url.startsWith(`${TVMAZE_WEB}/shows/`) ? url : null)

const lookupEnabled = async () => {
  const [genreLookup, ratingsLookup] = await Promise.all([getSetting(GENRE_LOOKUP_KEY), getSetting(RATINGS_SETTING)])
  return seriesRatingsEnabledFrom({ genreLookup, ratingsLookup })
}

const databaseCache = {
  freshKeys: async (nowMs) => new Set((await db('programme_ratings')
    .where('lookup_key', 'like', `${SERIES_RATINGS_PREFIX}%`)
    .where('expires_at', '>', nowMs)
    .select('lookup_key'))
    .map((row) => row.lookup_key.slice(SERIES_RATINGS_PREFIX.length))),
  write: ({ key, facts, expiresAt }) => db('programme_ratings')
    .insert({ lookup_key: `${SERIES_RATINGS_PREFIX}${key}`, found_json: JSON.stringify(facts), expires_at: expiresAt })
    .onConflict('lookup_key')
    .merge(),
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const FAILED = Symbol('failed')
const TVMAZE_API = 'https://api.tvmaze.com'
const MAX_FAILURES_IN_ROW = 5
const DEFAULT_BUDGET = 300
const LOOKUP_GAP_MS = 1000
const REQUEST_TIMEOUT_MS = 8000
const MAX_RESPONSE_BYTES = 256 * 1024
const HIT_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000
