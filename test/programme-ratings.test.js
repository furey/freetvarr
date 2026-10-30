import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  createGuideHints,
  createProgrammeRatings,
  createRatingsLookup,
  filmRatingsOf,
  forYouProgrammesOf,
  lacksFilmLanguage,
  isCinematicSeries,
  pickRatedShow,
  ratingsResponseOf,
  requestedYearOf,
  tmdbScoreOf,
  upcomingFilmsOf,
  upcomingProgrammesOf,
} from '../src/programme-ratings.js'
import { programmeHintsOf } from '../src/artwork-match.js'
import { createHostLimiter } from '../src/outbound-http.js'

const memoryCache = () => {
  const rows = new Map()
  return {
    rows,
    read: async (key) => rows.get(key) || null,
    write: async ({ key, found, expiresAt, missReason = null }) => { rows.set(key, { found, expiresAt, missReason }) },
    remove: async (key) => { rows.delete(key) },
  }
}

const fakeClient = (routes) => {
  const calls = []
  return {
    calls,
    getJson: async ({ url, params = {} }) => {
      const path = url.replace(/^https:\/\/[^/]+(\/3)?/, '')
      calls.push({ path, params })
      const route = routes[path]
      if (route === undefined) return null
      return typeof route === 'function' ? route(params) : route
    },
  }
}

const settled = async (ratings, title, options) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const answer = await ratings.ratingsFor(title, options)
    if (answer.status !== 'pending') return answer
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
  throw new Error('lookup never settled')
}

const ratingsWith = ({
  routes,
  apiKey = 'k',
  hints = null,
  country = 'AU',
  ratingsOn = true,
  reviewsOn = true,
  knownReference = async () => null,
  cache = memoryCache(),
  clock = { ms: 1000 },
  lookUp = null,
  linkOf = (url) => url,
  externalIdsFor = async () => null,
}) => {
  const client = fakeClient(routes || {})
  const ratings = createProgrammeRatings({
    lookUp: lookUp || createRatingsLookup({ client, countryCode: () => country, knownReference }),
    cache,
    ratingsEnabled: async () => ratingsOn,
    reviewsEnabled: async () => reviewsOn,
    tmdbKey: async () => apiKey,
    hintsFor: async () => hints,
    externalIdsFor,
    now: () => clock.ms,
    hitTtlMs: 100,
    missTtlMs: 10,
    failureBackoffMs: 50,
    linkOf,
    staleBeforeMs: 0,
  })
  return { ratings, client, cache, clock }
}

const HEAT_REVIEWS = [
  {
    author: 'filmbuff_77',
    author_details: { rating: 9 },
    content: '<p>Mann builds the whole film around two professionals who respect each other.</p>\r\n\r\n'
      + '**Pacino and De Niro are superb, and the downtown shootout is the most gripping sequence of the decade.** '
      + 'The ending, where one of them dies, still hits hard.',
  },
  {
    author: 'quietcinema',
    author_details: { rating: 6 },
    content: 'I think it runs long. The score is great, but the subplot with the wife drags on for far too long.',
  },
]

const HEAT_HINTS = programmeHintsOf([{
  title: 'Heat',
  kind: 'movie',
  synopsis: 'A group of professional bank robbers start to feel the heat from police when they unknowingly leave a clue at their latest heist. (Al Pacino, Robert De Niro) (1995)',
}])

const HEAT_DETAILS = {
  id: 949,
  title: 'Heat',
  release_date: '1995-12-15',
  overview: 'Obsessive master thief Neil McCauley leads a top-notch crew on various daring heists throughout Los Angeles.',
  vote_average: 7.94,
  vote_count: 7400,
  credits: { cast: [{ name: 'Al Pacino', character: 'Vincent Hanna' }, { name: 'Robert De Niro', character: 'Neil McCauley' }] },
  reviews: { total_results: 3, results: HEAT_REVIEWS },
}

const HEAT_ROUTES = {
  '/search/movie': { results: [{ id: 949, title: 'Heat' }, { id: 5, title: 'Heat Wave' }] },
  '/movie/949': HEAT_DETAILS,
}

const UTOPIA_UK = {
  id: 1871,
  name: 'Utopia',
  type: 'Scripted',
  premiered: '2013-01-15',
  url: 'https://www.tvmaze.com/shows/1871/utopia',
  rating: { average: 8.3 },
  network: { name: 'Channel 4', country: { code: 'GB' } },
  externals: { imdb: 'tt2384811' },
  summary: '<p>A group of people who meet online discover a cult graphic novel manuscript and become targets of a shadowy organisation.</p>',
}

const UTOPIA_AU = {
  id: 2994,
  name: 'Utopia',
  type: 'Scripted',
  premiered: '2014-08-13',
  url: 'https://www.tvmaze.com/shows/2994/utopia',
  rating: { average: 7.2 },
  network: { name: 'ABC', country: { code: 'AU' } },
  externals: { imdb: 'tt3496334' },
  summary: '<p>Utopia follows the staff of the Nation Building Authority, a government department charged with overseeing ambitious infrastructure projects, from conception to completion.</p>',
}

