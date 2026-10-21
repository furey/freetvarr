import { showTitleKey } from './show-artwork.js'

export const programmeHintsOf = (programs = []) => {
  const matching = programs.filter((program) => program?.title)
  if (!matching.length) return null
  const title = matching[0].title
  const synopsis = matching
    .map((program) => String(program.synopsis || '').trim())
    .sort((a, b) => b.length - a.length)[0] || ''
  const isEpisode = matching.some((program) =>
    program.series_no != null || program.episode_no != null || Boolean(program.episode_title))
  return {
    title,
    synopsis,
    isEpisode,
    years: yearsOf(`${title} ${synopsis}`),
    releaseYears: releaseYearsOf({ title, synopsis }),
    castNames: castNamesOf(synopsis),
    episodeTitles: [...new Set(matching.map((program) => episodeTitleKeyOf(program.episode_title)).filter(Boolean))],
    ...evidenceWordsOf({ synopsis, title }),
  }
}

export const episodeTitleKeyOf = (value) => {
  const key = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  return key.length >= MIN_EPISODE_TITLE_LENGTH && !GENERIC_EPISODE_TITLE.test(key) ? key : null
}

export const programmeHintsByTitle = (programs = []) => {
  const grouped = new Map()
  for (const program of programs) {
    const key = showTitleKey(program?.title)
    if (!key) continue
    if (!grouped.has(key)) grouped.set(key, [])
    if (grouped.get(key).length < MAX_PROGRAMMES_PER_TITLE) grouped.get(key).push(program)
  }
  return new Map([...grouped].map(([key, group]) => [key, programmeHintsOf(group)]))
}

export const guideKindsByTitle = (programs = []) => {
  const kinds = new Map()
  for (const program of programs) {
    const key = showTitleKey(program?.title)
    if (!key) continue
    const everyEarlierFilm = kinds.has(key) ? kinds.get(key) : true
    kinds.set(key, everyEarlierFilm && program.kind === FILM_KIND)
  }
  return new Map([...kinds].filter(([, isFilm]) => isFilm).map(([key]) => [key, FILM_KIND]))
}

export const yearsOf = (text) => [...new Set(
  [...String(text || '').matchAll(/\b(19[2-9]\d|20[0-4]\d)\b/g)].map((match) => Number(match[1])),
)]

export const releaseYearsOf = ({ title, synopsis }) => yearsOf([
  title,
  ...[...String(synopsis || '').matchAll(/\((?:19|20)\d{2}\)/g)].map((match) => match[0]),
].join(' '))

export const castNamesOf = (synopsis) => {
  const text = String(synopsis || '')
  const bracketed = [...text.matchAll(/\(([^()]{3,200})\)/g)].map((match) => match[1])
  const starring = text.match(/\bstarring\s+([^.]{3,200})/i)?.[1]
  return [...new Set([...bracketed, starring].filter(Boolean)
    .flatMap((listed) => listed.split(/,|\band\b|&/))
    .map((name) => name.trim())
    .filter(looksLikeName))]
}

export const titleVariantsOf = (title) => {
  const trimmed = String(title || '').trim()
  const withoutYear = trimmed.replace(YEAR_SUFFIX, '').trim()
  const withoutRegion = withoutYear.replace(REGION_SUFFIX, '').trim()
  return [...new Set([trimmed, withoutYear, withoutRegion].filter(Boolean))]
}

export const artworkKindOf = (kind) => (kind === FILM_KIND ? FILM_KIND : null)

export const hintsForKind = ({ hints, kind }) => (hints && artworkKindOf(kind)
  ? { ...hints, kind: FILM_KIND, isEpisode: false }
  : hints)

export const tmdbSearchOf = ({ title, hints }) => {
  if (hints?.kind === FILM_KIND) {
    const year = hints.releaseYears?.length === 1 ? { year: hints.releaseYears[0] } : {}
    return { path: '/search/movie', mediaType: 'movie', params: { query: title, ...year } }
  }
  if (hints?.isEpisode) return { path: '/search/tv', mediaType: 'tv', params: { query: title } }
  return { path: '/search/multi', mediaType: null, params: { query: title } }
}

