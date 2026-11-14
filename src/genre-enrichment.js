import axios from 'axios'

import { db, getSetting } from './db.js'
import { artworkClient } from './fallback-artwork.js'
import { showTitleKey } from './show-artwork.js'
import { FILM_MIN_MS } from './film-rule.js'
import { MOVIE, NOT_MOVIE, ONE_OFF_KIND, SHOW_KIND, loadKindOverrides, withKindOverrides } from './programme-kind.js'
import { showKeyOf } from './web/show-key.js'
import { isLiveEventTitle } from './for-you-label-rules.js'
import { hasEpisodeDetails } from './episode-details.js'

export const GENRE_LOOKUP_KEY = 'for_you_genre_lookup'

export const GENRE_TAGS = [
  'drama', 'comedy', 'reality', 'lifestyle', 'food', 'home', 'travel', 'documentary', 'news', 'sport',
  'kids', 'quiz', 'crime', 'sci-fi', 'movie', 'movie-action', 'movie-comedy', 'movie-drama', 'movie-thriller',
  'movie-horror', 'movie-sci-fi', 'movie-romance', 'movie-family', 'movie-documentary',
]

export const GENRE_TAG_LABELS = {
  drama: 'Drama',
  comedy: 'Comedy',
  reality: 'Reality',
  lifestyle: 'Lifestyle',
  food: 'Food',
  home: 'Home and renovation',
  travel: 'Travel',
  documentary: 'Documentary',
  news: 'News',
  sport: 'Sport',
  kids: 'Kids',
  quiz: 'Quiz and game shows',
  crime: 'Crime',
  'sci-fi': 'Sci-fi',
  movie: 'Movies',
  'movie-action': 'Action movies',
  'movie-comedy': 'Comedy movies',
  'movie-drama': 'Drama movies',
  'movie-thriller': 'Thriller movies',
  'movie-horror': 'Horror movies',
  'movie-sci-fi': 'Sci-fi movies',
  'movie-romance': 'Romance movies',
  'movie-family': 'Family movies',
  'movie-documentary': 'Documentary movies',
}

export const genreLookupEnabledFrom = (stored) => stored !== 'false'

export const genreTagsOfTvmaze = ({ genres = [], type = null }) => {
  const found = new Set()
  for (const genre of genres) for (const category of TVMAZE_GENRES[genre] || []) found.add(category)
  for (const category of TVMAZE_TYPES[type] || []) found.add(category)
  if (type === 'Documentary') found.delete('drama')
  if (found.has('kids')) found.delete('drama')
  return GENRE_TAGS.filter((category) => found.has(category))
}

export const genreTagsOfFilmGenres = (labels = []) => {
  const found = new Set(['movie'])
  for (const label of labels) {
    const text = String(label).toLowerCase()
    for (const [pattern, category] of FILM_GENRE_PATTERNS) if (pattern.test(text)) found.add(category)
  }
  return GENRE_TAGS.filter((category) => found.has(category))
}

export const genreTagsOfEtsi = (genre, country = '') => {
  const code = Number(genre)
  if (!Number.isInteger(code) || code <= 0) return []
  if (ETSI_CODES[code]) return ETSI_CODES[code]
  if (country === 'au' && AU_ONLY_GROUPS[code >> 4]) return AU_ONLY_GROUPS[code >> 4]
  return ETSI_GROUPS[code >> 4] || []
}

export const keywordGenreTagsOf = (title) => {
  const text = String(title || '')
  if (NEWS_TITLE.test(text)) return ['news']
  if (SPORT_TITLE.test(text)) return ['sport']
  return []
}

export const isMovieLike = (programme) => {
  const lengthMs = Number(programme?.end) - Number(programme?.start)
  if (!(lengthMs >= FILM_MIN_MS) || isNewsOrSport(programme)) return false
  if (genreTagsOfEtsi(programme?.genre).includes('movie')) return true
  return programme?.series_no == null && programme?.episode_no == null && !programme?.episode_title
}

