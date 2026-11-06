import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'

process.env.DB_PATH ??= path.join(os.tmpdir(), `freetvarr-series-ratings-${process.pid}.db`)

const { confidentShowOf, createSeriesRatings, seriesRatingOf, seriesRatingsEnabledFrom, warmSeriesRatingsIfEmpty } = await import('../src/series-ratings.js')
const { OutboundError } = await import('../src/outbound-http.js')

const NOW = Date.UTC(2026, 10, 6, 3)
const DAY = 24 * 60 * 60 * 1000

const memoryCache = (fresh = []) => {
  const writes = []
  return {
    writes,
    freshKeys: async () => new Set(fresh),
    write: async (row) => { writes.push(row) },
  }
}

const show = (id, extra = {}) => ({
  id,
  name: `Show ${id}`,
  type: 'Scripted',
  weight: 90,
  runtime: 60,
  rating: { average: 8.2 },
  url: `https://www.tvmaze.com/shows/${id}/show`,
  network: { country: { code: 'AU' } },
  ...extra,
})

const resultsFor = (title) => [{ show: show(title.length, { name: title }) }]

const lookups = ({ searchShows = async (title) => resultsFor(title), cache = memoryCache(), sleeps = [], ...options } = {}) => ({
  cache,
  sleeps,
  ratings: createSeriesRatings({
    searchShows,
    cache,
    isEnabled: async () => true,
    countryOfZone: () => 'AU',
    now: () => NOW,
    sleep: async (ms) => { sleeps.push(ms) },
    ...options,
  }),
})

test('saves the score, weight, type, runtime, and TVmaze page for 7 days, keyed by show title', async () => {
  const { ratings, cache } = lookups()
  const result = await ratings.run({ titles: ['Utopia', 'Utopia', 'Fisk'] })
  assert.deepEqual(result, { looked: 2, found: 2, failed: 0, stopped: false })
  assert.deepEqual(cache.writes[0], {
    key: 'utopia',
    facts: { score: 8.2, weight: 90, type: 'Scripted', runtime: 60, url: 'https://www.tvmaze.com/shows/6/show' },
    expiresAt: NOW + 7 * DAY,
  })
})

test('waits at least one second before each TVmaze request', async () => {
  const { ratings, sleeps } = lookups()
  await ratings.run({ titles: ['A', 'B', 'C'] })
  assert.deepEqual(sleeps, [1000, 1000, 1000])
})

test('Ghosts: two same-title shows of similar weight in other countries give no score', () => {
  const results = [
    { show: show(1, { name: 'Ghosts', weight: 99, network: { country: { code: 'US' } } }) },
    { show: show(2, { name: 'Ghosts', weight: 96, network: { country: { code: 'GB' } } }) },
  ]
  assert.equal(confidentShowOf({ results, title: 'Ghosts', country: 'AU' }), null)
  assert.equal(confidentShowOf({ results, title: 'Ghosts', country: 'GB' }).id, 2)
  assert.equal(confidentShowOf({ results, title: 'Ghosts', country: 'US' }).id, 1)
})

test('a dominant same-title show wins: weight 50 or more and 3 times the next', () => {
  const results = [
    { show: show(1, { name: 'Vera', weight: 96, network: { country: { code: 'GB' } } }) },
    { show: show(2, { name: 'Vera', weight: 20, network: { country: { code: 'BR' } } }) },
    { show: show(3, { name: 'Vera Drake', weight: 99 }) },
  ]
  assert.equal(confidentShowOf({ results, title: 'Vera', country: 'AU' }).id, 1)
  const close = [{ show: show(1, { name: 'Vera', weight: 60 }) }, { show: show(2, { name: 'Vera', weight: 30 }) }]
  assert.equal(confidentShowOf({ results: close, title: 'Vera', country: 'NZ' }), null)
  assert.equal(confidentShowOf({ results: [{ show: show(4, { name: 'Vera', weight: 40, network: { country: { code: 'GB' } } }) }], title: 'Vera', country: 'AU' }), null)
})

test('an unsure match is saved as a miss so it is not asked again for 7 days', async () => {
  const ghosts = [
    { show: show(1, { name: 'Ghosts', weight: 99, network: { country: { code: 'US' } } }) },
    { show: show(2, { name: 'Ghosts', weight: 96, network: { country: { code: 'GB' } } }) },
  ]
  const { ratings, cache } = lookups({ searchShows: async () => ghosts })
  const result = await ratings.run({ titles: ['Ghosts'] })
  assert.equal(result.found, 0)
  assert.deepEqual(cache.writes, [{ key: 'ghosts', facts: null, expiresAt: NOW + 7 * DAY }])
})

test('fresh saved ratings and blank titles are skipped', async () => {
  const asked = []
  const { ratings } = lookups({ searchShows: async (title) => { asked.push(title); return resultsFor(title) }, cache: memoryCache(['utopia']) })
  await ratings.run({ titles: ['Utopia', 'Fisk', '', null] })
  assert.deepEqual(asked, ['Fisk'])
})