export const evidenceWordsOf = ({ synopsis, title }) => {
  const titleWords = new Set(wordsOf(title).map(normalisedWord))
  const sentences = String(synopsis || '').replace(/\([^()]*\)/g, ' ').split(/(?<=[.!?:;])\s+/)
  const properNouns = new Set()
  const leadingNames = new Set()
  const words = new Set()
  for (const sentence of sentences) {
    wordsOf(sentence).forEach((word, index) => {
      const key = normalisedWord(word)
      if (titleWords.has(key) || COMMON_WORDS.has(key) || key.length < 3) return
      const capitalised = /^\p{Lu}/u.test(word) && !COMMON_PROPER_NOUNS.has(key)
      if (index > 0 && capitalised) properNouns.add(key)
      else if (index === 0 && capitalised) leadingNames.add(key)
      else if (key.length >= DISTINCTIVE_WORD_LENGTH) words.add(key)
    })
  }
  return {
    properNouns: [...properNouns],
    leadingNames: [...leadingNames].filter((name) => !properNouns.has(name)),
    words: [...words].filter((word) => !properNouns.has(word)),
  }
}

export const dominantFilmOf = (candidates = []) => {
  const [top, next] = [...candidates].sort((a, b) => votesOf(b) - votesOf(a))
  if (!top || votesOf(top) < DOMINANT_FILM_VOTES) return null
  return !next || votesOf(top) >= votesOf(next) * DOMINANT_FILM_RATIO ? top : null
}

export const sharesAnyTerm = ({ hints, text = '' }) => {
  const haystack = ` ${normalisedText(text)} `
  return [...(hints?.properNouns || []), ...(hints?.leadingNames || []), ...(hints?.words || [])]
    .some((term) => haystack.includes(` ${normalisedText(term)} `))
}

const votesOf = (details) => Number(details?.vote_count) || 0

export const matchEvidenceOf = ({ hints, candidateYear = null, text = '' }) => {
  if (!hints) return { accepted: false, reason: 'no-hints' }
  const haystack = ` ${normalisedText(text)} `
  const mentions = (phrase) => {
    const needle = normalisedText(phrase)
    return Boolean(needle) && haystack.includes(` ${needle} `)
  }
  const fits = (years) => years.some((year) => Math.abs(year - candidateYear) <= 1)
  if (candidateYear && hints.releaseYears?.length && !fits(hints.releaseYears)) return { accepted: false, reason: 'year' }
  const yearMatches = Boolean(candidateYear && hints.years.length && fits(hints.years))
  const castFound = hints.castNames.filter(mentions)
  if (hints.castNames.length && !castFound.length) return { accepted: false, reason: 'cast' }
  if (castFound.length) return { accepted: true, reason: 'cast' }
  if (yearMatches) return { accepted: true, reason: 'year' }
  const nouns = hints.properNouns.filter(mentions).length
  const words = hints.words.filter(mentions).length
  const accepted = nouns >= 2 || (nouns >= 1 && words >= 2) || words >= MIN_MATCHED_WORDS
  return { accepted, reason: accepted ? 'synopsis' : 'no-evidence' }
}

export const candidateIdsOf = ({ results = [], title }) => {
  const key = showTitleKey(title)
  if (!key) return []
  return results
    .filter((result) => /^Q\d+$/.test(result?.id || ''))
    .filter((result) => [result.label, result.match?.text, ...(result.aliases || [])]
      .some((name) => name && showTitleKey(name) === key))
    .map((result) => result.id)
}

export const articleCandidateIdsOf = ({ pages = [], title }) => {
  const key = showTitleKey(title)
  if (!key) return []
  return [...pages]
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .filter((page) => showTitleKey(String(page.title || '').replace(/\s*\([^()]*\)$/, '')) === key)
    .map((page) => page.pageprops?.wikibase_item)
    .filter((id) => /^Q\d+$/.test(id || ''))
}