const UTOPIA_HINTS = programmeHintsOf([{
  title: 'Utopia',
  episode_title: 'Tunnel Vision',
  synopsis: 'Tony fights to keep the Nation Building Authority on track as a sudden infrastructure announcement blindsides the department.',
}])

const UTOPIA_TMDB = {
  id: 61083,
  name: 'Utopia',
  type: 'Scripted',
  vote_average: 7.1,
  vote_count: 64,
  reviews: {
    total_results: 1,
    results: [{
      author_details: { rating: 8 },
      content: 'Working Dog does it again. The meetings are painfully funny and the cast is superb at playing people who know the plan will never work.',
    }],
  },
}

const UTOPIA_ROUTES = {
  '/search/shows': [{ show: UTOPIA_UK }, { show: UTOPIA_AU }, { show: { ...UTOPIA_AU, id: 9, name: 'Utopia Falls' } }],
  '/find/tt3496334': { tv_results: [{ id: 61083 }] },
  '/tv/61083': UTOPIA_TMDB,
}

test('a film answers pending first, then the TMDB score, votes, and a review snippet', async () => {
  const { ratings, client } = ratingsWith({ routes: HEAT_ROUTES, hints: HEAT_HINTS })
  assert.deepEqual(await ratings.ratingsFor('Heat', { kind: 'movie' }), {
    status: 'pending', score: null, votes: null, source: null, url: null, reviews: null,
  })
  assert.deepEqual(await settled(ratings, 'Heat', { kind: 'movie' }), {
    status: 'ready',
    score: 7.9,
    votes: 7400,
    source: 'tmdb',
    url: 'https://www.themoviedb.org/movie/949',
    reviews: {
      snippet: 'Pacino and De Niro are superb, and the downtown shootout is the most gripping sequence of the decade.',
      count: 3,
      url: 'https://www.themoviedb.org/movie/949/reviews',
    },
  })
  assert.deepEqual(client.calls.map(({ path }) => path), ['/search/movie', '/movie/949'])
  assert.equal(client.calls[0].params.year, 1995)
  assert.equal(client.calls[1].params.append_to_response, 'credits,reviews')
})

test('a series takes the TVmaze score of the Australian Utopia and TMDB reviews through the IMDb id', async () => {
  const { ratings, client } = ratingsWith({ routes: UTOPIA_ROUTES, hints: UTOPIA_HINTS })
  assert.equal((await ratings.ratingsFor('Utopia')).status, 'pending')
  assert.deepEqual(await settled(ratings, 'Utopia'), {
    status: 'ready',
    score: 7.2,
    votes: null,
    source: 'tvmaze',
    url: 'https://www.tvmaze.com/shows/2994/utopia',
    reviews: {
      snippet: 'The meetings are painfully funny and the cast is superb at playing people who know the plan will never work.',
      count: 1,
      url: 'https://www.themoviedb.org/tv/61083/reviews',
    },
  })
  assert.deepEqual(client.calls.map(({ path }) => path), ['/search/tv', '/search/shows', '/find/tt3496334', '/tv/61083'])
})

test('a series without a TMDB key still gets the TVmaze score and no reviews', async () => {
  const { ratings, client } = ratingsWith({ routes: UTOPIA_ROUTES, hints: UTOPIA_HINTS, apiKey: null })
  const answer = await settled(ratings, 'Utopia')
  assert.equal(answer.score, 7.2)
  assert.equal(answer.reviews, null)
  assert.deepEqual(client.calls.map(({ path }) => path), ['/search/shows'])
})

test('a film without a TMDB key is not looked up', async () => {
  const { ratings, client } = ratingsWith({ routes: HEAT_ROUTES, hints: HEAT_HINTS, apiKey: null })
  assert.equal((await ratings.ratingsFor('Heat', { kind: 'movie' })).status, 'none')
  assert.equal(client.calls.length, 0)
})

test('a reality series gets no score and the miss is cached', async () => {
  const reality = { ...UTOPIA_AU, name: 'MasterChef Australia', type: 'Reality', externals: {} }
  const { ratings, cache } = ratingsWith({ routes: { '/search/shows': [{ show: reality }] } })
  assert.equal((await settled(ratings, 'MasterChef Australia')).status, 'none')
  assert.deepEqual(cache.rows.get('tmdb:series-v2:masterchef australia'), { found: null, expiresAt: 1010, missReason: 'not-story:Reality' })
})

test('the TMDB type gates a series when TVmaze gives none', async () => {
  const untyped = { ...UTOPIA_AU, type: null }
  const routes = { ...UTOPIA_ROUTES, '/search/shows': [{ show: untyped }], '/tv/61083': { ...UTOPIA_TMDB, type: 'Reality' } }
  const { ratings } = ratingsWith({ routes, hints: UTOPIA_HINTS })
  assert.equal((await settled(ratings, 'Utopia')).status, 'none')
})

test('a TVmaze show with no rating and no reviews has no score', async () => {
  const unrated = { ...UTOPIA_AU, rating: { average: null } }
  const { ratings } = ratingsWith({ routes: { '/search/shows': [{ show: unrated }] }, apiKey: null })
  assert.equal((await settled(ratings, 'Utopia')).status, 'none')
})