export const isFilmAiring = ({ programme, record = null, airingsInWeek = 1 }) => {
  if (record?.kindOverride === MOVIE) return true
  if ([NOT_MOVIE, SHOW_KIND, ONE_OFF_KIND].includes(record?.kindOverride)) return false
  if (String(record?.source || '').startsWith('tvmaze:')) return false
  if (record?.genreTags?.includes('movie')) return !hasEpisodeDetails(programme)
  if (isLiveEventTitle(programme?.title)) return false
  if (!isMovieLike(programme)) return false
  return genreTagsOfEtsi(programme?.genre).includes('movie') || airingsInWeek <= MAX_FILM_AIRINGS
}

export const movieChoiceOf = ({ programme, film }) => {
  if (hasEpisodeFields(programme)) return null
  if (film) return NOT_MOVIE
  return isLong(programme) && !isNewsOrSport(programme) ? MOVIE : null
}

const hasEpisodeFields = (programme) => programme?.series_no != null
  || programme?.episode_no != null
  || Boolean(programme?.episode_title)

const isLong = (programme) => Number(programme?.end) - Number(programme?.start) >= FILM_MIN_MS

const isNewsOrSport = (programme) => [...genreTagsOfEtsi(programme?.genre), ...keywordGenreTagsOf(programme?.title)]
  .some((category) => NEWS_OR_SPORT.has(category))

export const tvmazeFactsOf = (record) => {
  const facts = { premiered: null, ended: false }
  for (const genre of record?.genres || []) {
    if (genre.startsWith('premiered:')) facts.premiered = Date.parse(genre.slice('premiered:'.length)) || null
    if (genre === 'status:Ended') facts.ended = true
  }
  return facts
}

export const yearOf = ({ title, synopsis }) => {
  const match = `${title || ''} ${synopsis || ''}`.match(/\((19\d{2}|20\d{2})\)/)
  return match ? Number(match[1]) : null
}

export const pickTvmazeShow = ({ results = [], title, country = '' }) => {
  const key = showTitleKey(title)
  if (!key) return null
  const matches = results.map((result) => result?.show).filter((show) => show && showTitleKey(show.name) === key)
  return matches.find((show) => countryOf(show) === String(country).toUpperCase()) || matches[0] || null
}

export const tvQueryOf = (ids) => `SELECT ?item ?label (GROUP_CONCAT(DISTINCT ?genreLabel; separator="|") AS ?genres) (GROUP_CONCAT(DISTINCT ?code; separator="|") AS ?countries) WHERE {
  VALUES ?item { ${ids.map((id) => `wd:${id}`).join(' ')} }
  VALUES ?kind { wd:Q5398426 wd:Q15416 wd:Q1259759 wd:Q526877 }
  ?item wdt:P31 ?kind .
  ?item rdfs:label ?label FILTER(LANG(?label) = "en")
  OPTIONAL { ?item wdt:P136 ?genre . ?genre rdfs:label ?genreLabel FILTER(LANG(?genreLabel) = "en") }
  OPTIONAL { ?item wdt:P495 ?origin . ?origin wdt:P297 ?code }
} GROUP BY ?item ?label`

export const tvRowsOf = (sparql) => (sparql?.results?.bindings || []).map((binding) => ({
  id: String(binding.item?.value || '').split('/').at(-1),
  label: binding.label?.value || '',
  genres: String(binding.genres?.value || '').split('|').filter(Boolean),
  countries: String(binding.countries?.value || '').split('|').filter(Boolean),
}))

export const pickTvItem = ({ rows = [], title, country = '' }) => {
  const key = showTitleKey(title)
  const matches = rows.filter((row) => showTitleKey(row.label) === key)
  return matches.find((row) => row.countries.includes(String(country).toUpperCase())) || matches[0] || null
}

export const isCurrentLookup = (genres = []) => genres.includes(LOOKUP_TOKEN) || genres.includes(PARTIAL_TOKEN)

