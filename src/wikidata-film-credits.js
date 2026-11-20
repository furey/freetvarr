import { artworkClient } from './fallback-artwork.js'
import { candidateIdsOf, matchEvidenceOf, titleVariantsOf } from './artwork-match.js'
import { WIKIDATA_FILM_KINDS } from './genre-enrichment.js'

export const createWikidataFilmCredits = ({ client = artworkClient } = {}) => {
  const wikidataGet = (params) => client.getJson({ url: WIKIDATA_API, params: { format: 'json', ...params } })

  const labelMatches = async (title) => {
    const found = await wikidataGet({ action: 'wbsearchentities', search: title, language: 'en', uselang: 'en', type: 'item', limit: SEARCH_LIMIT })
    return found?.search || []
  }

  const textMatches = async (title) => {
    const found = await wikidataGet({ action: 'query', list: 'search', srsearch: `${title} haswbstatement:P31=${FILM_ITEM}`, srsort: 'incoming_links_desc', srlimit: SEARCH_LIMIT, srprop: '' })
    const ids = (found?.query?.search || []).map((result) => result.title).filter((id) => /^Q\d+$/.test(id || ''))
    const entities = await entitiesOf({ ids, props: 'labels|aliases|descriptions' })
    return ids.map((id) => searchResultOf({ id, entity: entities[id] }))
  }

  const filmsNamed = async (title) => {
    for (const variant of titleVariantsOf(title)) {
      const films = await filmsNamedExactly(variant)
      if (films.length) return films
    }
    return []
  }

  const filmsNamedExactly = async (title) => {
    const results = [...await labelMatches(title), ...await textMatches(title)]
    const descriptions = new Map(results.map((result) => [result.id, result.description || '']))
    const ids = [...new Set(candidateIdsOf({ results, title }))]
    return (await datedFilms(ids)).map((film) => ({ ...film, description: descriptions.get(film.id) || '' }))
  }

  const datedFilms = async (ids) => {
    if (!ids.length) return []
    const answer = await client.getJson({
      url: WIKIDATA_SPARQL,
      params: { query: filmYearsQueryOf(ids), format: 'json' },
      headers: { Accept: 'application/sparql-results+json' },
      timeoutMs: SPARQL_TIMEOUT_MS,
    })
    return filmYearRowsOf(answer)
  }

  const entitiesOf = async ({ ids, props }) => (ids.length
    ? (await wikidataGet({ action: 'wbgetentities', ids: ids.join('|'), props, languages: 'en|mul', sitefilter: 'enwiki' }))?.entities || {}
    : {})

  const creditsOfFilm = async ({ id, year, description }) => {
    const film = (await entitiesOf({ ids: [id], props: 'claims|sitelinks/urls' }))[id]
    if (!film?.claims) return null
    const plan = filmPlanOf(film.claims)
    const named = await entitiesOf({ ids: idsToNameOf(plan), props: 'labels|sitelinks/urls' })
    return { credits: wikidataCreditsOf({ id, film, plan, named, year }), description }
  }

  return async ({ title, hints = null, year = null }) => {
    const wantedYear = year || singleReleaseYearOf(hints) || titleYearOf(title)
    const films = (await filmsNamed(title)).filter((film) => yearFits({ film, year: wantedYear }))
    if (!films.length) return null
    const built = []
    for (const film of films.slice(0, MAX_CANDIDATES)) {
      const found = await creditsOfFilm(film)
      if (found?.credits) built.push({ ...found, year: film.year })
    }
    if (films.length === 1) return built[0]?.credits || null
    return onlyEvidencedOf({ built, hints })
  }
}

export const filmYearsQueryOf = (ids) => `SELECT ?film (MIN(YEAR(?date)) AS ?year) WHERE {
  VALUES ?film { ${ids.map((id) => `wd:${id}`).join(' ')} }
  VALUES ?kind { ${WIKIDATA_FILM_KINDS.map((id) => `wd:${id}`).join(' ')} }
  ?film wdt:P31 ?kind .
  OPTIONAL { ?film wdt:P577 ?date }
} GROUP BY ?film`

export const filmYearRowsOf = (sparql) => (sparql?.results?.bindings || [])
  .map((binding) => ({
    id: String(binding.film?.value || '').split('/').at(-1),
    year: binding.year?.value ? Number(binding.year.value) : null,
  }))
  .filter((row) => /^Q\d+$/.test(row.id))

export const filmPlanOf = (claims) => ({
  cast: billedCastOf(claims.P161).slice(0, MAX_CAST),
  crew: FILM_CREW_PROPERTIES.flatMap(({ property, job, limit }) => itemIdsOf(claims[property]).slice(0, limit).map((id) => ({ id, job }))),
  company: itemIdsOf(claims.P272)[0] || null,
  genres: itemIdsOf(claims.P136).slice(0, MAX_GENRES),
  language: itemIdsOf(claims.P364)[0] || null,
  minutes: minutesOf(claims.P2047),
  year: earliestYearOf(claims.P577),
})

export const idsToNameOf = (plan) => [...new Set([
  ...plan.cast.flatMap(({ id, characterId }) => [id, characterId]),
  ...plan.crew.map(({ id }) => id),
  plan.company,
  ...plan.genres,
  plan.language,
].filter(Boolean))].slice(0, MAX_ENTITIES_PER_CALL)