test('a film under 50 TMDB votes hides the score but keeps a review', async () => {
  const routes = { ...HEAT_ROUTES, '/movie/949': { ...HEAT_DETAILS, vote_count: 49 } }
  const { ratings } = ratingsWith({ routes, hints: HEAT_HINTS })
  const answer = await settled(ratings, 'Heat', { kind: 'movie' })
  assert.equal(answer.status, 'ready')
  assert.equal(answer.score, null)
  assert.equal(answer.votes, null)
  assert.equal(answer.source, null)
  assert.equal(answer.reviews.count, 3)
})

test('a film year sharpens the match within one year and keeps its own cache entry', async () => {
  const { ratings, cache } = ratingsWith({ routes: HEAT_ROUTES, hints: HEAT_HINTS })
  assert.equal((await settled(ratings, 'Heat', { kind: 'movie', year: 1996 })).score, 7.9)
  assert.equal((await settled(ratings, 'Heat', { kind: 'movie', year: 1993 })).status, 'none')
  assert.deepEqual([...cache.rows.keys()], ['tmdb:movie:heat@1996', 'tmdb:movie:heat@1993'])
})

test('requested years outside 1900 to 2100 are ignored', () => {
  assert.equal(requestedYearOf('1995'), 1995)
  assert.equal(requestedYearOf('95'), null)
  assert.equal(requestedYearOf(undefined), null)
  assert.equal(requestedYearOf('1995abc'), null)
})

test('a film whose candidate fails the evidence check gets nothing', async () => {
  const routes = { ...HEAT_ROUTES, '/movie/949': { ...HEAT_DETAILS, release_date: '1986-01-01', credits: { cast: [] } } }
  const { ratings } = ratingsWith({ routes, hints: HEAT_HINTS })
  assert.equal((await settled(ratings, 'Heat', { kind: 'movie' })).status, 'none')
})

test('a film the picture lookup already matched skips the search', async () => {
  const { ratings, client } = ratingsWith({
    routes: HEAT_ROUTES,
    knownReference: async ({ kind }) => (kind === 'movie' ? { type: 'movie', id: '949' } : null),
  })
  assert.equal((await settled(ratings, 'Heat', { kind: 'movie' })).score, 7.9)
  assert.deepEqual(client.calls.map(({ path }) => path), ['/movie/949'])
})

test('the ratings switch hides scores and the reviews switch hides reviews', async () => {
  const cache = memoryCache()
  await ratingsWith({ routes: HEAT_ROUTES, hints: HEAT_HINTS, cache }).ratings.ratingsFor('Heat', { kind: 'movie' })
  await settled(ratingsWith({ routes: HEAT_ROUTES, hints: HEAT_HINTS, cache }).ratings, 'Heat', { kind: 'movie' })
  const noScores = await ratingsWith({ cache, ratingsOn: false }).ratings.ratingsFor('Heat', { kind: 'movie' })
  assert.equal(noScores.score, null)
  assert.equal(noScores.reviews.count, 3)
  const noReviews = await ratingsWith({ cache, reviewsOn: false }).ratings.ratingsFor('Heat', { kind: 'movie' })
  assert.equal(noReviews.score, 7.9)
  assert.equal(noReviews.reviews, null)
})

test('both switches off means no lookup at all', async () => {
  const { ratings, client } = ratingsWith({ routes: HEAT_ROUTES, ratingsOn: false, reviewsOn: false })
  assert.equal((await ratings.ratingsFor('Heat', { kind: 'movie' })).status, 'none')
  assert.equal(client.calls.length, 0)
})

test('callers share one lookup, an expired hit still answers while it refreshes, and failures back off', async () => {
  let calls = 0
  let fail = false
  const { ratings, clock } = ratingsWith({
    lookUp: async () => {
      calls += 1
      if (fail) throw new Error('down')
      return { score: 8, votes: 100, source: 'tmdb', url: 'https://www.themoviedb.org/movie/1', reviews: null }
    },
  })
  await Promise.all([ratings.ratingsFor('Film', { kind: 'movie' }), ratings.ratingsFor('Film', { kind: 'movie' })])
  assert.equal((await settled(ratings, 'Film', { kind: 'movie' })).score, 8)
  assert.equal(calls, 1)
  clock.ms = 1101
  fail = true
  assert.equal((await ratings.ratingsFor('Film', { kind: 'movie' })).score, 8)
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.equal(calls, 2)
  clock.ms += 49
  assert.equal((await ratings.ratingsFor('Film', { kind: 'movie' })).score, 8)
  assert.equal(calls, 2)
  clock.ms += 2
  assert.equal((await ratings.ratingsFor('Film', { kind: 'movie' })).score, 8)
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.equal(calls, 3)
})

test('a failed first lookup answers pending through the backoff, never none', async () => {
  let calls = 0
  const { ratings, clock } = ratingsWith({
    lookUp: async () => {
      calls += 1
      throw new Error('down')
    },
  })
  assert.equal((await ratings.ratingsFor('Film', { kind: 'movie' })).status, 'pending')
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.equal((await ratings.ratingsFor('Film', { kind: 'movie' })).status, 'pending')
  assert.equal(calls, 1)
  clock.ms += 51
  await ratings.ratingsFor('Film', { kind: 'movie' })
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.equal(calls, 2)
})

