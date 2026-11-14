import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'

process.env.DB_PATH ??= path.join(os.tmpdir(), `freetvarr-genres-${process.pid}.db`)

const {
  genreTagsOfEtsi,
  genreTagsOfFilmGenres,
  genreTagsOfTvmaze,
  createGenreEnrichment,
  filmRowsOf,
  isMovieLike,
  keywordGenreTagsOf,
  lookupOrderOf,
  pickFilm,
  pickTvmazeShow,
  isCurrentLookup,
  yearOf,
} = await import('../src/genre-enrichment.js')

const show = (name, extra = {}) => ({ show: { id: name.length, name, genres: [], type: 'Scripted', ...extra } })

test('maps TVmaze genres and types to genreTags', () => {
  assert.deepEqual(genreTagsOfTvmaze({ genres: ['Food'], type: 'Reality' }), ['reality', 'food'])
  assert.deepEqual(genreTagsOfTvmaze({ genres: ['DIY'], type: 'Reality' }), ['reality', 'home'])
  assert.deepEqual(genreTagsOfTvmaze({ genres: ['Crime', 'Drama'], type: 'Scripted' }), ['drama', 'crime'])
  assert.deepEqual(genreTagsOfTvmaze({ genres: ['History'], type: 'Documentary' }), ['documentary'])
  assert.deepEqual(genreTagsOfTvmaze({ genres: ['Children', 'Comedy'], type: 'Animation' }), ['comedy', 'kids'])
  assert.deepEqual(genreTagsOfTvmaze({ genres: [], type: 'Game Show' }), ['quiz'])
  assert.deepEqual(genreTagsOfTvmaze({ genres: ['Science-Fiction'], type: 'Scripted' }), ['sci-fi'])
})

test('maps Wikidata film genres to movie subgenres', () => {
  assert.deepEqual(genreTagsOfFilmGenres(['action film', 'science fiction film']), ['movie', 'movie-action', 'movie-sci-fi'])
  assert.deepEqual(genreTagsOfFilmGenres(['romantic comedy']), ['movie', 'movie-comedy', 'movie-romance'])
  assert.deepEqual(genreTagsOfFilmGenres([]), ['movie'])
})

test('maps ETSI content bytes', () => {
  assert.deepEqual(genreTagsOfEtsi(0x14), ['comedy', 'movie', 'movie-comedy'])
  assert.deepEqual(genreTagsOfEtsi(0x23), ['news'])
  assert.deepEqual(genreTagsOfEtsi(0x43), ['sport'])
  assert.deepEqual(genreTagsOfEtsi(0xa5), ['food'])
  assert.deepEqual(genreTagsOfEtsi(null), [])
})

test('AU nibbles 0xC to 0xE are comedy, drama and documentary only in Australia, and ETSI codes still decode there', () => {
  assert.deepEqual(genreTagsOfEtsi(0xc0, 'au'), ['comedy'])
  assert.deepEqual(genreTagsOfEtsi(0xd0, 'au'), ['drama'])
  assert.deepEqual(genreTagsOfEtsi(0xe0, 'au'), ['documentary'])
  assert.deepEqual(genreTagsOfEtsi(0xc0, 'nz'), [])
  assert.deepEqual(genreTagsOfEtsi(0x14, 'au'), ['comedy', 'movie', 'movie-comedy'])
})

test('a title with an episode title is never looked up as a film', () => {
  const order = lookupOrderOf({ titles: [{ title: 'Interview with the Vampire', movie: true }, { title: 'Interview with the Vampire', episodes: true }] })
  assert.deepEqual(order.map((item) => [item.movie, item.episodes]), [[true, true]])
})