export const showRecordOf = ({ show = null, item = null }) => {
  const tvmaze = show ? tvmazeRecordOf(show) : { genres: [], genreTags: [], source: null }
  const origin = (show && countryOf(show)) || item?.countries?.[0] || null
  return {
    genres: [
      ...tvmaze.genres,
      ...(item?.genres ?? []).map((genre) => `wd:${genre}`),
      ...(origin ? [`country:${origin}`] : []),
    ],
    genreTags: tvmaze.genreTags,
    source: tvmaze.source ?? (item ? `wikidata:${item.id}` : null),
  }
}

export const pickFilm = ({ rows = [], title, year = null }) => {
  const key = showTitleKey(title)
  const matches = rows.filter((row) => showTitleKey(row.label) === key)
  const dated = year ? matches.filter((row) => Math.abs(Number(row.year) - year) <= 1) : matches
  if (dated.length === 1) return dated[0]
  if (!dated.length) return null
  const signatures = new Set(dated.map((row) => genreTagsOfFilmGenres(row.genres).join('|')))
  return signatures.size === 1 ? dated[0] : null
}

export const filmQueryOf = (ids) => `SELECT ?film ?label (MIN(YEAR(?date)) AS ?year) (GROUP_CONCAT(DISTINCT ?genreLabel; separator="|") AS ?genres) WHERE {
  VALUES ?film { ${ids.map((id) => `wd:${id}`).join(' ')} }
  VALUES ?kind { wd:Q11424 wd:Q24869 wd:Q202866 wd:Q506240 wd:Q93204 }
  ?film wdt:P31 ?kind .
  ?film rdfs:label ?label FILTER(LANG(?label) = "en")
  OPTIONAL { ?film wdt:P577 ?date }
  OPTIONAL { ?film wdt:P136 ?genre . ?genre rdfs:label ?genreLabel FILTER(LANG(?genreLabel) = "en") }
} GROUP BY ?film ?label`

export const filmRowsOf = (sparql) => (sparql?.results?.bindings || []).map((binding) => ({
  id: String(binding.film?.value || '').split('/').at(-1),
  label: binding.label?.value || '',
  year: binding.year?.value ? Number(binding.year.value) : null,
  genres: String(binding.genres?.value || '').split('|').filter(Boolean),
}))

export const lookupOrderOf = ({ titles = [], cachedKeys = new Set(), budget = DEFAULT_BUDGET }) => {
  const merged = new Map()
  for (const item of titles) {
    const key = showKeyOf(item.title)
    if (!item.title || cachedKeys.has(key)) continue
    merged.set(key, merged.has(key) ? mergedLookupOf(merged.get(key), item) : { ...item, key })
  }
  const pending = [...merged.values()].filter((item) => !keywordGenreTagsOf(item.title).length || item.priority)
  return pending.sort((a, b) => (b.priority || 0) - (a.priority || 0)).slice(0, budget)
}

const mergedLookupOf = (kept, item) => ({
  ...kept,
  movie: Boolean(kept.movie || item.movie),
  episodes: Boolean(kept.episodes || item.episodes),
  year: kept.year ?? item.year ?? null,
  priority: Math.max(kept.priority || 0, item.priority || 0),
})