test('an expired hit stops answering once its data is six months old', async () => {
  const cache = memoryCache()
  const day = 24 * 60 * 60 * 1000
  cache.rows.set('tmdb:movie:film', { found: { score: 8, votes: 100, source: 'tmdb', url: null, reviews: null, originalLanguage: 'en' }, expiresAt: 1100 })
  const { ratings, clock } = ratingsWith({ cache, lookUp: async () => { throw new Error('down') } })
  clock.ms = 1000 - 100 + 179 * day
  assert.equal((await ratings.ratingsFor('Film', { kind: 'movie' })).score, 8)
  clock.ms = 1000 - 100 + 181 * day + 60 * 1000
  assert.equal((await ratings.ratingsFor('Film', { kind: 'movie' })).status, 'pending')
})

test('film ratings keep the original language, and older film hits refresh in the background', async () => {
  assert.equal(filmRatingsOf({ id: 7, vote_average: 7.9, vote_count: 12000, original_language: 'fr' }).originalLanguage, 'fr')
  assert.equal(lacksFilmLanguage({ url: 'https://www.themoviedb.org/movie/1', score: 8 }), true)
  assert.equal(lacksFilmLanguage({ url: 'https://www.themoviedb.org/movie/1', score: 8, originalLanguage: null }), false)
  assert.equal(lacksFilmLanguage({ url: 'https://www.tvmaze.com/shows/1', score: 8 }), false)
  let calls = 0
  const { ratings } = ratingsWith({
    lookUp: async () => {
      calls += 1
      return { score: 8, votes: 100, source: 'tmdb', url: 'https://www.themoviedb.org/movie/1', reviews: null, ...(calls > 1 && { originalLanguage: 'en' }) }
    },
  })
  assert.equal((await settled(ratings, 'Film', { kind: 'movie' })).score, 8)
  assert.equal((await ratings.ratingsFor('Film', { kind: 'movie' })).score, 8)
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(calls, 2)
  await ratings.ratingsFor('Film', { kind: 'movie' })
  assert.equal(calls, 2)
})

test('upcomingFilmsOf keeps films airing in the next week', () => {
  const now = Date.UTC(2026, 9, 21)
  const day = 24 * 60 * 60 * 1000
  const programmes = [
    { title: 'Soon', kind: 'movie', start: now + day, end: now + day + 7200000 },
    { title: 'Series', kind: 'series', start: now + day, end: now + day + 3600000 },
    { title: 'Later', kind: 'movie', start: now + 8 * day, end: now + 8 * day + 7200000 },
  ]
  const guide = { programByEventId: new Map(programmes.map((programme, index) => [String(index), programme])) }
  assert.deepEqual(upcomingFilmsOf({ guide, nowMs: now }).map((programme) => programme.title), ['Soon'])
})

test('pickRatedShow prefers synopsis evidence over search order', () => {
  const results = [{ show: UTOPIA_UK }, { show: UTOPIA_AU }]
  assert.equal(pickRatedShow({ results, key: 'utopia', hints: UTOPIA_HINTS, country: 'GB' }), UTOPIA_AU)
})

test('pickRatedShow falls back to the one local show when evidence is missing', () => {
  const results = [{ show: UTOPIA_UK }, { show: UTOPIA_AU }]
  assert.equal(pickRatedShow({ results, key: 'utopia', hints: null, country: 'AU' }), UTOPIA_AU)
  assert.equal(pickRatedShow({ results, key: 'utopia', hints: null, country: 'GB' }), UTOPIA_UK)
  assert.equal(pickRatedShow({ results, key: 'utopia', hints: null, country: 'NZ' }), null)
})

test('pickRatedShow breaks a same-name tie by English language, then by a dominant weight', () => {
  const vera = { id: 3302, name: 'Vera', premiered: '2011-05-01', type: 'Scripted', language: 'English', weight: 98, network: { country: { code: 'GB' } } }
  const serbian = { id: 83328, name: 'Vera', premiered: '2023-01-21', type: 'Scripted', language: 'Serbian', weight: 9, network: { country: { code: 'RS' } } }
  assert.equal(pickRatedShow({ results: [{ show: serbian }, { show: vera }], key: 'vera', hints: null, country: 'AU' }), vera)
  const remake = { ...vera, id: 1, premiered: '2024-01-01', weight: 70 }
  assert.equal(pickRatedShow({ results: [{ show: vera }, { show: remake }], key: 'vera', hints: null, country: 'AU' }), null)
  const minor = { ...vera, id: 2, premiered: '2024-01-01', weight: 12 }
  assert.equal(pickRatedShow({ results: [{ show: minor }, { show: vera }], key: 'vera', hints: null, country: 'AU' }), vera)
})