export const entityQueryOf = (ids) => `SELECT ?item (GROUP_CONCAT(DISTINCT ?root; separator="|") AS ?roots) (MIN(YEAR(?date)) AS ?year) (SAMPLE(?article) AS ?enwiki) (SAMPLE(?tmdbFilm) AS ?tmdbMovie) (SAMPLE(?tmdbShow) AS ?tmdbTv) (SAMPLE(?imdbId) AS ?imdb) WHERE {
  VALUES ?item { ${ids.map((id) => `wd:${id}`).join(' ')} }
  VALUES ?root { wd:${FILM_CLASS} wd:${TELEVISION_PROGRAM_CLASS} }
  ?item wdt:P31/wdt:P279* ?root .
  OPTIONAL { ?item wdt:P577|wdt:P580 ?date }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
  OPTIONAL { ?item wdt:P4947 ?tmdbFilm }
  OPTIONAL { ?item wdt:P4983 ?tmdbShow }
  OPTIONAL { ?item wdt:P345 ?imdbId }
} GROUP BY ?item`

export const entityRowsOf = (sparql) => (sparql?.results?.bindings || []).map((binding) => {
  const roots = String(binding.roots?.value || '').split('|').map(entityIdOf)
  return {
    id: entityIdOf(binding.item?.value),
    kind: roots.includes(FILM_CLASS) ? 'film' : 'series',
    year: binding.year?.value ? Number(binding.year.value) : null,
    article: articleTitleOf(binding.enwiki?.value),
    tmdbMovie: binding.tmdbMovie?.value || null,
    tmdbTv: binding.tmdbTv?.value || null,
    imdb: binding.imdb?.value || null,
  }
})

export const rankEntities = ({ rows = [], hints, order = [] }) => rows
  .filter((row) => row.article && entityKindFits({ row, hints }))
  .map((row) => ({ row, score: entityScoreOf({ row, hints, position: order.indexOf(row.id) }) }))
  .sort((a, b) => b.score - a.score)
  .map(({ row }) => row)
  .slice(0, MAX_ENTITY_CANDIDATES)

export const pageArtOf = (response) => {
  const page = (response?.query?.pages || []).find((candidate) => !candidate.missing)
  if (!page) return null
  return {
    title: page.title,
    image: page.thumbnail?.source || page.original?.source || null,
    text: `${page.title} ${page.extract || ''}`,
  }
}

export const tmdbAuthOf = (key) => {
  const trimmed = String(key || '').trim()
  if (!trimmed) return null
  return trimmed.includes('.') && trimmed.length > TMDB_V3_KEY_MAX_LENGTH
    ? { headers: { Authorization: `Bearer ${trimmed}` }, params: {} }
    : { headers: {}, params: { api_key: trimmed } }
}

export const tmdbSourcesOf = (details) => [
  details?.backdrop_path ? `${TMDB_IMAGE_BASE}/w1280${details.backdrop_path}` : null,
  details?.poster_path ? `${TMDB_IMAGE_BASE}/w780${details.poster_path}` : null,
].filter(Boolean)

export const tmdbTextOf = (details) => [
  details?.title || details?.name,
  details?.original_title || details?.original_name,
  details?.tagline,
  details?.overview,
  ...(details?.credits?.cast || []).slice(0, MAX_TMDB_CAST).map((person) => `${person.name}. ${person.character || ''}.`),
].filter(Boolean).join(' ')

export const tmdbYearOf = (details) => {
  const year = Number(String(details?.release_date || details?.first_air_date || '').slice(0, 4))
  return year > 0 ? year : null
}

export const tmdbCandidatesOf = ({ results = [], title, hints }) => {
  const key = showTitleKey(title)
  return results
    .filter((result) => ['movie', 'tv'].includes(result.media_type))
    .filter((result) => tmdbKindFits({ result, hints }))
    .filter((result) => [result.title, result.name, result.original_title, result.original_name]
      .some((name) => name && showTitleKey(name) === key))
    .slice(0, MAX_ENTITY_CANDIDATES)
}

export const lookupExpiryOf = ({ found, nowMs, hitTtlMs, missTtlMs }) => nowMs + (found ? hitTtlMs : missTtlMs)

const entityKindFits = ({ row, hints }) => {
  if (hints?.kind === FILM_KIND) return row.kind === 'film'
  return !hints?.isEpisode || row.kind === 'series'
}

const tmdbKindFits = ({ result, hints }) => {
  if (hints?.kind === FILM_KIND) return result.media_type === 'movie'
  return !hints?.isEpisode || result.media_type === 'tv'
}

