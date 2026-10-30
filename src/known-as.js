import axios from 'axios'

import { db } from './db.js'
import { normaliseSearchText } from './web/search-text.js'
import { showKeyOf } from './web/show-key.js'

export const isLatinName = (name) => LATIN_ONLY.test(name) && /\p{Script=Latin}/u.test(name)

export const knownNamesOf = ({ title, names = [] }) => {
  const titleNorm = normaliseSearchText(title)
  const seen = new Set([titleNorm])
  const kept = []
  for (const raw of names) {
    const name = String(raw ?? '').replace(/\s+/g, ' ').trim()
    const norm = normaliseSearchText(name)
    if (!name || name.length > MAX_NAME_LENGTH || norm.length < 2 || seen.has(norm)) continue
    seen.add(norm)
    kept.push(name)
  }
  return kept.slice(0, MAX_NAMES)
}

export const tvmazeNamesOf = (akas = []) => (Array.isArray(akas) ? akas : [])
  .map((aka) => aka?.name)
  .filter((name) => typeof name === 'string' && isLatinName(name))

export const wikidataAliasQueryOf = (id) => `SELECT ?alias ?country WHERE {
  OPTIONAL { wd:${id} skos:altLabel ?alias FILTER(LANG(?alias) IN ("en", "en-au", "en-gb")) }
  OPTIONAL { wd:${id} wdt:P495 ?country }
}`

export const wikidataNamesOf = (sparql) => {
  const bindings = sparql?.results?.bindings || []
  const countries = new Set(bindings.map((binding) => String(binding.country?.value || '').split('/').at(-1)).filter(Boolean))
  const isEnglishSpeaking = !countries.size || [...countries].some((country) => ENGLISH_SPEAKING_COUNTRIES.has(country))
  return [...new Set(bindings
    .filter((binding) => binding.alias?.value)
    .filter((binding) => isEnglishSpeaking || binding.alias['xml:lang'] === 'en-au')
    .map((binding) => binding.alias.value))]
}

export const createKnownAs = ({
  fetchAkas = tvmazeAkas,
  queryWikidata = wikidataQuery,
  cache = databaseCache,
  onChange = () => {},
  now = Date.now,
  gapMs = LOOKUP_GAP_MS,
  sleep = wait,
} = {}) => {
  let queue = Promise.resolve()

  const spaced = (task) => {
    const run = queue.then(() => sleep(gapMs)).then(task)
    queue = run.catch(() => {})
    return run
  }

  const remember = async ({ title, source, load }) => {
    const key = showKeyOf(title)
    if (!title || await cache.isFresh({ key, nowMs: now() })) return false
    const names = knownNamesOf({ title, names: await spaced(load) })
    await cache.write({ key, names, source, expiresAt: now() + CACHE_TTL_MS })
    if (names.length) onChange()
    return true
  }

  const fromTvmazeShow = ({ title, show }) => (show?.id
    ? remember({ title, source: `tvmaze:${show.id}`, load: async () => tvmazeNamesOf(await fetchAkas(show.id)) }).catch(() => false)
    : Promise.resolve(false))

  const fromWikidataFilm = ({ title, id }) => (/^Q\d+$/.test(String(id || ''))
    ? remember({ title, source: `wikidata:${id}`, load: async () => wikidataNamesOf(await queryWikidata(wikidataAliasQueryOf(id))) }).catch(() => false)
    : Promise.resolve(false))

  return { fromTvmazeShow, fromWikidataFilm }
}

export const loadKnownAs = async () => {
  const rows = await db('title_known_as').select('title_key', 'names_json', 'source').catch(() => [])
  return rows.flatMap((row) => parseNames(row.names_json).map((name) => ({
    key: row.title_key,
    name,
    source: String(row.source || '').split(':')[0] || 'tvmaze',
  })))
}

const parseNames = (json) => {
  try {
    const value = JSON.parse(json)
    return Array.isArray(value) ? value.filter((name) => typeof name === 'string') : []
  } catch {
    return []
  }
}

const tvmazeAkas = async (showId) => {
  const res = await axios.get(`${TVMAZE_API}/shows/${showId}/akas`, {
    timeout: REQUEST_TIMEOUT_MS,
    validateStatus: () => true,
    headers: { 'User-Agent': USER_AGENT },
  })
  if (res.status !== 200) throw new Error(`TVmaze HTTP ${res.status}`)
  return res.data
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
  isFresh: async ({ key, nowMs }) => Boolean(await db('title_known_as').where({ title_key: key }).where('expires_at', '>', nowMs).first()),
  write: ({ key, names, source, expiresAt }) => db('title_known_as')
    .insert({ title_key: key, names_json: JSON.stringify(names), source, expires_at: expiresAt })
    .onConflict('title_key')
    .merge(),
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const LATIN_ONLY = /^[\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]+$/u
const ENGLISH_SPEAKING_COUNTRIES = new Set(['Q408', 'Q664', 'Q145', 'Q30', 'Q16', 'Q27'])
const MAX_NAME_LENGTH = 80
const MAX_NAMES = 12
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000
const LOOKUP_GAP_MS = 700
const REQUEST_TIMEOUT_MS = 8000
const SPARQL_TIMEOUT_MS = 20000
const TVMAZE_API = 'https://api.tvmaze.com'
const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql'
const USER_AGENT = 'Freetvarr (https://github.com/furey/freetvarr)'