test('pickRatedShow takes a lone title match unless the release year contradicts it', () => {
  const vague = programmeHintsOf([{ title: 'Utopia', synopsis: 'More from the team.' }])
  assert.equal(pickRatedShow({ results: [{ show: UTOPIA_UK }], key: 'utopia', hints: vague, country: 'AU' }), UTOPIA_UK)
  const dated = programmeHintsOf([{ title: 'Utopia (2020)', synopsis: 'More from the team.' }])
  assert.equal(pickRatedShow({ results: [{ show: UTOPIA_UK }], key: 'utopia', hints: dated, country: 'AU' }), null)
  assert.equal(pickRatedShow({ results: [{ show: { ...UTOPIA_UK, name: 'Dystopia' } }], key: 'utopia', hints: null, country: 'AU' }), null)
})

test('the cinematic gate follows TVmaze types first, then TMDB types', () => {
  for (const type of ['Scripted', 'Animation', 'Documentary']) assert.equal(isCinematicSeries({ tvmazeType: type }), true)
  for (const type of ['Reality', 'Game Show', 'Talk Show', 'News', 'Sports', 'Variety', 'Panel Show']) {
    assert.equal(isCinematicSeries({ tvmazeType: type, tmdbType: 'Scripted' }), false)
  }
  for (const type of ['Scripted', 'Documentary', 'Miniseries']) assert.equal(isCinematicSeries({ tmdbType: type }), true)
  assert.equal(isCinematicSeries({ tmdbType: 'Talk Show' }), false)
  assert.equal(isCinematicSeries({}), false)
})

test('the TMDB score needs 50 votes and rounds to one decimal', () => {
  assert.deepEqual(tmdbScoreOf({ vote_average: 7.94, vote_count: 50 }), { score: 7.9, votes: 50 })
  assert.deepEqual(tmdbScoreOf({ vote_average: 7.94, vote_count: 49 }), { score: null, votes: null })
  assert.deepEqual(tmdbScoreOf({ vote_average: 0, vote_count: 900 }), { score: null, votes: null })
})

test('a cached miss answers none', () => {
  assert.equal(ratingsResponseOf({ found: null }).status, 'none')
})

test('guide hints are built once per guide snapshot', async () => {
  const guide = { programByEventId: new Map([[1, { title: 'Utopia', synopsis: UTOPIA_HINTS.synopsis }]]) }
  let loads = 0
  const hintsFor = createGuideHints({ loadGuide: async () => { loads += 1; return guide } })
  assert.equal((await hintsFor('Utopia')).synopsis, UTOPIA_HINTS.synopsis)
  assert.equal(await hintsFor('Heat'), null)
  assert.equal(loads, 2)
  assert.equal(await createGuideHints({ loadGuide: async () => { throw new Error('no guide') } })('Utopia'), null)
})

test('a recorded film no longer in the guide matches on exact title and year alone', async () => {
  const routes = {
    ...HEAT_ROUTES,
    '/search/movie': { results: [
      { id: 949, title: 'Heat', release_date: '1995-12-15' },
      { id: 11, title: 'Heat', release_date: '1986-03-14' },
      { id: 12, title: 'Heat Wave', release_date: '1995-01-01' },
    ] },
  }
  const { ratings } = ratingsWith({ routes, hints: null })
  assert.equal((await settled(ratings, 'Heat', { kind: 'movie', year: 1995 })).score, 7.9)
  assert.equal((await settled(ratings, 'Heat', { kind: 'movie' })).status, 'none')
  assert.equal((await settled(ratings, 'Heat', { kind: 'movie', year: 1970 })).status, 'none')
})

const waitingRatings = ({ lookUpMs, waitMs }) => createProgrammeRatings({
  lookUp: () => new Promise((resolve) => setTimeout(() => resolve({ score: 8, votes: 900, source: 'tmdb', url: 'https://www.themoviedb.org/movie/1', reviews: null }), lookUpMs)),
  cache: memoryCache(),
  ratingsEnabled: async () => true,
  reviewsEnabled: async () => true,
  tmdbKey: async () => 'k',
  waitMs,
  linkOf: (url) => url,
})

test('a lookup that finishes within the wait answers ready on the first request', async () => {
  const ratings = waitingRatings({ lookUpMs: 5, waitMs: 200 })
  assert.equal((await ratings.ratingsFor('Heat', { kind: 'movie' })).score, 8)
})

test('a lookup slower than the wait answers pending, and warm never waits', async () => {
  const slow = waitingRatings({ lookUpMs: 100, waitMs: 10 })
  assert.equal((await slow.ratingsFor('Heat', { kind: 'movie' })).status, 'pending')
  const warmed = waitingRatings({ lookUpMs: 5, waitMs: 1000 })
  const started = Date.now()
  await warmed.warm([{ title: 'Heat', kind: 'movie' }, { title: 'Heat', kind: 'movie' }, { title: null }])
  assert.ok(Date.now() - started < 500)
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal((await warmed.ratingsFor('Heat', { kind: 'movie', wait: false })).score, 8)
})