export const createGenreEnrichment = ({
  client = artworkClient,
  searchTvmaze = (title) => tvmazeSearch({ client, title }),
  searchWikidata = wikidataSearch,
  queryWikidata = wikidataQuery,
  cache = databaseCache,
  isEnabled = genreLookupEnabled,
  now = Date.now,
  gapMs = LOOKUP_GAP_MS,
  sleep = wait,
  onTvmazeShow = () => {},
  onFilm = () => {},
  country = () => '',
} = {}) => {
  let running = null

  const lookUp = async ({ title, movie, episodes, year }, { useWikidata }) => {
    if (movie && !episodes) return { record: await lookUpFilm({ title, year }) }
    await sleep(gapMs)
    const show = pickTvmazeShow({ results: await searchTvmaze(title), title, country: country() })
    if (show) notify(() => onTvmazeShow({ title, show }))
    const item = useWikidata ? await lookUpTvItem({ title }).catch(() => FAILED) : SKIPPED
    const wikidataFailed = item === FAILED
    if (item === FAILED || item === SKIPPED) return { record: show ? { ...showRecordOf({ show }), partial: true } : UNANSWERED, wikidataFailed }
    return { record: show || item ? showRecordOf({ show, item }) : null, wikidataFailed }
  }

  const lookUpTvItem = async ({ title }) => {
    await sleep(gapMs)
    const ids = await searchWikidata(title)
    if (!ids.length) return null
    await sleep(gapMs)
    return pickTvItem({ rows: tvRowsOf(await queryWikidata(tvQueryOf(ids))), title, country: country() })
  }

  const lookUpFilm = async ({ title, year }) => {
    await sleep(gapMs)
    const ids = await searchWikidata(title)
    if (!ids.length) return null
    await sleep(gapMs)
    const film = pickFilm({ rows: filmRowsOf(await queryWikidata(filmQueryOf(ids))), title, year })
    if (film) notify(() => onFilm({ title, id: film.id }))
    return film ? { genres: film.genres, genreTags: genreTagsOfFilmGenres(film.genres), source: `wikidata:${film.id}` } : null
  }

  const enrich = async ({ titles = [], budget = DEFAULT_BUDGET } = {}) => {
    if (!(await isEnabled())) return { looked: 0, found: 0, skipped: true }
    const cachedKeys = await cache.freshKeys(now())
    const pending = lookupOrderOf({ titles, cachedKeys, budget })
    let found = 0
    let looked = 0
    let failuresInRow = 0
    let wikidataFailuresInRow = 0
    for (const item of pending) {
      if (failuresInRow >= MAX_FAILURES_IN_ROW) break
      looked += 1
      const { record, wikidataFailed = false } = await lookUp(item, { useWikidata: wikidataFailuresInRow < MAX_FAILURES_IN_ROW }).catch(() => ({ record: FAILED }))
      failuresInRow = record === FAILED ? failuresInRow + 1 : 0
      if (wikidataFailuresInRow < MAX_FAILURES_IN_ROW) wikidataFailuresInRow = wikidataFailed ? wikidataFailuresInRow + 1 : 0
      if (record === FAILED || record === UNANSWERED) continue
      if (record) found += 1
      await cache.write({
        key: item.key,
        genres: [...(record?.genres || []), record?.partial ? PARTIAL_TOKEN : LOOKUP_TOKEN],
        genreTags: record?.genreTags || [],
        source: record?.source || null,
        expiresAt: now() + (record && !record.partial ? HIT_TTL_MS : MISS_TTL_MS),
      }).catch(() => {})
    }
    return { looked, found }
  }

  const run = (options) => {
    running ??= enrich(options).finally(() => { running = null })
    return running
  }

  return { run, isRunning: () => Boolean(running) }
}

export const rememberTvmazeShow = async ({ title, show, nowMs = Date.now() }) => {
  if (!show || !title) return
  const key = showKeyOf(title)
  const kept = await db('title_genres').where({ title_key: key }).first('genres_json').catch(() => null)
  const record = tvmazeRecordOf(show)
  const genres = [...record.genres, ...parseList(kept?.genres_json).filter((genre) => KEPT_TOKEN.test(genre))]
  const isPartial = genres.includes('lookup:partial')
  await databaseCache.write({ key, ...record, genres, expiresAt: nowMs + (isPartial ? MISS_TTL_MS : HIT_TTL_MS) }).catch(() => {})
}