test('a failed request writes nothing, so the last good rating stays', async () => {
  const { ratings, cache } = lookups({
    searchShows: async (title) => {
      if (title === 'B') throw new OutboundError('api.tvmaze.com did not answer', { code: 'unavailable' })
      return resultsFor(title)
    },
  })
  const result = await ratings.run({ titles: ['A', 'B', 'C'] })
  assert.deepEqual(result, { looked: 3, found: 2, failed: 1, stopped: false })
  assert.deepEqual(cache.writes.map((row) => row.key), ['a', 'c'])
})

test('stops after five failures in a row, such as timeouts, oversize replies, or an open circuit', async () => {
  const errors = [
    Object.assign(new Error('timeout of 8000ms exceeded'), { code: 'ECONNABORTED' }),
    new OutboundError('api.tvmaze.com sent more than 262144 bytes', { code: 'too-large' }),
    new OutboundError('api.tvmaze.com sent text/html', { code: 'bad-content' }),
    new OutboundError('api.tvmaze.com HTTP 429', { code: 'unavailable', status: 429 }),
    new OutboundError('api.tvmaze.com is backing off', { code: 'circuit-open' }),
  ]
  let calls = 0
  const { ratings, cache } = lookups({ searchShows: async () => { throw errors[calls++ % errors.length] } })
  const result = await ratings.run({ titles: ['1', '2', '3', '4', '5', '6', '7', '8'] })
  assert.deepEqual(result, { looked: 5, found: 0, failed: 5, stopped: true })
  assert.equal(calls, 5)
  assert.deepEqual(cache.writes, [])
})

test('looks up at most the budget per run', async () => {
  const asked = []
  const { ratings } = lookups({ searchShows: async (title) => { asked.push(title); return resultsFor(title) }, budget: 2 })
  await ratings.run({ titles: ['A', 'B', 'C'] })
  assert.deepEqual(asked, ['A', 'B'])
})

test('does nothing when TVmaze lookups or ratings are off', async () => {
  const asked = []
  const ratings = createSeriesRatings({ searchShows: async (title) => { asked.push(title) }, cache: memoryCache(), isEnabled: async () => false, sleep: async () => {} })
  assert.deepEqual(await ratings.run({ titles: ['A'] }), { looked: 0, found: 0, failed: 0, skipped: true })
  assert.deepEqual(asked, [])
  assert.equal(seriesRatingsEnabledFrom({ genreLookup: null, ratingsLookup: null }), true)
  assert.equal(seriesRatingsEnabledFrom({ genreLookup: null, ratingsLookup: 'false' }), false)
  assert.equal(seriesRatingsEnabledFrom({ genreLookup: 'false', ratingsLookup: 'true' }), false)
})

test('runs one refresh at a time', async () => {
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const { ratings } = lookups({ searchShows: async (title) => { await gate; return resultsFor(title) } })
  const first = ratings.run({ titles: ['A'] })
  assert.equal(ratings.run({ titles: ['B'] }), first)
  assert.equal(ratings.isRunning(), true)
  release()
  await first
  assert.equal(ratings.isRunning(), false)
})

test('searches the shared TVmaze client with a timeout, a size cap, and as a background call', async () => {
  const calls = []
  const client = { getJson: async (request) => { calls.push(request); return resultsFor('Utopia') } }
  const ratings = createSeriesRatings({ client, cache: memoryCache(), isEnabled: async () => true, countryOfZone: () => 'AU', sleep: async () => {} })
  await ratings.run({ titles: ['Utopia'] })
  assert.deepEqual(calls, [{ url: 'https://api.tvmaze.com/search/shows', params: { q: 'Utopia' }, timeoutMs: 8000, maxBytes: 256 * 1024, isBackground: true }])
})

test('reads only the fields it needs and drops links that are not TVmaze pages', () => {
  assert.deepEqual(seriesRatingOf(show(1, { rating: { average: null }, weight: 'x', runtime: null, averageRuntime: 30, url: 'https://evil.example/shows/1' })), {
    score: null,
    weight: 0,
    type: 'Scripted',
    runtime: 30,
    url: null,
  })
  assert.equal(seriesRatingOf(null), null)
  assert.equal(confidentShowOf({ results: '<html>', title: 'Utopia', country: 'AU' }), null)
})

test('after an upgrade with no saved series scores, the startup warm-up runs one refresh; with scores saved it leaves it to the nightly upkeep', async () => {
  let refreshes = 0
  const refresh = async () => { refreshes += 1; return { looked: 1 } }
  assert.deepEqual(await warmSeriesRatingsIfEmpty({ hasSaved: async () => false, refresh }), { looked: 1 })
  assert.deepEqual(await warmSeriesRatingsIfEmpty({ hasSaved: async () => true, refresh }), { skipped: true })
  assert.equal(refreshes, 1)
})

test('the startup warm-up and the nightly upkeep share one run, so TVmaze is asked once per title', async () => {
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const asked = []
  const { ratings } = lookups({ searchShows: async (title) => { asked.push(title); await gate; return resultsFor(title) } })
  const warmUp = warmSeriesRatingsIfEmpty({ hasSaved: async () => false, refresh: () => ratings.run({ titles: ['Utopia'] }) })
  await new Promise((resolve) => setImmediate(resolve))
  const upkeep = ratings.run({ titles: ['Utopia'] })
  release()
  await Promise.all([warmUp, upkeep])
  assert.deepEqual(asked, ['Utopia'])
})