test('warm targets For you items and programmes airing within the window', () => {
  const result = { topPick: { title: 'A', kind: 'liked', programmeKind: 'movie' }, sections: [{ items: [{ title: 'B', kind: 'similar', programmeKind: 'series' }] }, { items: [] }] }
  assert.deepEqual(forYouProgrammesOf(result), [{ title: 'A', kind: 'movie' }, { title: 'B', kind: 'series' }])
  const guide = { programByEventId: new Map([
    [1, { title: 'Soon', kind: 'movie', start: 2000, end: 5000 }],
    [2, { title: 'Show', kind: 'show', start: 2000, end: 5000 }],
    [3, { title: 'Later', kind: 'movie', start: 90000, end: 99000 }],
    [4, { title: 'Over', kind: 'movie', start: 0, end: 900 }],
  ]) }
  assert.deepEqual(upcomingProgrammesOf({ guide, nowMs: 1000, windowMs: 10000 }).map(({ title }) => title), ['Soon', 'Show'])
})

test('a lookup that finds nothing caches why', async () => {
  const reality = { ...UTOPIA_AU, id: 77, name: 'Renters', type: 'Reality', externals: {} }
  const { ratings, cache } = ratingsWith({ routes: { '/search/shows': [{ show: reality }] }, apiKey: null })
  assert.equal((await settled(ratings, 'Renters')).status, 'none')
  assert.deepEqual([...cache.rows.values()].map(({ found, missReason }) => [found, missReason]), [[null, 'not-story:Reality']])
  const films = ratingsWith({ routes: { '/search/movie': { results: [] } }, hints: null })
  await settled(films.ratings, 'Obscure Film', { kind: 'movie' })
  assert.deepEqual([...films.cache.rows.values()].map(({ missReason }) => missReason), ['no-guide-details'])
})

test('same-name shows are told apart by the guide episode titles', async () => {
  const friends = { id: 431, name: 'Friends', premiered: '1994-09-22', type: 'Scripted', language: 'English', weight: 99, rating: { average: 8.5 }, url: 'https://www.tvmaze.com/shows/431/friends', externals: {}, network: { country: { code: 'US' } } }
  const older = { ...friends, id: 5000, premiered: '1979-03-25', weight: 57, rating: { average: 6 }, url: 'https://www.tvmaze.com/shows/5000/friends' }
  const hints = programmeHintsOf([{ title: 'Friends', synopsis: 'Ross is surprised.', episode_title: 'The One With The Lottery', series_no: 9 }])
  const routes = {
    '/search/shows': [{ show: friends }, { show: older }],
    '/shows/431/episodes': [{ name: 'The One Where Monica Gets a Roommate' }, { name: 'The One with the Lottery' }],
    '/shows/5000/episodes': [{ name: 'Pilot' }],
  }
  const { ratings } = ratingsWith({ routes, hints, apiKey: null })
  assert.equal((await settled(ratings, 'Friends')).score, 8.5)
  const unknown = programmeHintsOf([{ title: 'Friends', synopsis: 'Ross is surprised.', episode_title: 'Episode 4' }])
  const vague = ratingsWith({ routes, hints: unknown, apiKey: null })
  assert.equal((await settled(vague.ratings, 'Friends')).status, 'none')
})

const BIG_BROTHER_SEARCH = JSON.parse(readFileSync(new URL('./fixtures/tvmaze-search-big-brother.json', import.meta.url)))
const BIG_BROTHER_AIRING = {
  program_id: 387216,
  channel_id: 'ten-hd',
  title: 'Big Brother',
  episode_title: 'Episode 1',
  synopsis: "Housemates compete to win $250,000, under Big Brother's constant watchful eye.",
  series_no: 17,
  episode_no: 1,
  kind: 'series',
}

test('pickRatedShow takes the same-name show whose network airs it on a guide channel', async () => {
  const guide = {
    channels: [{ id: 'ten-hd', epgId: 'ten-hd', name: '10 HD' }, { id: 'nine', epgId: 'nine', name: '9HD Sydney' }],
    programByEventId: new Map([['387216', BIG_BROTHER_AIRING]]),
  }
  const hints = await createGuideHints({ loadGuide: async () => guide })('Big Brother')
  assert.deepEqual(hints.channelNames, ['10 HD'])
  assert.equal(pickRatedShow({ results: BIG_BROTHER_SEARCH, key: 'big brother', hints, country: 'au' }).id, 87106)
  const onNine = { ...hints, channelNames: ['9HD Sydney'] }
  assert.equal(pickRatedShow({ results: BIG_BROTHER_SEARCH, key: 'big brother', hints: onNine, country: 'au' }).id, 8471)
})

test('pickRatedShow leaves several local same-name shows unpicked without a guide channel', () => {
  assert.equal(pickRatedShow({ results: BIG_BROTHER_SEARCH, key: 'big brother', hints: null, country: 'au' }), null)
  const elsewhere = programmeHintsOf([BIG_BROTHER_AIRING])
  assert.equal(pickRatedShow({ results: BIG_BROTHER_SEARCH, key: 'big brother', hints: elsewhere, country: 'au' }), null)
})

test('pickRatedShow ignores a matching network name from another country', () => {
  const hints = { ...programmeHintsOf([BIG_BROTHER_AIRING]), channelNames: ['CBS'] }
  assert.equal(pickRatedShow({ results: BIG_BROTHER_SEARCH, key: 'big brother', hints, country: 'au' }), null)
})

