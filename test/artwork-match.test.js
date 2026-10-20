import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  articleCandidateIdsOf,
  candidateIdsOf,
  castNamesOf,
  entityRowsOf,
  evidenceWordsOf,
  lookupExpiryOf,
  matchEvidenceOf,
  programmeHintsByTitle,
  programmeHintsOf,
  rankEntities,
  tmdbAuthOf,
  tmdbCandidatesOf,
  tmdbSourcesOf,
  titleVariantsOf,
  yearsOf,
} from '../src/artwork-match.js'

const COOL_RUNNINGS = {
  title: 'Cool Runnings',
  synopsis: 'When a Jamaican sprinter is disqualified from the Olympic Games, he enlists the help of a dishonored coach to start the first Jamaican Bobsled Team. (John Candy, Leon, Doug E. Doug)',
}

const COOL_RUNNINGS_ARTICLE = 'Cool Runnings is a 1993 American sports comedy film directed by Jon Turteltaub. It stars Leon, Doug E. Doug, Rawle D. Lewis, Malik Yoba and John Candy.'

const EMPTY_NETS = {
  title: 'Empty Nets',
  synopsis: 'Amir and Narges hide their love in modern Iran. To afford a dowry, Amir enters dangerous caviar smuggling, risking all as they fight to escape tradition and build a future together.',
}

test('castNamesOf reads a trailing cast list and skips single names and ratings', () => {
  assert.deepEqual(castNamesOf(COOL_RUNNINGS.synopsis), ['John Candy', 'Doug E. Doug'])
  assert.deepEqual(castNamesOf('A heist goes wrong. Starring Tom Hanks and Meg Ryan.'), ['Tom Hanks', 'Meg Ryan'])
  assert.deepEqual(castNamesOf('A family drama. (M)'), [])
  assert.deepEqual(castNamesOf(''), [])
})

test('yearsOf finds plausible release years only', () => {
  assert.deepEqual(yearsOf('Classic (1993) remade in 2019, set in 3021 with 1080 lines'), [1993, 2019])
})

test('evidenceWordsOf keeps mid-sentence names and long words, never title words', () => {
  const { properNouns, words } = evidenceWordsOf(EMPTY_NETS)
  assert.deepEqual(properNouns.sort(), ['amir', 'iran', 'narges'])
  assert.ok(words.includes('smuggling'))
  assert.ok(!words.includes('nets'))
  assert.ok(!properNouns.includes('empty'))
})

test('programmeHintsOf flags episodes and keeps the longest synopsis', () => {
  const hints = programmeHintsOf([
    { title: 'Show', synopsis: 'Short.' },
    { title: 'Show', synopsis: 'A much longer synopsis about Wellington.', series_no: 2, episode_no: 4 },
  ])
  assert.equal(hints.isEpisode, true)
  assert.match(hints.synopsis, /Wellington/)
  assert.equal(programmeHintsOf([]), null)
})

test('programmeHintsByTitle groups programmes by normalised title', () => {
  const hints = programmeHintsByTitle([{ title: 'The Bill' }, { title: 'Bill', episode_title: 'Pilot' }, { title: '' }])
  assert.equal(hints.size, 1)
  assert.equal(hints.get('bill').isEpisode, true)
})

test('matchEvidenceOf accepts a cast match', () => {
  const hints = programmeHintsOf([COOL_RUNNINGS])
  assert.deepEqual(matchEvidenceOf({ hints, candidateYear: 1993, text: COOL_RUNNINGS_ARTICLE }), { accepted: true, reason: 'cast' })
})

test('matchEvidenceOf rejects a same-title film whose cast does not appear', () => {
  const hints = programmeHintsOf([COOL_RUNNINGS])
  const other = 'Cool Runnings is a 2004 documentary about Antarctic research stations.'
  assert.equal(matchEvidenceOf({ hints, candidateYear: 2004, text: other }).accepted, false)
})

test('matchEvidenceOf rejects a year more than one off', () => {
  const hints = programmeHintsOf([{ title: 'Heat', synopsis: 'A crime thriller (1995).' }])
  assert.deepEqual(matchEvidenceOf({ hints, candidateYear: 1986, text: 'Heat is a film.' }), { accepted: false, reason: 'year' })
  assert.equal(matchEvidenceOf({ hints, candidateYear: 1996, text: 'Heat is a film.' }).accepted, true)
})

test('matchEvidenceOf uses synopsis names when there is no cast or year', () => {
  const hints = programmeHintsOf([EMPTY_NETS])
  const right = 'Empty Nets is a 2023 drama. Amir, a young man in Iran, turns to caviar smuggling to marry Narges.'
  const wrong = 'Empty Nets is a 1990 sports film about a hockey goalie in Minnesota.'
  assert.equal(matchEvidenceOf({ hints, text: right }).accepted, true)
  assert.deepEqual(matchEvidenceOf({ hints, text: wrong }), { accepted: false, reason: 'no-evidence' })
})

test('matchEvidenceOf refuses without hints', () => {
  assert.equal(matchEvidenceOf({ hints: null, text: 'anything' }).accepted, false)
})

test('candidateIdsOf keeps exact label or alias matches', () => {
  const results = [
    { id: 'Q1', label: 'Empty nets', match: { text: 'Empty nets' } },
    { id: 'Q2', label: 'Empty Nets? Fishing for Hard Facts' },
    { id: 'bad', label: 'Empty Nets' },
    { id: 'Q3', label: 'Leere Netze', match: { text: 'Empty Nets' } },
  ]
  assert.deepEqual(candidateIdsOf({ results, title: 'Empty Nets' }), ['Q1', 'Q3'])
})

