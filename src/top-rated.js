export const TOP_RATED_LIMIT = 10
export const PRIOR_SCORE = 6.5
export const PRIOR_VOTES = 1000
export const OTHER_LANGUAGE_CHOICES = ['all', 'few', 'none']
export const DEFAULT_OTHER_LANGUAGE_CHOICE = 'few'
export const OTHER_LANGUAGE_LIMITS = { all: Infinity, few: 2, none: 0 }
export const FILM_RATINGS_PREFIX = 'tmdb:movie:'

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