test('pickRatedShow matches the local country whatever its letter case', () => {
  const results = [{ show: UTOPIA_UK }, { show: UTOPIA_AU }]
  assert.equal(pickRatedShow({ results, key: 'utopia', hints: null, country: 'au' }), UTOPIA_AU)
})

const FISK_HINTS = programmeHintsOf([{
  title: 'Fisk',
  episode_title: 'Of Sound Mind',
  channel_id: 'abc',
  synopsis: 'Helen takes on a messy estate after an old client dies.',
}], { channelNameOf: () => 'ABC TV HD' })

const FISK_TMDB = {
  id: 500,
  name: 'Fisk',
  type: 'Scripted',
  first_air_date: '2021-05-07',
  origin_country: ['AU'],
  networks: [{ name: 'ABC' }],
  overview: 'A probate lawyer starts again at a small suburban firm.',
  vote_average: 7.64,
  vote_count: 80,
  reviews: { total_results: 0, results: [] },
}

const tvmazeDown = () => { throw Object.assign(new Error('api.tvmaze.com HTTP 502'), { code: 'unavailable' }) }

test('a series with a TMDB key matched on a local guide network takes the TMDB score without TVmaze', async () => {
  const routes = {
    '/search/tv': { results: [{ id: 500, name: 'Fisk', origin_country: ['AU'] }] },
    '/tv/500': FISK_TMDB,
    '/search/shows': tvmazeDown,
  }
  const { ratings, client } = ratingsWith({ routes, hints: FISK_HINTS })
  assert.deepEqual(await settled(ratings, 'Fisk'), {
    status: 'ready', score: 7.6, votes: 80, source: 'tmdb', url: 'https://www.themoviedb.org/tv/500', reviews: null,
  })
  assert.deepEqual(client.calls.map(({ path }) => path), ['/search/tv', '/tv/500'])
})

test('a TMDB reality series gets no score and asks TVmaze nothing', async () => {
  const routes = {
    '/search/tv': { results: [{ id: 500, name: 'Fisk', origin_country: ['AU'] }] },
    '/tv/500': { ...FISK_TMDB, type: 'Reality' },
    '/search/shows': tvmazeDown,
  }
  const { ratings, cache } = ratingsWith({ routes, hints: FISK_HINTS })
  assert.equal((await settled(ratings, 'Fisk')).status, 'none')
  assert.equal(cache.rows.get('tmdb:series-v2:fisk').missReason, 'not-story:Reality')
})

test('a TMDB series with too few votes takes the TVmaze score', async () => {
  const fisk = { id: 3, name: 'Fisk', type: 'Scripted', language: 'English', rating: { average: 7.1 }, url: 'https://www.tvmaze.com/shows/3/fisk', network: { name: 'ABC', country: { code: 'AU' } } }
  const routes = {
    '/search/tv': { results: [{ id: 500, name: 'Fisk', origin_country: ['AU'] }] },
    '/tv/500': { ...FISK_TMDB, vote_count: 3 },
    '/search/shows': [{ show: fisk }],
  }
  const { ratings } = ratingsWith({ routes, hints: FISK_HINTS })
  const answer = await settled(ratings, 'Fisk')
  assert.equal(answer.source, 'tvmaze')
  assert.equal(answer.score, 7.1)
})

test('a TVmaze outage on a TMDB series with too few votes backs off instead of caching a miss', async () => {
  const routes = {
    '/search/tv': { results: [{ id: 500, name: 'Fisk', origin_country: ['AU'] }] },
    '/tv/500': { ...FISK_TMDB, vote_count: 3 },
    '/search/shows': tvmazeDown,
  }
  const { ratings, cache } = ratingsWith({ routes, hints: FISK_HINTS })
  assert.equal((await ratings.ratingsFor('Fisk')).status, 'pending')
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.equal((await ratings.ratingsFor('Fisk')).status, 'pending')
  assert.equal(cache.rows.size, 0)
})

test('a TMDB outage with no TVmaze match backs off instead of caching a miss', async () => {
  const routes = {
    '/search/tv': () => { throw Object.assign(new Error('api.themoviedb.org HTTP 503'), { code: 'unavailable' }) },
    '/search/shows': [],
  }
  const { ratings, cache } = ratingsWith({ routes, hints: FISK_HINTS })
  await ratings.ratingsFor('Fisk')
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.equal((await ratings.ratingsFor('Fisk')).status, 'pending')
  assert.equal(cache.rows.size, 0)
})

test('a hit saved before the TMDB-first change answers at once and refreshes in the background', async () => {
  const cache = memoryCache()
  cache.rows.set('tmdb:movie:film', { found: { score: 6, votes: 100, source: 'tmdb', url: null, reviews: null, originalLanguage: 'en' }, expiresAt: 1050 })
  let calls = 0
  const ratings = createProgrammeRatings({
    lookUp: async () => { calls += 1; return { score: 8, votes: 100, source: 'tmdb', url: null, reviews: null, originalLanguage: 'en' } },
    cache,
    ratingsEnabled: async () => true,
    reviewsEnabled: async () => true,
    tmdbKey: async () => 'k',
    now: () => 1000,
    hitTtlMs: 100,
    linkOf: (url) => url,
    staleBeforeMs: 990,
  })
  assert.equal((await ratings.ratingsFor('Film', { kind: 'movie' })).score, 6)
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.equal(calls, 1)
  assert.equal((await ratings.ratingsFor('Film', { kind: 'movie' })).score, 8)
  assert.equal(calls, 1)
})