test('shows get Wikidata genres and an origin country, and a Wikidata failure keeps the TVmaze record for a retry', async () => {
  const writes = []
  const enrichment = createGenreEnrichment({
    searchTvmaze: async (title) => (title === 'Upstart Crow' ? [show('Upstart Crow', { genres: ['Comedy'], network: { country: { code: 'GB' } } })] : []),
    searchWikidata: async (title) => (title === 'Broken Lookup' ? Promise.reject(new Error('Wikidata HTTP 503')) : ['Q1']),
    queryWikidata: async (query) => {
      assert.match(query, /wd:Q5398426/)
      return { results: { bindings: [{ item: { value: 'http://www.wikidata.org/entity/Q1' }, label: { value: 'Upstart Crow' }, genres: { value: 'sitcom|historical comedy' }, countries: { value: 'GB' } }] } }
    },
    cache: { freshKeys: async () => new Set(), write: async (row) => writes.push(row) },
    isEnabled: async () => true,
    now: () => 0,
    sleep: async () => {},
    country: () => 'au',
  })
  await enrichment.run({ titles: [{ title: 'Upstart Crow' }] })
  assert.deepEqual(writes[0].genres, ['Comedy', 'type:Scripted', 'wd:sitcom', 'wd:historical comedy', 'country:GB', 'lookup:2'])
  assert.equal(writes[0].source, 'tvmaze:12')
  const failing = createGenreEnrichment({
    searchTvmaze: async () => [show('Broken Lookup')],
    searchWikidata: async () => { throw new Error('Wikidata HTTP 503') },
    cache: { freshKeys: async () => new Set(), write: async (row) => writes.push(row) },
    isEnabled: async () => true,
    now: () => 0,
    sleep: async () => {},
  })
  await failing.run({ titles: [{ title: 'Broken Lookup' }] })
  const day = 24 * 60 * 60 * 1000
  assert.deepEqual([writes[1].genres.includes('lookup:2'), writes[1].genres.includes('lookup:partial'), writes[1].expiresAt / day], [false, true, 7])
})

test('records without the lookup:2 token count as stale', () => {
  assert.equal(isCurrentLookup(['Comedy', 'type:Scripted']), false)
  assert.equal(isCurrentLookup(['lookup:2']), true)
})

test('falls back to keywords for news and sport titles', () => {
  assert.deepEqual(keywordGenreTagsOf('Nine News Sydney'), ['news'])
  assert.deepEqual(keywordGenreTagsOf('Seven News At 4'), ['news'])
  assert.deepEqual(keywordGenreTagsOf('AFL Grand Final'), ['sport'])
  assert.deepEqual(keywordGenreTagsOf('Cricket: Australia v India'), ['sport'])
  assert.deepEqual(keywordGenreTagsOf('The Block'), [])
})

test('accepts only exact normalised title matches and prefers shows from the install country', () => {
  const results = [
    show('The Block', { id: 98, network: { country: { code: 'NZ' } } }),
    show('The Block', { id: 99, network: { country: { code: 'AU' } } }),
    show('The Blockheads'),
  ]
  assert.equal(pickTvmazeShow({ results, title: 'The Block', country: 'au' }).id, 99)
  assert.equal(pickTvmazeShow({ results, title: 'Block', country: 'au' }).id, 99)
  assert.equal(pickTvmazeShow({ results, title: 'The Block', country: 'nz' }).id, 98)
  assert.equal(pickTvmazeShow({ results, title: 'The Block' }).id, 98)
  assert.equal(pickTvmazeShow({ results: [show('The Blockheads')], title: 'The Block' }), null)
})

test('films need an exact title, the year when known, or agreeing genres', () => {
  const rows = [
    { id: 'Q1', label: 'Dune', year: 1984, genres: ['science fiction film'] },
    { id: 'Q2', label: 'Dune', year: 2021, genres: ['science fiction film', 'drama film'] },
  ]
  assert.equal(pickFilm({ rows, title: 'Dune', year: 2021 }).id, 'Q2')
  assert.equal(pickFilm({ rows, title: 'Dune' }), null)
  assert.equal(pickFilm({ rows: rows.slice(0, 1), title: 'dune' }).id, 'Q1')
  assert.equal(pickFilm({ rows, title: 'Dune Part Two' }), null)
})