const entityScoreOf = ({ row, hints, position }) => {
  const hasIds = row.tmdbMovie || row.tmdbTv || row.imdb ? 4 : 0
  const yearFits = hints?.years?.length && row.year && hints.years.some((year) => Math.abs(year - row.year) <= 1) ? 8 : 0
  const searchRank = position >= 0 ? (MAX_SEARCH_RANK - position) / MAX_SEARCH_RANK : 0
  return yearFits + hasIds + searchRank
}

const looksLikeName = (name) => {
  const words = name.split(/\s+/).filter(Boolean)
  return words.length >= 2 && words.length <= 4
    && words.every((word) => /^[\p{Lu}][\p{L}'’.-]*$/u.test(word))
}

const wordsOf = (text) => String(text || '').match(/[\p{L}][\p{L}'’-]*/gu) || []

const normalisedWord = (word) => normalisedText(word).replace(/\s+/g, '')

const normalisedText = (text) => String(text || '')
  .normalize('NFKD')
  .replace(/\p{M}/gu, '')
  .toLowerCase()
  .replace(/['’]s\b/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()

const entityIdOf = (uri) => String(uri || '').split('/').at(-1)

const articleTitleOf = (url) => {
  const prefix = 'https://en.wikipedia.org/wiki/'
  if (!url?.startsWith(prefix)) return null
  try {
    return decodeURIComponent(url.slice(prefix.length)).replace(/_/g, ' ')
  } catch {
    return null
  }
}

const COMMON_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'their', 'they', 'them', 'this', 'that', 'when', 'where', 'while',
  'after', 'before', 'about', 'his', 'her', 'hers', 'him', 'she', 'who', 'what', 'which', 'will', 'has', 'have',
  'are', 'was', 'were', 'but', 'not', 'all', 'one', 'two', 'new', 'out', 'can', 'its', 'our', 'your', 'you',
  'also', 'then', 'than', 'over', 'more', 'most', 'some', 'into', 'onto', 'upon', 'during', 'through', 'together',
  'another', 'against', 'between', 'because', 'however', 'without', 'within', 'around', 'himself', 'herself',
  'themselves', 'episode', 'series', 'season', 'film', 'movie', 'story', 'documentary', 'special', 'program',
  'programme', 'presents', 'present', 'returns', 'tonight', 'week', 'weeks', 'today', 'first', 'final', 'last',
  'young', 'world', 'family', 'friends', 'life', 'people', 'time', 'year', 'years', 'home', 'help', 'must',
  'finds', 'takes', 'makes', 'gets', 'tries', 'discovers', 'explores', 'follows', 'meets', 'learns', 'becomes',
  'during', 'everything', 'something', 'nothing', 'someone', 'everyone', 'little', 'great', 'small', 'large',
])

const COMMON_PROPER_NOUNS = new Set([
  'australia', 'australian', 'australians', 'america', 'american', 'americans', 'britain', 'british', 'england',
  'english', 'london', 'york', 'sydney', 'melbourne', 'brisbane', 'perth', 'adelaide', 'world', 'christmas',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'january', 'february', 'march',
  'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'god', 'mr', 'mrs',
  'ms', 'dr', 'part', 'live', 'new', 'tv', 'abc', 'sbs', 'nine', 'seven', 'ten', 'bbc', 'europe', 'european',
])

const REGION_SUFFIX = /\s*(?:\((?:UK|US|USA|NZ|AU|Aus)\)|\b(?:UK|US|USA|NZ|Australia|New Zealand))$/
const YEAR_SUFFIX = /\s*\((?:19|20)\d{2}\)$/
const FILM_KIND = 'movie'
const FILM_CLASS = 'Q11424'
const TELEVISION_PROGRAM_CLASS = 'Q15416'
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p'
const TMDB_V3_KEY_MAX_LENGTH = 40
const DISTINCTIVE_WORD_LENGTH = 6
const MIN_MATCHED_WORDS = 4
const MAX_ENTITY_CANDIDATES = 3
const MAX_SEARCH_RANK = 10
const MAX_TMDB_CAST = 15
const MAX_PROGRAMMES_PER_TITLE = 8
const MIN_EPISODE_TITLE_LENGTH = 6
const GENERIC_EPISODE_TITLE = /^(episode|part|series|season|chapter)\b|^\d+$/
const DOMINANT_FILM_VOTES = 500
const DOMINANT_FILM_RATIO = 10