test('articleCandidateIdsOf matches article titles without their disambiguation', () => {
  const pages = [
    { index: 2, title: 'Cool Runnings (film)', pageprops: { wikibase_item: 'Q282748' } },
    { index: 1, title: 'Bobsleigh', pageprops: { wikibase_item: 'Q177275' } },
    { index: 3, title: 'Cool Runnings', pageprops: {} },
  ]
  assert.deepEqual(articleCandidateIdsOf({ pages, title: 'Cool Runnings' }), ['Q282748'])
})

test('entityRowsOf reads kind, year, article, and ids', () => {
  const [row] = entityRowsOf({
    results: {
      bindings: [{
        item: { value: 'http://www.wikidata.org/entity/Q282748' },
        roots: { value: 'http://www.wikidata.org/entity/Q11424|http://www.wikidata.org/entity/Q15416' },
        year: { value: '1993' },
        enwiki: { value: 'https://en.wikipedia.org/wiki/Cool_Runnings' },
        tmdbMovie: { value: '864' },
        imdb: { value: 'tt0106611' },
      }],
    },
  })
  assert.deepEqual(row, { id: 'Q282748', kind: 'film', year: 1993, article: 'Cool Runnings', tmdbMovie: '864', tmdbTv: null, imdb: 'tt0106611' })
})

test('rankEntities drops films for episodes and prefers year fits and database ids', () => {
  const rows = [
    { id: 'Q1', kind: 'film', year: 1993, article: 'A', tmdbMovie: null, imdb: null },
    { id: 'Q2', kind: 'series', year: 2010, article: 'B', imdb: 'tt1' },
    { id: 'Q3', kind: 'series', year: 2010, article: null },
  ]
  assert.deepEqual(rankEntities({ rows, hints: { isEpisode: true, years: [] }, order: ['Q1', 'Q2', 'Q3'] }).map((row) => row.id), ['Q2'])
  assert.deepEqual(rankEntities({ rows, hints: { isEpisode: false, years: [1993] }, order: ['Q2', 'Q1'] }).map((row) => row.id), ['Q1', 'Q2'])
})

test('tmdbAuthOf sends a read access token as a bearer header and a v3 key as a parameter', () => {
  assert.deepEqual(tmdbAuthOf(' abc123 '), { headers: {}, params: { api_key: 'abc123' } })
  const token = `eyJhbGciOiJIUzI1NiJ9.${'x'.repeat(60)}.sig`
  assert.deepEqual(tmdbAuthOf(token).headers, { Authorization: `Bearer ${token}` })
  assert.equal(tmdbAuthOf(''), null)
})

test('tmdbSourcesOf prefers the backdrop, then the poster', () => {
  assert.deepEqual(tmdbSourcesOf({ backdrop_path: '/b.jpg', poster_path: '/p.jpg' }), [
    'https://image.tmdb.org/t/p/w1280/b.jpg',
    'https://image.tmdb.org/t/p/w780/p.jpg',
  ])
  assert.deepEqual(tmdbSourcesOf({}), [])
})

test('tmdbCandidatesOf keeps exact titles and only shows for episodes', () => {
  const results = [
    { media_type: 'movie', id: 1, title: 'Cool Runnings' },
    { media_type: 'tv', id: 2, name: 'Cool Runnings' },
    { media_type: 'person', id: 3, name: 'Cool Runnings' },
    { media_type: 'movie', id: 4, title: 'Cool Runnings 2' },
  ]
  assert.deepEqual(tmdbCandidatesOf({ results, title: 'Cool Runnings', hints: { isEpisode: false } }).map((r) => r.id), [1, 2])
  assert.deepEqual(tmdbCandidatesOf({ results, title: 'Cool Runnings', hints: { isEpisode: true } }).map((r) => r.id), [2])
})

test('lookupExpiryOf keeps hits longer than misses', () => {
  assert.equal(lookupExpiryOf({ found: true, nowMs: 100, hitTtlMs: 50, missTtlMs: 10 }), 150)
  assert.equal(lookupExpiryOf({ found: false, nowMs: 100, hitTtlMs: 50, missTtlMs: 10 }), 110)
})

test('a year mentioned in passing never rules a film out, but a bracketed one does', () => {
  const hints = programmeHintsOf([{ title: 'West Side Story', synopsis: 'An adaptation of the 1957 musical about the Jets and the Sharks in New York.' }])
  assert.deepEqual(hints.releaseYears, [])
  assert.equal(matchEvidenceOf({ hints, candidateYear: 1961, text: 'West Side Story is a 1961 film. The Jets fight the Sharks.' }).accepted, true)
})

test('castNamesOf also reads names bracketed mid-synopsis', () => {
  assert.deepEqual(
    castNamesOf('A witness to a murder (Christy Chung) falls for the bodyguard (Jet Li) hired to protect her.'),
    ['Christy Chung', 'Jet Li'],
  )
})

test('titleVariantsOf adds the title without a country suffix', () => {
  assert.deepEqual(titleVariantsOf('Shark Tank Australia'), ['Shark Tank Australia', 'Shark Tank'])
  assert.deepEqual(titleVariantsOf('The Celebrity Traitors UK'), ['The Celebrity Traitors UK', 'The Celebrity Traitors'])
  assert.deepEqual(titleVariantsOf('Spelling Bee (NZ)'), ['Spelling Bee (NZ)', 'Spelling Bee'])
  assert.deepEqual(titleVariantsOf('Cool Runnings'), ['Cool Runnings'])
})