test('parses SPARQL film rows', () => {
  const rows = filmRowsOf({ results: { bindings: [{ film: { value: 'http://www.wikidata.org/entity/Q42' }, label: { value: 'Up' }, year: { value: '2009' }, genres: { value: 'animated film|comedy film' } }] } })
  assert.deepEqual(rows, [{ id: 'Q42', label: 'Up', year: 2009, genres: ['animated film', 'comedy film'] }])
})

test('spots movies by genre byte or by shape', () => {
  const hour = 60 * 60 * 1000
  assert.equal(isMovieLike({ genre: 0x10, start: 0, end: 2 * hour, series_no: 1 }), true)
  assert.equal(isMovieLike({ genre: 0x14, start: 0, end: hour / 2 }), false)
  assert.equal(isMovieLike({ start: 0, end: 2 * hour }), true)
  assert.equal(isMovieLike({ start: 0, end: 2 * hour, series_no: 3, episode_no: 1 }), false)
  assert.equal(isMovieLike({ start: 0, end: hour }), false)
  assert.equal(yearOf({ title: 'Twister (1996)' }), 1996)
  assert.equal(yearOf({ title: 'Twister' }), null)
})

test('orders lookups by priority, skips cached and keyword-only titles', () => {
  const order = lookupOrderOf({
    titles: [
      { title: 'Nine News', priority: 0 },
      { title: 'Danny Phantom', priority: 0 },
      { title: 'The Block', priority: 3 },
      { title: 'The Block', priority: 0 },
      { title: 'Cached Show', priority: 3 },
    ],
    cachedKeys: new Set(['cached-show']),
  })
  assert.deepEqual(order.map((item) => item.title), ['The Block', 'Danny Phantom'])
})

test('enrichment caches hits for 30 days and misses for 7', async () => {
  const writes = []
  const enrichment = createGenreEnrichment({
    searchTvmaze: async (title) => (title === 'The Block' ? [show('The Block', { genres: ['DIY'], type: 'Reality' })] : []),
    searchWikidata: async () => [],
    queryWikidata: async () => ({}),
    cache: { freshKeys: async () => new Set(), write: async (row) => writes.push(row) },
    isEnabled: async () => true,
    now: () => 0,
    sleep: async () => {},
  })
  const result = await enrichment.run({ titles: [{ title: 'The Block' }, { title: 'Unknown Thing' }] })
  assert.deepEqual(result, { looked: 2, found: 1 })
  const day = 24 * 60 * 60 * 1000
  assert.deepEqual(writes.map((row) => [row.key, row.genreTags, row.expiresAt / day]), [
    ['the-block', ['reality', 'home'], 30],
    ['unknown-thing', [], 7],
  ])
})

test('enrichment does nothing when the lookup setting is off', async () => {
  const enrichment = createGenreEnrichment({ isEnabled: async () => false, searchTvmaze: async () => assert.fail('no lookups') })
  assert.deepEqual(await enrichment.run({ titles: [{ title: 'The Block' }] }), { looked: 0, found: 0, skipped: true })
})

test('films are never TVmaze series, short ETSI drama, or weekly strips', async () => {
  const { isFilmAiring } = await import('../src/genre-enrichment.js')
  const hour = 60 * 60 * 1000
  const long = { start: 0, end: 2 * hour }
  assert.equal(isFilmAiring({ programme: long }), true)
  assert.equal(isFilmAiring({ programme: long, airingsInWeek: 5 }), false)
  assert.equal(isFilmAiring({ programme: { ...long, genre: 0x10 }, airingsInWeek: 5 }), true)
  assert.equal(isFilmAiring({ programme: { start: 0, end: hour / 2, genre: 0x14 } }), false)
  assert.equal(isFilmAiring({ programme: long, record: { genreTags: ['comedy'], source: 'tvmaze:1' } }), false)
  assert.equal(isFilmAiring({ programme: { start: 0, end: hour }, record: { genreTags: ['movie'], source: 'wikidata:Q1' } }), true)
})

