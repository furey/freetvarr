export const TOP_RATED_LIMIT = 10
export const PRIOR_SCORE = 6.5
export const PRIOR_VOTES = 1000
export const OTHER_LANGUAGE_CHOICES = ['all', 'few', 'none']
export const DEFAULT_OTHER_LANGUAGE_CHOICE = 'few'
export const OTHER_LANGUAGE_LIMITS = { all: Infinity, few: 2, none: 0 }
export const FILM_RATINGS_PREFIX = 'tmdb:movie:'
export const SERIES_RATINGS_PREFIX = 'tvmaze:series:'
export const MIN_SERIES_SCORE = 7
export const MIN_SERIES_WEIGHT = 50
export const MIN_DOMINANT_WEIGHT = 50
export const DOMINANT_WEIGHT_RATIO = 3

export const otherLanguageChoiceFrom = (value) => (OTHER_LANGUAGE_CHOICES.includes(value)
  ? value
  : DEFAULT_OTHER_LANGUAGE_CHOICE)

export const otherLanguageLimitOf = (choice) => OTHER_LANGUAGE_LIMITS[otherLanguageChoiceFrom(choice)]

export const weightedScoreOf = ({ score, votes, priorScore = PRIOR_SCORE, priorVotes = PRIOR_VOTES }) => {
  const count = Math.max(0, Number(votes) || 0)
  return (count / (count + priorVotes)) * Number(score) + (priorVotes / (count + priorVotes)) * priorScore
}

export const isOtherLanguage = (facts) => Boolean(facts?.originalLanguage) && facts.originalLanguage !== 'en'

export const hasRealScore = (facts) => facts?.score != null && Number(facts.score) > 0

export const withinLanguageLimit = ({ entries, isOther, limit }) => {
  let others = 0
  return entries.filter((entry) => {
    if (!isOther(entry)) return true
    others += 1
    return others <= limit
  })
}

export const isCinematicSeries = ({ tvmazeType = null, tmdbType = null }) => (tvmazeType
  ? TVMAZE_CINEMATIC_TYPES.has(tvmazeType)
  : TMDB_CINEMATIC_TYPES.has(tmdbType))

export const isTopRatedSeries = (facts) => Number(facts?.score) >= MIN_SERIES_SCORE
  && Number(facts?.weight) >= MIN_SERIES_WEIGHT
  && isCinematicSeries({ tvmazeType: facts?.type || 'unknown' })

export const dominantShowOf = (shows = []) => {
  const [top, next] = [...shows].sort((a, b) => (b.weight || 0) - (a.weight || 0))
  if (!top || (top.weight || 0) < MIN_DOMINANT_WEIGHT) return null
  return !next || top.weight >= (next.weight || 0) * DOMINANT_WEIGHT_RATIO ? top : null
}

export const tvmazeIdOf = (record) => String(record?.source || '').match(/^tvmaze:(\d+)$/)?.[1] ?? null

export const seriesFactsByKeyOf = (rows = []) => {
  const facts = new Map()
  for (const row of rows) {
    const key = String(row.lookup_key || '').startsWith(SERIES_RATINGS_PREFIX) ? row.lookup_key.slice(SERIES_RATINGS_PREFIX.length) : null
    const found = parseFound(row.found_json)
    if (key && found) facts.set(key, seriesFactsOf(found))
  }
  return facts
}

export const seriesFactsOf = (found) => ({
  score: Number(found.score) || null,
  weight: Number(found.weight) || 0,
  type: found.type ?? null,
  runtime: Number(found.runtime) || null,
  url: found.url ?? null,
})

export const filmFactsByKeyOf = (rows = []) => {
  const facts = new Map()
  for (const row of rows) {
    const key = filmKeyOf(row.lookup_key)
    const found = parseFound(row.found_json)
    if (!key || !found) continue
    const known = facts.get(key)
    if (known && !isUndated(row.lookup_key)) continue
    facts.set(key, factsOf(found))
  }
  return facts
}

export const filmFactsForTitlesOf = ({ titles, factsByKey, keyOf }) => {
  const facts = new Map()
  for (const title of titles) {
    const found = factsByKey.get(keyOf(title))
    if (found) facts.set(title, found)
  }
  return facts
}

const filmKeyOf = (lookupKey) => {
  const text = String(lookupKey || '')
  if (!text.startsWith(FILM_RATINGS_PREFIX)) return null
  return text.slice(FILM_RATINGS_PREFIX.length).replace(/@\d{4}$/, '') || null
}

const isUndated = (lookupKey) => !/@\d{4}$/.test(String(lookupKey))

const parseFound = (json) => {
  try {
    const found = JSON.parse(json)
    return found && typeof found === 'object' ? found : null
  } catch {
    return null
  }
}

const factsOf = (found) => ({
  score: found.score ?? null,
  votes: found.votes ?? null,
  originalLanguage: found.originalLanguage ?? null,
})

const TVMAZE_CINEMATIC_TYPES = new Set(['Scripted', 'Animation', 'Documentary'])
const TMDB_CINEMATIC_TYPES = new Set(['Scripted', 'Documentary', 'Miniseries'])