export const loadTitleGenres = async () => {
  const [rows, overrides] = await Promise.all([
    db('title_genres').select('title_key', 'categories_json', 'genres_json', 'source').catch(() => []),
    loadKindOverrides().catch(() => new Map()),
  ])
  const records = new Map(rows.map((row) => [row.title_key, {
    genreTags: parseList(row.categories_json),
    genres: parseList(row.genres_json),
    source: row.source || null,
  }]))
  return withKindOverrides({ records, overrides })
}

const tvmazeRecordOf = (show) => ({
  genres: [
    ...(show.genres || []),
    ...(show.type ? [`type:${show.type}`] : []),
    ...(show.premiered ? [`premiered:${show.premiered}`] : []),
    ...(show.status ? [`status:${show.status}`] : []),
  ],
  genreTags: genreTagsOfTvmaze({ genres: show.genres || [], type: show.type || null }),
  source: `tvmaze:${show.id}`,
})

const notify = (hook) => Promise.resolve().then(hook).catch(() => {})

const countryOf = (show) => show.network?.country?.code || show.webChannel?.country?.code || null

const parseList = (json) => {
  try {
    const value = JSON.parse(json)
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

const genreLookupEnabled = async () => genreLookupEnabledFrom(await getSetting(GENRE_LOOKUP_KEY))

const tvmazeSearch = async ({ client, title }) => {
  const results = await client.getJson({ url: `${TVMAZE_API}/search/shows`, params: { q: title }, isBackground: true })
  return Array.isArray(results) ? results : []
}

const wikidataSearch = async (title) => {
  const res = await axios.get(WIKIDATA_API, {
    params: { action: 'wbsearchentities', search: title, language: 'en', type: 'item', limit: 7, format: 'json' },
    timeout: REQUEST_TIMEOUT_MS,
    validateStatus: () => true,
    headers: { 'User-Agent': USER_AGENT },
  })
  if (res.status !== 200) throw new Error(`Wikidata HTTP ${res.status}`)
  return (res.data?.search || []).map((item) => item.id).filter((id) => /^Q\d+$/.test(id))
}

const wikidataQuery = async (query) => {
  const res = await axios.get(WIKIDATA_SPARQL, {
    params: { query, format: 'json' },
    timeout: SPARQL_TIMEOUT_MS,
    validateStatus: () => true,
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' },
  })
  if (res.status !== 200) throw new Error(`Wikidata SPARQL HTTP ${res.status}`)
  return res.data
}

const databaseCache = {
  freshKeys: async (nowMs) => new Set((await db('title_genres').where('expires_at', '>', nowMs).select('title_key', 'genres_json'))
    .filter((row) => isCurrentLookup(parseList(row.genres_json)))
    .map((row) => row.title_key)),
  write: ({ key, genres, genreTags, source, expiresAt }) => db('title_genres')
    .insert({
      title_key: key,
      genres_json: JSON.stringify(genres),
      categories_json: JSON.stringify(genreTags),
      source,
      expires_at: expiresAt,
    })
    .onConflict('title_key')
    .merge(),
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const TVMAZE_GENRES = {
  Drama: ['drama'],
  Medical: ['drama'],
  Romance: ['drama'],
  Family: ['drama'],
  War: ['drama'],
  Western: ['drama'],
  History: ['drama'],
  Legal: ['drama', 'crime'],
  Comedy: ['comedy'],
  Crime: ['crime'],
  Thriller: ['crime'],
  Mystery: ['crime'],
  Espionage: ['crime'],
  Action: ['drama'],
  Adventure: ['drama'],
  'Science-Fiction': ['sci-fi'],
  Fantasy: ['sci-fi'],
  Supernatural: ['sci-fi'],
  Horror: ['sci-fi'],
  Children: ['kids'],
  Anime: ['kids'],
  Food: ['food'],
  Travel: ['travel'],
  Nature: ['documentary'],
  DIY: ['home'],
  Sports: ['sport'],
  Music: ['lifestyle'],
}

const TVMAZE_TYPES = {
  Reality: ['reality'],
  Documentary: ['documentary'],
  News: ['news'],
  Sports: ['sport'],
  'Game Show': ['quiz'],
  'Panel Show': ['quiz', 'comedy'],
  'Talk Show': ['lifestyle'],
  Variety: ['lifestyle'],
  'Award Show': ['lifestyle'],
}

const FILM_GENRE_PATTERNS = [
  [/action|adventure|war|western|martial arts|swashbuckler|disaster/, 'movie-action'],
  [/comedy/, 'movie-comedy'],
  [/drama|biograph|historical|period/, 'movie-drama'],
  [/thriller|crime|mystery|heist|noir|gangster|detective|spy/, 'movie-thriller'],
  [/horror|slasher|zombie/, 'movie-horror'],
  [/science fiction|sci-fi|fantasy|superhero|dystopian/, 'movie-sci-fi'],
  [/romance|romantic/, 'movie-romance'],
  [/family|children|animated|animation|musical/, 'movie-family'],
  [/documentary/, 'movie-documentary'],
]

const ETSI_CODES = {
  0x10: ['drama', 'movie'],
  0x11: ['crime', 'movie', 'movie-thriller'],
  0x12: ['drama', 'movie', 'movie-action'],
  0x13: ['sci-fi', 'movie', 'movie-sci-fi'],
  0x14: ['comedy', 'movie', 'movie-comedy'],
  0x15: ['drama'],
  0x16: ['drama', 'movie', 'movie-romance'],
  0x17: ['drama', 'movie', 'movie-drama'],
  0x18: ['drama'],
  0x31: ['quiz'],
  0x32: ['lifestyle'],
  0x33: ['lifestyle'],
  0x90: ['documentary'],
  0x91: ['documentary'],
  0x92: ['documentary'],
  0xa1: ['travel'],
  0xa4: ['lifestyle'],
  0xa5: ['food'],
  0xa6: ['lifestyle'],
  0xa7: ['home'],
}

const AU_ONLY_GROUPS = {
  0xc: ['comedy'],
  0xd: ['drama'],
  0xe: ['documentary'],
}

const ETSI_GROUPS = {
  0x1: ['drama', 'movie'],
  0x2: ['news'],
  0x3: ['lifestyle'],
  0x4: ['sport'],
  0x5: ['kids'],
  0x6: ['lifestyle'],
  0x7: ['documentary'],
  0x8: ['news'],
  0x9: ['documentary'],
  0xa: ['lifestyle'],
}

const NEWS_TITLE = /\bnews\b|^today\b|^weekend today|sunrise$|^sunrise\b|a current affair|^7\.30\b|^insiders$|^landline$|^the drum$|^the project$|^afternoon briefing|^business\b|^weather\b|^world this week/i
const SPORT_TITLE = /\b(afl|aflw|nrl|nrlw|cricket|football|soccer|tennis|golf|rugby|netball|racing|races|supercars|motogp|formula 1|f1|olympics?|basketball|nba|nfl|boxing|ufc|wwe|sports?|grand prix|world cup|a-league|surfing|cycling|tour de france|bathurst|grand final|wimbledon|test match|big bash|state of origin)\b/i

const NEWS_OR_SPORT = new Set(['news', 'sport'])
const FAILED = Symbol('failed')
const LOOKUP_TOKEN = 'lookup:2'
const PARTIAL_TOKEN = 'lookup:partial'
const KEPT_TOKEN = /^(wd|country|lookup):/
const SKIPPED = Symbol('skipped')
const UNANSWERED = Symbol('unanswered')
const MAX_FAILURES_IN_ROW = 5
const MAX_FILM_AIRINGS = 4
const DEFAULT_BUDGET = 1500
const LOOKUP_GAP_MS = 700
const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000
const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000
const REQUEST_TIMEOUT_MS = 8000
const SPARQL_TIMEOUT_MS = 20000
const TVMAZE_API = 'https://api.tvmaze.com'
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php'
const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql'
const USER_AGENT = 'Freetvarr (https://github.com/furey/freetvarr)'