test('long news and sport one-offs are never films unless a film record says so', async () => {
  const { isFilmAiring } = await import('../src/genre-enrichment.js')
  const hour = 60 * 60 * 1000
  const soccer = { title: 'Australian Championship 2026', genre: 0x40, start: 0, end: 2 * hour }
  const keywordOnly = { title: 'NRL Grand Final', start: 0, end: 3 * hour }
  const electionNight = { title: 'Australia Votes', genre: 0x20, start: 0, end: 5 * hour }
  assert.equal(isFilmAiring({ programme: soccer }), false)
  assert.equal(isMovieLike(soccer), false)
  assert.equal(isFilmAiring({ programme: keywordOnly }), false)
  assert.equal(isMovieLike(keywordOnly), false)
  assert.equal(isFilmAiring({ programme: electionNight }), false)
  assert.equal(isFilmAiring({ programme: soccer, record: { genreTags: ['movie', 'movie-drama'], source: 'wikidata:Q1' } }), true)
})

test('a title seen as a recording and as a film airing is looked up as a film', () => {
  const order = lookupOrderOf({
    titles: [
      { title: 'Dune', priority: 3 },
      { title: 'Dune', movie: true, year: 2021, priority: 1 },
    ],
  })
  assert.deepEqual(order.map((item) => [item.title, item.movie, item.year, item.priority]), [['Dune', true, 2021, 3]])
})

test('a recorded film is searched on Wikidata and a film miss never falls back to a TVmaze series', async () => {
  const writes = []
  const wikidataSearches = []
  const enrichment = createGenreEnrichment({
    searchTvmaze: async (title) => [show(title)],
    searchWikidata: async (title) => {
      wikidataSearches.push(title)
      return ['Q1', 'Q2']
    },
    queryWikidata: async () => ({ results: { bindings: [] } }),
    cache: { freshKeys: async () => new Set(), write: async (row) => writes.push(row) },
    isEnabled: async () => true,
    now: () => 0,
    sleep: async () => {},
  })
  await enrichment.run({ titles: [{ title: 'Dune', priority: 3 }, { title: 'Dune', movie: true }] })
  assert.deepEqual(wikidataSearches, ['Dune'])
  assert.deepEqual(writes.map((row) => [row.key, row.source]), [['dune', null]])
})

test('enrichment stops after five failed lookups in a row', async () => {
  let searches = 0
  const enrichment = createGenreEnrichment({
    searchTvmaze: async () => {
      searches += 1
      throw new Error('TVmaze did not answer')
    },
    cache: { freshKeys: async () => new Set(), write: async () => {} },
    isEnabled: async () => true,
    now: () => 0,
    sleep: async () => {},
  })
  const titles = Array.from({ length: 20 }, (_, index) => ({ title: `Show ${index}` }))
  const result = await enrichment.run({ titles })
  assert.equal(searches, 5)
  assert.equal(result.looked, 5)
})

test('genre searches go through the shared TVmaze client as background calls', async () => {
  const { createOutboundClient } = await import('../src/outbound-http.js')
  const requests = []
  const client = createOutboundClient({
    hosts: { 'api.tvmaze.com': { concurrency: 1 } },
    request: async (options) => {
      requests.push(options.url)
      return { status: 200, headers: { 'content-type': 'application/json' }, body: Buffer.from(JSON.stringify([show('The Block')])) }
    },
  })
  const enrichment = createGenreEnrichment({
    client,
    searchWikidata: async () => [],
    cache: { freshKeys: async () => new Set(), write: async () => {} },
    isEnabled: async () => true,
    now: () => 0,
    sleep: async () => {},
  })
  assert.deepEqual(await enrichment.run({ titles: [{ title: 'The Block' }] }), { looked: 1, found: 1 })
  assert.deepEqual(requests, ['https://api.tvmaze.com/search/shows'])
})
