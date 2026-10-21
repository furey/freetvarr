import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  createCreditsLookup,
  createProgrammeCredits,
  httpsImageOf,
  isPersonImageSource,
  personImagePathOf,
  plainTextOf,
} from '../src/programme-credits.js'
import { createTitleMatcher } from '../src/programme-ratings.js'
import { programmeHintsOf } from '../src/artwork-match.js'

const memoryCache = () => {
  const rows = new Map()
  return {
    rows,
    read: async (key) => rows.get(key) || null,
    write: async ({ key, found, expiresAt }) => { rows.set(key, { found, expiresAt }) },
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

const shown = (source) => `/api/epg/person-image?src=${encodeURIComponent(source)}&w=192`

const settled = async (credits, title, options) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const answer = await credits.creditsFor(title, options)
    if (answer.status !== 'pending') return answer
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
  throw new Error('lookup never settled')
}

const creditsWith = ({
  routes,
  apiKey = 'k',
  hints = null,
  country = 'AU',
  creditsOn = true,
  knownReference = async () => null,
  cache = memoryCache(),
  clock = { ms: 1000 },
  lookUp = null,
  linkOf = (url) => url,
}) => {
  const client = fakeClient(routes || {})
  const matcher = createTitleMatcher({ client, countryCode: () => country, knownReference })
  const credits = createProgrammeCredits({
    lookUp: lookUp || createCreditsLookup({ matcher }),
    cache,
    creditsEnabled: async () => creditsOn,
    tmdbKey: async () => apiKey,
    hintsFor: async () => hints,
    now: () => clock.ms,
    hitTtlMs: 100,
    missTtlMs: 10,
    failureBackoffMs: 50,
    linkOf,
    staleBeforeMs: 0,
  })
  return { credits, client, cache, clock }
}

const HEAT_HINTS = programmeHintsOf([{
  title: 'Heat',
  kind: 'movie',
  synopsis: 'A group of professional bank robbers start to feel the heat from police when they unknowingly leave a clue at their latest heist. (Al Pacino, Robert De Niro) (1995)',
}])

const HEAT_DETAILS = {
  id: 949,
  title: 'Heat',
  release_date: '1995-12-15',
  overview: 'Obsessive master thief Neil McCauley leads a top-notch crew on various daring heists throughout Los Angeles while determined detective Vincent Hanna pursues him without rest.',
  vote_average: 7.94,
  vote_count: 7400,
  credits: {
    cast: [
      { id: 380, name: 'Robert De Niro', character: 'Neil McCauley', order: 1, profile_path: '/cT8htcckIuyI1Lqwt1CvD02ynTh.jpg' },
      { id: 1158, name: 'Al Pacino', character: 'Lt. Vincent Hanna', order: 0, profile_path: '/fMDFeVf0pjopTJbyRSLFwNDm8Wr.jpg' },
      { id: 5576, name: 'Val Kilmer', character: 'Chris Shiherlis', order: 2, profile_path: null },
      { id: 10127, name: 'Jon Voight', character: 'Nate', order: 3, profile_path: '/eZjgq2EZ5vPwHPHtMhIgMjCC6Hn.jpg' },
    ],
    crew: [
      { id: 638, name: 'Michael Mann', department: 'Directing', job: 'Director' },
      { id: 638, name: 'Michael Mann', department: 'Writing', job: 'Writer' },
      { id: 638, name: 'Michael Mann', department: 'Production', job: 'Producer' },
      { id: 4040, name: 'Art Linson', department: 'Production', job: 'Producer' },
      { id: 9999, name: 'Pieter Jan Brugge', department: 'Production', job: 'Producer' },
      { id: 7, name: 'Dante Spinotti', department: 'Camera', job: 'Director of Photography' },
    ],
  },
  reviews: { total_results: 0, results: [] },
}

const HEAT_REMAKE = { ...HEAT_DETAILS, id: 4242, release_date: '1986-03-14' }

const HEAT_ROUTES = {
  '/search/movie': { results: [{ id: 949, title: 'Heat' }] },
  '/movie/949': HEAT_DETAILS,
}

const MASTERCHEF = {
  id: 1238,
  name: 'MasterChef Australia',
  type: 'Reality',
  language: 'English',
  premiered: '2009-04-27',
  url: 'https://www.tvmaze.com/shows/1238/masterchef-australia',
  network: { name: 'Network 10', country: { code: 'AU' } },
  externals: { imdb: 'tt1405406' },
  summary: '<p><b>MasterChef Australia</b> searches for the country&#39;s best home cook &amp; puts them through cook-offs judged by professional chefs.</p>',
}

const MASTERCHEF_CAST = [
  {
    person: { id: 113584, name: 'Andy Allen', url: 'https://www.tvmaze.com/people/113584/andy-allen', image: { medium: 'https://static.tvmaze.com/uploads/images/medium_portrait/297/744014.jpg' } },
    character: { id: 1, name: 'Judge' },
  },
  {
    person: { id: 54321, name: 'Poh Ling Yeow', url: 'https://www.tvmaze.com/people/54321/poh-ling-yeow', image: { medium: 'http://static.tvmaze.com/uploads/images/medium_portrait/412/1031400.jpg' } },
    character: { id: 2, name: 'Judge' },
  },
  {
    person: { id: 98765, name: 'Jean-Christophe Novelli', url: 'https://www.tvmaze.com/people/98765/jean-christophe-novelli', image: null },
    character: { id: 3, name: 'Judge' },
  },
]

const MASTERCHEF_CREW = [
  { type: 'Creator', person: { id: 5, name: 'Franc Roddam' } },
  { type: 'Executive Producer', person: { id: 6, name: 'Margie Bashfield' } },
  { type: 'Executive Producer', person: { id: 7, name: 'Paul Franklin' } },
  { type: 'Executive Producer', person: { id: 8, name: 'Eden Gaha' } },
  { type: 'Casting Director', person: { id: 9, name: 'Somebody Else' } },
]

const MASTERCHEF_ROUTES = {
  '/search/shows': [{ show: MASTERCHEF }],
  '/shows/1238/cast': MASTERCHEF_CAST,
  '/shows/1238/crew': MASTERCHEF_CREW,
}

test('a film answers pending first, then TMDB cast in billing order, crew, and the overview', async () => {
  const { credits, client } = creditsWith({ routes: HEAT_ROUTES, hints: HEAT_HINTS })
  assert.deepEqual(await credits.creditsFor('Heat', { kind: 'movie' }), {
    status: 'pending', overview: null, cast: [], crew: [], source: null, url: null,
  })
  assert.deepEqual(await settled(credits, 'Heat', { kind: 'movie' }), {
    status: 'ready',
    overview: HEAT_DETAILS.overview,
    cast: [
      { name: 'Al Pacino', character: 'Lt. Vincent Hanna', image: shown('https://image.tmdb.org/t/p/w185/fMDFeVf0pjopTJbyRSLFwNDm8Wr.jpg'), url: 'https://www.themoviedb.org/person/1158' },
      { name: 'Robert De Niro', character: 'Neil McCauley', image: shown('https://image.tmdb.org/t/p/w185/cT8htcckIuyI1Lqwt1CvD02ynTh.jpg'), url: 'https://www.themoviedb.org/person/380' },
      { name: 'Val Kilmer', character: 'Chris Shiherlis', image: null, url: 'https://www.themoviedb.org/person/5576' },
      { name: 'Jon Voight', character: 'Nate', image: shown('https://image.tmdb.org/t/p/w185/eZjgq2EZ5vPwHPHtMhIgMjCC6Hn.jpg'), url: 'https://www.themoviedb.org/person/10127' },
    ],
    crew: [
      { name: 'Michael Mann', job: 'Director' },
      { name: 'Michael Mann', job: 'Writer' },
      { name: 'Michael Mann', job: 'Producer' },
      { name: 'Art Linson', job: 'Producer' },
    ],
    source: 'tmdb',
    url: 'https://www.themoviedb.org/movie/949',
  })
  assert.deepEqual(client.calls.map(({ path }) => path), ['/search/movie', '/movie/949'])
})

test('a reality series shows its hosts from TVmaze with https pictures and the plain summary', async () => {
  const { credits, client } = creditsWith({ routes: MASTERCHEF_ROUTES, apiKey: null })
  assert.equal((await credits.creditsFor('MasterChef Australia')).status, 'pending')
  assert.deepEqual(await settled(credits, 'MasterChef Australia'), {
    status: 'ready',
    overview: "MasterChef Australia searches for the country's best home cook & puts them through cook-offs judged by professional chefs.",
    cast: [
      { name: 'Andy Allen', character: 'Judge', image: shown('https://static.tvmaze.com/uploads/images/medium_portrait/297/744014.jpg'), url: 'https://www.tvmaze.com/people/113584/andy-allen' },
      { name: 'Poh Ling Yeow', character: 'Judge', image: shown('https://static.tvmaze.com/uploads/images/medium_portrait/412/1031400.jpg'), url: 'https://www.tvmaze.com/people/54321/poh-ling-yeow' },
      { name: 'Jean-Christophe Novelli', character: 'Judge', image: null, url: 'https://www.tvmaze.com/people/98765/jean-christophe-novelli' },
    ],
    crew: [
      { name: 'Franc Roddam', job: 'Creator' },
      { name: 'Margie Bashfield', job: 'Executive Producer' },
      { name: 'Paul Franklin', job: 'Executive Producer' },
    ],
    source: 'tvmaze',
    url: 'https://www.tvmaze.com/shows/1238/masterchef-australia',
  })
  assert.deepEqual(client.calls.map(({ path }) => path), ['/search/shows', '/shows/1238/cast', '/shows/1238/crew'])
})

test('a series without a TVmaze summary takes the TMDB overview through the IMDb id', async () => {
  const routes = {
    ...MASTERCHEF_ROUTES,
    '/search/shows': [{ show: { ...MASTERCHEF, summary: null } }],
    '/find/tt1405406': { tv_results: [{ id: 14769 }] },
    '/tv/14769': { id: 14769, name: 'MasterChef Australia', overview: 'Amateur cooks compete for the title.' },
  }
  const { credits } = creditsWith({ routes })
  assert.equal((await settled(credits, 'MasterChef Australia')).overview, 'Amateur cooks compete for the title.')
})

test('a series with a TMDB key shows the current season cast, not past hosts', async () => {
  const routes = {
    ...MASTERCHEF_ROUTES,
    '/find/tt1405406': { tv_results: [{ id: 14769 }] },
    '/tv/14769': { id: 14769, credits: { cast: [
      { id: 2, name: 'Poh Ling Yeow', character: 'Judge', order: 1, profile_path: '/poh.jpg' },
      { id: 1, name: 'Andy Allen', character: 'Judge', order: 0, profile_path: null },
    ] } },
  }
  const { credits } = creditsWith({ routes })
  const answer = await settled(credits, 'MasterChef Australia')
  assert.deepEqual(answer.cast.map(({ name }) => name), ['Andy Allen', 'Poh Ling Yeow'])
  assert.equal(answer.cast[1].image, shown('https://image.tmdb.org/t/p/w185/poh.jpg'))
  assert.equal(answer.crew[0].name, 'Franc Roddam')
})

test('a film year outside one year of the TMDB release skips the candidate', async () => {
  const { credits } = creditsWith({ routes: HEAT_ROUTES, hints: HEAT_HINTS })
  assert.equal((await settled(credits, 'Heat', { kind: 'movie', year: 1986 })).status, 'none')
  const nearby = creditsWith({ routes: HEAT_ROUTES, hints: HEAT_HINTS })
  assert.equal((await settled(nearby.credits, 'Heat', { kind: 'movie', year: 1996 })).url, 'https://www.themoviedb.org/movie/949')
})

test('a year steers past a known match for the other film of the same name', async () => {
  const routes = { ...HEAT_ROUTES, '/movie/4242': HEAT_REMAKE }
  const knownReference = async ({ kind }) => (kind === 'movie' ? { type: 'movie', id: '4242' } : null)
  const { credits, client } = creditsWith({ routes, hints: HEAT_HINTS, knownReference })
  assert.equal((await settled(credits, 'Heat', { kind: 'movie', year: 1995 })).url, 'https://www.themoviedb.org/movie/949')
  assert.deepEqual(client.calls.map(({ path }) => path), ['/movie/4242', '/search/movie', '/movie/949'])
})

test('a year keeps its own cache entry and series ignore it', async () => {
  const { credits, cache } = creditsWith({ routes: { ...HEAT_ROUTES, ...MASTERCHEF_ROUTES }, hints: HEAT_HINTS })
  await settled(credits, 'Heat', { kind: 'movie', year: 1995 })
  await settled(credits, 'MasterChef Australia', { year: 2009 })
  assert.deepEqual([...cache.rows.keys()], ['tmdb:movie:heat@1995', 'tmdb:series-v2:masterchef australia'])
})

test('a film without a TMDB key is not looked up', async () => {
  const { credits, client } = creditsWith({ routes: HEAT_ROUTES, hints: HEAT_HINTS, apiKey: null })
  assert.equal((await credits.creditsFor('Heat', { kind: 'movie' })).status, 'none')
  assert.equal(client.calls.length, 0)
})

test('the credits switch off means no lookup at all', async () => {
  const { credits, client } = creditsWith({ routes: MASTERCHEF_ROUTES, creditsOn: false })
  assert.equal((await credits.creditsFor('MasterChef Australia')).status, 'none')
  assert.equal(client.calls.length, 0)
})

test('an unmatched show is cached as a miss', async () => {
  const { credits, cache } = creditsWith({ routes: { '/search/shows': [] }, apiKey: null })
  assert.equal((await settled(credits, 'Nothing Like It')).status, 'none')
  assert.deepEqual(cache.rows.get('open:series-v2:nothing like it'), { found: null, expiresAt: 1010 })
})

test('forget drops a cached series miss so the next lookup runs again', async () => {
  const { credits, cache } = creditsWith({ routes: { '/search/shows': [] }, apiKey: null })
  await settled(credits, 'Nothing Like It')
  cache.rows.set('open:nothing like it', { found: null, expiresAt: Infinity })
  await credits.forget('Nothing Like It')
  assert.deepEqual([...cache.rows.keys()], ['open:nothing like it'])
})

test('a cached hit answers without a lookup until it expires, then answers while it refreshes', async () => {
  const { credits, client, clock } = creditsWith({ routes: MASTERCHEF_ROUTES, apiKey: null })
  await settled(credits, 'MasterChef Australia')
  assert.equal(client.calls.length, 3)
  clock.ms = 1099
  assert.equal((await credits.creditsFor('MasterChef Australia')).status, 'ready')
  assert.equal(client.calls.length, 3)
  clock.ms = 1101
  assert.equal((await credits.creditsFor('MasterChef Australia')).status, 'ready')
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.equal(client.calls.length, 6)
})

test('callers share one lookup and failures back off', async () => {
  let calls = 0
  let fail = false
  const { credits, clock } = creditsWith({
    lookUp: async () => {
      calls += 1
      if (fail) throw new Error('down')
      return { overview: 'A film.', cast: [], crew: [], source: 'tmdb', url: 'https://www.themoviedb.org/movie/1' }
    },
  })
  await Promise.all([credits.creditsFor('Film', { kind: 'movie' }), credits.creditsFor('Film', { kind: 'movie' })])
  assert.equal((await settled(credits, 'Film', { kind: 'movie' })).overview, 'A film.')
  assert.equal(calls, 1)
  clock.ms = 1101
  fail = true
  assert.equal((await credits.creditsFor('Film', { kind: 'movie' })).overview, 'A film.')
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.equal(calls, 2)
  clock.ms += 49
  assert.equal((await credits.creditsFor('Film', { kind: 'movie' })).overview, 'A film.')
  assert.equal(calls, 2)
  clock.ms += 2
  await credits.creditsFor('Film', { kind: 'movie' })
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.equal(calls, 3)
})

test('cast stops at twelve and a person voicing two parts appears once', async () => {
  const many = Array.from({ length: 15 }, (_, index) => ({ id: index, name: `Actor ${index}`, character: `Part ${index}`, order: index }))
  const routes = { ...HEAT_ROUTES, '/movie/949': { ...HEAT_DETAILS, credits: { cast: [...many, { ...many[0], character: 'Other part', order: 0 }], crew: [] } } }
  const knownReference = async ({ kind }) => (kind === 'movie' ? { type: 'movie', id: '949' } : null)
  const { credits } = creditsWith({ routes, knownReference })
  const { cast } = await settled(credits, 'Heat', { kind: 'movie' })
  assert.equal(cast.length, 12)
  assert.equal(cast.filter(({ name }) => name === 'Actor 0').length, 1)
})

test('helpers strip HTML and keep only https pictures', () => {
  assert.equal(plainTextOf('<p>Fish &amp; chips&nbsp;<i>tonight</i></p>'), 'Fish & chips tonight')
  assert.equal(plainTextOf('<p></p>'), null)
  assert.equal(httpsImageOf('http://static.tvmaze.com/a.jpg'), 'https://static.tvmaze.com/a.jpg')
  assert.equal(httpsImageOf('ftp://example.com/a.jpg'), null)
  assert.equal(httpsImageOf(null), null)
})

test('cast photos go through the local person image route, only from the two photo hosts', () => {
  assert.equal(isPersonImageSource('https://image.tmdb.org/t/p/w185/a.jpg'), true)
  assert.equal(isPersonImageSource('https://static.tvmaze.com/uploads/images/medium_portrait/1/2.jpg'), true)
  assert.equal(isPersonImageSource('https://image.tmdb.org/t/p/original/a.jpg'), false)
  assert.equal(isPersonImageSource('https://static.tvmaze.com/uploads/images/a.jpg?x=1'), false)
  assert.equal(isPersonImageSource('http://image.tmdb.org/t/p/w185/a.jpg'), false)
  assert.equal(isPersonImageSource('https://example.com/t/p/w185/a.jpg'), false)
  assert.equal(personImagePathOf('https://image.tmdb.org/t/p/w185/a.jpg'), '/api/epg/person-image?src=https%3A%2F%2Fimage.tmdb.org%2Ft%2Fp%2Fw185%2Fa.jpg&w=192')
  assert.equal(personImagePathOf(null), null)
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
  created_by: [{ id: 1, name: 'Kitty Flanagan' }],
  credits: {
    cast: [{ id: 11, name: 'Kitty Flanagan', character: 'Helen Tudor-Fisk', order: 0, profile_path: '/kitty.jpg' }],
    crew: [{ id: 12, name: 'Kevin Whyte', job: 'Executive Producer' }],
  },
  reviews: { total_results: 0, results: [] },
}

const tvmazeDown = () => { throw Object.assign(new Error('api.tvmaze.com HTTP 502'), { code: 'unavailable' }) }

test('a series with a TMDB key matched on a local guide network takes TMDB credits without TVmaze', async () => {
  const routes = {
    '/search/tv': { results: [{ id: 77, name: 'Fisk', origin_country: ['US'] }, { id: 500, name: 'Fisk', origin_country: ['AU'] }] },
    '/tv/500': FISK_TMDB,
    '/tv/77': { ...FISK_TMDB, id: 77, origin_country: ['US'], networks: [{ name: 'HBO' }] },
    '/search/shows': tvmazeDown,
  }
  const { credits, client } = creditsWith({ routes, hints: FISK_HINTS })
  assert.deepEqual(await settled(credits, 'Fisk'), {
    status: 'ready',
    overview: FISK_TMDB.overview,
    cast: [{ name: 'Kitty Flanagan', character: 'Helen Tudor-Fisk', image: shown('https://image.tmdb.org/t/p/w185/kitty.jpg'), url: 'https://www.themoviedb.org/person/11' }],
    crew: [{ name: 'Kitty Flanagan', job: 'Creator' }, { name: 'Kevin Whyte', job: 'Executive Producer' }],
    source: 'tmdb',
    url: 'https://www.themoviedb.org/tv/500',
  })
  assert.deepEqual(client.calls.map(({ path }) => path), ['/search/tv', '/tv/500'])
})

test('a TMDB series on no guide network falls back to TVmaze', async () => {
  const routes = {
    ...MASTERCHEF_ROUTES,
    '/search/tv': { results: [{ id: 500, name: 'MasterChef Australia', origin_country: ['AU'] }] },
    '/tv/500': { ...FISK_TMDB, name: 'MasterChef Australia', networks: [{ name: 'Seven Network' }] },
  }
  const hints = programmeHintsOf([{ title: 'MasterChef Australia', channel_id: 'ten', synopsis: 'Cooks cook.' }], { channelNameOf: () => '10 HD' })
  const { credits } = creditsWith({ routes, hints })
  assert.equal((await settled(credits, 'MasterChef Australia')).source, 'tvmaze')
})

test('links to a site that is down are dropped and the rest stay', async () => {
  const linkOf = (url) => (String(url).startsWith('https://www.tvmaze.com/') ? null : url)
  const { credits } = creditsWith({ routes: MASTERCHEF_ROUTES, apiKey: null, linkOf })
  const answer = await settled(credits, 'MasterChef Australia')
  assert.equal(answer.url, null)
  assert.deepEqual(answer.cast.map(({ url }) => url), [null, null, null])
  assert.equal(answer.cast[0].image, shown('https://static.tvmaze.com/uploads/images/medium_portrait/297/744014.jpg'))
})

test('an expired series hit keeps answering while TVmaze is down', async () => {
  const routes = { ...MASTERCHEF_ROUTES }
  const { credits, client, clock } = creditsWith({ routes, apiKey: null })
  await settled(credits, 'MasterChef Australia')
  routes['/search/shows'] = tvmazeDown
  clock.ms = 1101
  const fresh = creditsWith({ routes, apiKey: null })
  assert.equal((await credits.creditsFor('MasterChef Australia')).cast[0].name, 'Andy Allen')
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.equal((await credits.creditsFor('MasterChef Australia')).cast[0].name, 'Andy Allen')
  assert.equal(client.calls.filter(({ path }) => path === '/search/shows').length, 2)
  assert.equal((await fresh.credits.creditsFor('Never Seen')).status, 'pending')
})

test('a TMDB outage with no TVmaze match backs off instead of caching a miss', async () => {
  const routes = {
    '/search/tv': () => { throw Object.assign(new Error('api.themoviedb.org HTTP 503'), { code: 'unavailable' }) },
    '/search/shows': [],
  }
  const { credits, cache } = creditsWith({ routes, hints: FISK_HINTS })
  await credits.creditsFor('Fisk')
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.equal((await credits.creditsFor('Fisk')).status, 'pending')
  assert.equal(cache.rows.size, 0)
})