const recordingRatings = ({ lookUpMs = 5, limiter = createHostLimiter({ concurrency: 1 }), isAllowed = async () => true } = {}) => {
  const looked = []
  const ratings = createProgrammeRatings({
    lookUp: ({ title }) => {
      looked.push(title)
      return new Promise((resolve) => setTimeout(() => resolve({ score: 7, votes: 900, source: 'tmdb', url: null, reviews: null }), lookUpMs))
    },
    cache: memoryCache(),
    ratingsEnabled: async () => true,
    reviewsEnabled: async () => true,
    tmdbKey: async () => 'k',
    lookupLimiter: limiter,
    isAllowed,
    linkOf: (url) => url,
  })
  return { ratings, looked }
}

test('a sheet the user opens is looked up ahead of the warm-up backlog', async () => {
  const { ratings, looked } = recordingRatings()
  const warming = ratings.warm(['A', 'B', 'C', 'D'].map((title) => ({ title, kind: 'movie' })))
  await new Promise((resolve) => setTimeout(resolve, 1))
  await ratings.ratingsFor('Opened', { kind: 'movie', wait: false })
  await warming
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.ok(looked.indexOf('Opened') <= 1, looked.join(','))
  assert.deepEqual(looked.filter((title) => title !== 'Opened'), ['A', 'B', 'C', 'D'])
})

test('a full lookup queue answers pending without a failure backoff', async () => {
  let full = true
  const limiter = {
    run: (task) => (full ? Promise.reject(Object.assign(new Error('queue full'), { code: 'queue-full' })) : Promise.resolve().then(task)),
  }
  const { ratings, looked } = recordingRatings({ limiter })
  assert.equal((await ratings.ratingsFor('Heat', { kind: 'movie', wait: false })).status, 'pending')
  await new Promise((resolve) => setTimeout(resolve, 1))
  full = false
  await ratings.ratingsFor('Heat', { kind: 'movie', wait: false })
  await new Promise((resolve) => setTimeout(resolve, 15))
  assert.deepEqual(looked, ['Heat'])
  assert.equal((await ratings.ratingsFor('Heat', { kind: 'movie' })).score, 7)
})

test('a title the gate refuses gets no lookup and no ratings', async () => {
  const { ratings, looked } = recordingRatings({ isAllowed: async (title) => title !== 'Random Junk 123' })
  assert.equal((await ratings.ratingsFor('Random Junk 123', { kind: 'movie' })).status, 'none')
  await ratings.warm([{ title: 'Random Junk 123', kind: 'movie' }])
  assert.deepEqual(looked, [])
})

test('forget also clears the dated film keys a sheet asked for', async () => {
  const cache = memoryCache()
  cache.removeDated = async (key) => {
    for (const stored of [...cache.rows.keys()]) if (stored > `${key}@` && stored < `${key}A`) cache.rows.delete(stored)
  }
  cache.rows.set('tmdb:movie:heat@1995', { found: { score: 8 }, expiresAt: Infinity })
  cache.rows.set('tmdb:movie:heat 2@1995', { found: { score: 5 }, expiresAt: Infinity })
  const { ratings } = ratingsWith({ cache })
  await ratings.forget('Heat')
  assert.deepEqual([...cache.rows.keys()], ['tmdb:movie:heat 2@1995'])
})

test('ratingsFor: a library film with a TMDB id reads that film, not a title search', async () => {
  const { ratings, client, cache } = ratingsWith({ routes: { '/movie/949': HEAT_DETAILS }, hints: HEAT_HINTS, externalIdsFor: async ({ kind }) => (kind === 'movie' ? { tmdb: '949', tvdb: null, imdb: null } : null) })
  const answer = await settled(ratings, 'Heat', { kind: 'movie', year: 1995 })
  assert.equal(answer.score, 7.9)
  assert.ok(!client.calls.some((call) => call.path.startsWith('/search/')))
  assert.deepEqual([...cache.rows.keys()], ['tmdb:movie:heat@tmdb-949'])
})

test('ratingsFor: a series whose ids TMDB does not know is a miss, with no title search', async () => {
  const { ratings, client } = ratingsWith({ routes: {}, externalIdsFor: async () => ({ tmdb: null, tvdb: '1', imdb: null }) })
  const answer = await settled(ratings, 'Dark')
  assert.equal(answer.status, 'none')
  assert.ok(!client.calls.some((call) => call.path.startsWith('/search/')))
  assert.ok(client.calls.some((call) => call.path === '/lookup/shows'))
})

test('ratingsFor: a failing id lookup in the store falls back to the title matcher', async () => {
  const { ratings, client } = ratingsWith({ routes: {}, apiKey: null, externalIdsFor: async () => { throw new Error('database locked') } })
  await settled(ratings, 'Dark')
  assert.ok(client.calls.some((call) => call.path === '/search/shows'))
})