export const wikidataCreditsOf = ({ id, film, plan, named, year = null }) => {
  const nameOf = (entityId) => labelOf(named[entityId])
  const cast = plan.cast
    .map((member) => ({
      name: nameOf(member.id),
      character: spacedSlashesOf(member.character || nameOf(member.characterId)),
      image: null,
      url: pageUrlOf({ id: member.id, entity: named[member.id] }),
    }))
    .filter((member) => member.name)
  const crew = plan.crew.map(({ id: personId, job }) => ({ name: nameOf(personId), job })).filter((member) => member.name)
  if (!cast.length && !crew.length) return null
  return {
    overview: null,
    cast,
    crew,
    details: {
      company: nameOf(plan.company),
      year: plan.year || year || null,
      genres: plan.genres.map((genreId) => genreNameOf(nameOf(genreId))).filter(Boolean),
      minutes: plan.minutes,
      language: capitalised(nameOf(plan.language)),
    },
    source: 'wikidata',
    url: pageUrlOf({ id, entity: film }),
  }
}

export const genreNameOf = (label) => capitalised(String(label || '').replace(/\s+film$/i, '').trim())

const onlyEvidencedOf = ({ built, hints }) => {
  if (!hints) return null
  const evidenced = built.filter(({ credits, description, year }) => matchEvidenceOf({
    hints,
    candidateYear: year,
    text: evidenceTextOf({ credits, description }),
  }).accepted)
  return evidenced.length === 1 ? evidenced[0].credits : null
}

const evidenceTextOf = ({ credits, description }) => [
  description,
  ...credits.cast.flatMap((member) => [member.name, member.character]),
  ...credits.crew.map((member) => member.name),
].filter(Boolean).join(' ')

const billedCastOf = (statements = []) => activeStatementsOf(statements)
  .map((statement, index) => ({
    id: itemIdOf(statement.mainsnak),
    character: firstStringOf(statement.qualifiers?.P4633),
    characterId: itemIdOf(statement.qualifiers?.P453?.[0]),
    order: Number(firstStringOf(statement.qualifiers?.P1545)) || Infinity,
    index,
  }))
  .filter((member) => member.id)
  .sort((a, b) => a.order - b.order || a.index - b.index)
  .map(({ id, character, characterId }) => ({ id, character, characterId }))

const activeStatementsOf = (statements = []) => (Array.isArray(statements) ? statements : [])
  .filter((statement) => statement?.rank !== 'deprecated')

const itemIdsOf = (statements) => [...new Set(activeStatementsOf(statements).map((statement) => itemIdOf(statement.mainsnak)).filter(Boolean))]

const itemIdOf = (snak) => {
  const id = snak?.datavalue?.value?.id
  return /^Q\d+$/.test(id || '') ? id : null
}

const firstStringOf = (snaks) => {
  const value = snaks?.[0]?.datavalue?.value
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

const minutesOf = (statements) => {
  const value = activeStatementsOf(statements).map((statement) => statement.mainsnak?.datavalue?.value)
    .find((quantity) => String(quantity?.unit || '').endsWith(`/${MINUTE_UNIT}`))
  const minutes = Math.round(Number(value?.amount))
  return minutes > 0 ? minutes : null
}

const earliestYearOf = (statements) => {
  const years = activeStatementsOf(statements)
    .map((statement) => Number(String(statement.mainsnak?.datavalue?.value?.time || '').slice(1, 5)))
    .filter((year) => year > 1800)
  return years.length ? Math.min(...years) : null
}

const searchResultOf = ({ id, entity }) => ({
  id,
  label: labelOf(entity),
  aliases: [...(entity?.aliases?.en || []), ...(entity?.aliases?.mul || [])].map((alias) => alias.value),
  description: entity?.descriptions?.en?.value || '',
})

const labelOf = (entity) => entity?.labels?.en?.value || entity?.labels?.mul?.value || null

const pageUrlOf = ({ id, entity }) => entity?.sitelinks?.enwiki?.url || (id ? `${WIKIDATA_PAGE}/${id}` : null)

export const titleYearOf = (title) => {
  const year = Number(String(title || '').match(TITLE_YEAR)?.[1])
  return year > 0 ? year : null
}

const singleReleaseYearOf = (hints) => (hints?.releaseYears?.length === 1 ? hints.releaseYears[0] : null)

const yearFits = ({ film, year }) => !year || (film.year != null && Math.abs(film.year - year) <= 1)

const spacedSlashesOf = (text) => (text ? text.replace(/\s*\/\s*/g, ' / ') : null)

const capitalised = (text) => (text ? `${text[0].toUpperCase()}${text.slice(1)}` : null)

const FILM_CREW_PROPERTIES = [
  { property: 'P57', job: 'Director', limit: 3 },
  { property: 'P58', job: 'Writer', limit: 2 },
  { property: 'P162', job: 'Producer', limit: 2 },
]
const MINUTE_UNIT = 'Q7727'
const TITLE_YEAR = /\(((?:19|20)\d{2})\)\s*$/
const FILM_ITEM = 'Q11424'
const MAX_CAST = 12
const MAX_GENRES = 3
const MAX_CANDIDATES = 3
const MAX_ENTITIES_PER_CALL = 50
const SEARCH_LIMIT = 10
const SPARQL_TIMEOUT_MS = 20_000
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php'
const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql'
const WIKIDATA_PAGE = 'https://www.wikidata.org/wiki'
