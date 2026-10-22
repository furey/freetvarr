import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createArtworkLookup, createFallbackArtwork } from '../src/fallback-artwork.js'
import { programmeHintsOf } from '../src/artwork-match.js'

const memoryCache = () => {
  const rows = new Map()
  return {
    rows,
    read: async (key) => rows.get(key) || null,
    write: async ({ key, sources, reference, expiresAt }) => { rows.set(key, { sources, reference, expiresAt }) },
    remove: async (key) => { rows.delete(key) },
  }
}

const fallbackWith = ({ lookUp, apiKey = null, enabled = true, clock = { ms: 1000 }, cache = memoryCache() }) => ({
  cache,
  clock,
  artwork: createFallbackArtwork({
    lookUp,
    cache,
    isEnabled: async () => enabled,
    tmdbKey: async () => apiKey,
    hintsFor: async (title) => ({ title }),
    now: () => clock.ms,
    hitTtlMs: 100,
    missTtlMs: 10,
    failureBackoffMs: 50,
    staleBeforeMs: 0,
  }),
})

test('a hit is cached for the hit TTL and served without another lookup', async () => {
  let calls = 0
  const { artwork, cache, clock } = fallbackWith({ lookUp: async () => { calls += 1; return { sources: ['https://upload.wikimedia.org/a.jpg'] } } })
  assert.deepEqual(await artwork.sourcesFor('Cool Runnings'), ['https://upload.wikimedia.org/a.jpg'])
  assert.equal(cache.rows.get('wide-v1:open:cool runnings').expiresAt, 1100)
  clock.ms = 1099
  assert.deepEqual(await artwork.artworkFor('Cool Runnings'), { sources: ['https://upload.wikimedia.org/a.jpg'], pending: false })
  assert.equal(calls, 1)
})

test('a miss is remembered for the shorter miss TTL', async () => {
  let calls = 0
  const { artwork, clock } = fallbackWith({ lookUp: async () => { calls += 1; return null } })
  assert.deepEqual(await artwork.sourcesFor('Nothing Here'), [])
  clock.ms = 1009
  assert.deepEqual(await artwork.sourcesFor('Nothing Here'), [])
  assert.equal(calls, 1)
  clock.ms = 1011
  await artwork.sourcesFor('Nothing Here')
  assert.equal(calls, 2)
})

test('a failed lookup is not cached but backs off for a while', async () => {
  let calls = 0
  const { artwork, cache, clock } = fallbackWith({ lookUp: async () => { calls += 1; throw new Error('down') } })
  assert.deepEqual(await artwork.sourcesFor('Flaky'), [])
  assert.equal(cache.rows.size, 0)
  assert.deepEqual(await artwork.artworkFor('Flaky'), { sources: [], pending: false })
  assert.equal(calls, 1)
  clock.ms += 51
  await artwork.sourcesFor('Flaky')
  assert.equal(calls, 2)
})

test('artworkFor answers pending at once and shares one lookup between callers', async () => {
  let release
  let calls = 0
  const { artwork } = fallbackWith({
    lookUp: () => {
      calls += 1
      return new Promise((resolve) => { release = () => resolve({ sources: ['https://image.tmdb.org/t/p/w780/p.jpg'] }) })
    },
  })
  assert.deepEqual(await artwork.artworkFor('Slow'), { sources: [], pending: true })
  const waiting = artwork.sourcesFor('Slow')
  while (!release) await new Promise((resolve) => setTimeout(resolve, 1))
  release()
  assert.deepEqual(await waiting, ['https://image.tmdb.org/t/p/w780/p.jpg'])
  assert.equal(calls, 1)
})

test('nothing is looked up when lookups are off', async () => {
  let calls = 0
  const { artwork } = fallbackWith({ enabled: false, lookUp: async () => { calls += 1 } })
  assert.deepEqual(await artwork.artworkFor('Anything'), { sources: [], pending: false })
  assert.deepEqual(await artwork.sourcesFor('Anything'), [])
  assert.equal(calls, 0)
})

test('a TMDB key gets its own cache entries and is passed to the lookup', async () => {
  const keys = []
  const { artwork, cache } = fallbackWith({ apiKey: 'k', lookUp: async ({ apiKey }) => { keys.push(apiKey); return null } })
  await artwork.sourcesFor('Film')
  assert.deepEqual(keys, ['k'])
  assert.ok(cache.rows.has('wide-v1:tmdb:film'))
  await artwork.forget('Film')
  assert.equal(cache.rows.size, 0)
})

test('a film gets its own cache entry and film hints, so an old show miss does not hide it', async () => {
  const seen = []
  const cache = memoryCache()
  cache.rows.set('wide-v1:tmdb:training day', { sources: [], reference: 'miss:guide-network-v1', expiresAt: 10_000 })
  const { artwork } = fallbackWith({
    apiKey: 'k',
    cache,
    lookUp: async ({ hints }) => { seen.push(hints); return { sources: ['https://image.tmdb.org/t/p/w780/td.jpg'] } },
  })
  assert.deepEqual(await artwork.sourcesFor('Training Day'), [])
  assert.deepEqual(await artwork.sourcesFor('Training Day', { kind: 'movie' }), ['https://image.tmdb.org/t/p/w780/td.jpg'])
  assert.deepEqual(seen, [{ title: 'Training Day', kind: 'movie', isEpisode: false }])
  assert.ok(cache.rows.has('wide-v1:tmdb:movie:training day'))
  await artwork.forget('Training Day')
  assert.equal(cache.rows.size, 0)
})

const TRAINING_DAY = {
  title: 'Training Day (2001)',
  episode_title: 'Training Day',
  synopsis: 'This crime tale shadows a veteran narcotics detective as he tests the resolve of wide-eyed, idealistic rookie Jake Hoyt. (Denzel Washington)',
}

const fakeClient = (routes) => {
  const calls = []
  return {
    calls,
    getJson: async ({ url, params }) => {
      calls.push({ path: new URL(url).pathname, params })
      return routes(new URL(url).pathname, params) ?? {}
    },
  }
}

test('a film whose guide entry has an episode title is found through a TMDB movie search with its year', async () => {
  const client = fakeClient((path, params) => {
    if (path === '/3/search/movie' && params.query === 'Training Day' && params.year === 2001) {
      return { results: [{ id: 2034, title: 'Training Day', release_date: '2001-10-05' }] }
    }
    if (path === '/3/movie/2034') {
      return { title: 'Training Day', release_date: '2001-10-05', backdrop_path: '/b.jpg', credits: { cast: [{ name: 'Denzel Washington' }] } }
    }
    return null
  })
  const lookUp = createArtworkLookup({ client })
  const hints = { ...programmeHintsOf([TRAINING_DAY]), kind: 'movie', isEpisode: false }
  const found = await lookUp({ title: TRAINING_DAY.title, hints, apiKey: 'k' })
  assert.deepEqual(found, { sources: ['https://image.tmdb.org/t/p/original/b.jpg'], reference: 'tmdb:movie:2034' })
  assert.ok(!client.calls.some((call) => call.path === '/3/search/multi' || call.path === '/3/search/tv'))
})

test('an episode searches TMDB shows only', async () => {
  const client = fakeClient(() => null)
  const lookUp = createArtworkLookup({ client })
  await lookUp({ title: 'Bluey', hints: programmeHintsOf([{ title: 'Bluey', episode_title: 'Keepy Uppy', synopsis: 'Balloon game.' }]), apiKey: 'k' })
  assert.deepEqual([...new Set(client.calls.filter((call) => call.path.startsWith('/3/search')).map((call) => call.path))], ['/3/search/tv'])
})

test('a miss cached before the guide network match is looked up again', async () => {
  let calls = 0
  const cache = memoryCache()
  cache.rows.set('wide-v1:tmdb:big brother', { sources: [], reference: null, expiresAt: 10_000 })
  const { artwork } = fallbackWith({
    apiKey: 'k',
    cache,
    lookUp: async () => { calls += 1; return { sources: ['https://image.tmdb.org/t/p/w1280/bb.jpg'], reference: 'tmdb:tv:990' } },
  })
  assert.deepEqual(await artwork.sourcesFor('Big Brother'), ['https://image.tmdb.org/t/p/w1280/bb.jpg'])
  assert.equal(cache.rows.get('wide-v1:tmdb:big brother').reference, 'tmdb:tv:990')
  assert.equal(calls, 1)
})

const BIG_BROTHER = {
  title: 'Big Brother',
  episode_title: 'Episode 1',
  series_no: 17,
  episode_no: 1,
  channel_id: 'ten',
  synopsis: "Housemates compete to win $250,000, under Big Brother's constant watchful eye.",
}

const bigBrotherClient = ({ localNetworks }) => fakeClient((path) => {
  if (path === '/3/search/tv') {
    return {
      results: [
        { id: 10160, name: 'Big Brother', origin_country: ['US'] },
        { id: 11366, name: 'Big Brother', origin_country: ['GB'] },
        { id: 21926, name: 'Big Brother', origin_country: ['DE'] },
        { id: 990, name: 'Big Brother', origin_country: ['AU'] },
      ],
    }
  }
  if (path === '/3/tv/990') {
    return { id: 990, name: 'Big Brother', first_air_date: '2001-04-24', origin_country: ['AU'], networks: localNetworks, overview: 'A reality show.', backdrop_path: '/au.jpg', poster_path: '/aup.jpg' }
  }
  const id = path.match(/^\/3\/tv\/(\d+)$/)?.[1]
  return id ? { id: Number(id), name: 'Big Brother', first_air_date: '2000-07-05', origin_country: ['US'], networks: [{ name: '10' }], overview: 'A reality show.', backdrop_path: `/${id}.jpg` } : null
})

const bigBrotherHints = () => programmeHintsOf([BIG_BROTHER], { channelNameOf: () => '10 HD' })

test('a local TMDB show on a guide channel network is matched ahead of foreign versions', async () => {
  const client = bigBrotherClient({ localNetworks: [{ name: '10' }, { name: 'Nine Network' }] })
  const lookUp = createArtworkLookup({ client, countryCode: () => 'AU' })
  const found = await lookUp({ title: 'Big Brother', hints: bigBrotherHints(), apiKey: 'k' })
  assert.deepEqual(found, {
    sources: ['https://image.tmdb.org/t/p/original/au.jpg', 'https://image.tmdb.org/t/p/w780/aup.jpg'],
    reference: 'tmdb:tv:990',
  })
})

test('a local TMDB show whose networks match no guide channel is not matched', async () => {
  const client = bigBrotherClient({ localNetworks: [{ name: 'Seven Network' }] })
  const lookUp = createArtworkLookup({ client, countryCode: () => 'AU' })
  assert.equal(await lookUp({ title: 'Big Brother', hints: bigBrotherHints(), apiKey: 'k' }), null)
})

test('a foreign TMDB show on a same-named network is not matched', async () => {
  const client = bigBrotherClient({ localNetworks: [{ name: '10' }] })
  const lookUp = createArtworkLookup({ client, countryCode: () => 'NZ' })
  assert.equal(await lookUp({ title: 'Big Brother', hints: bigBrotherHints(), apiKey: 'k' }), null)
})

test('an expired hit keeps answering while the refresh fails, until the data is six months old', async () => {
  let calls = 0
  let down = false
  const day = 24 * 60 * 60 * 1000
  const { artwork, clock } = fallbackWith({
    lookUp: async () => {
      calls += 1
      if (down) throw new Error('down')
      return { sources: ['https://image.tmdb.org/t/p/w1280/a.jpg'], reference: 'tmdb:tv:1' }
    },
  })
  assert.deepEqual(await artwork.sourcesFor('Fisk'), ['https://image.tmdb.org/t/p/w1280/a.jpg'])
  down = true
  clock.ms = 1101
  assert.deepEqual(await artwork.artworkFor('Fisk'), { sources: ['https://image.tmdb.org/t/p/w1280/a.jpg'], pending: false })
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.equal(calls, 2)
  assert.deepEqual(await artwork.sourcesFor('Fisk'), ['https://image.tmdb.org/t/p/w1280/a.jpg'])
  assert.equal(calls, 2)
  clock.ms = 1000 + 181 * day
  assert.deepEqual(await artwork.artworkFor('Fisk'), { sources: [], pending: true })
})

test('a matched TMDB show offers up to eight backgrounds and eight posters, English and textless first', async () => {
  const backdrops = Array.from({ length: 12 }, (_, index) => ({ file_path: `/b${index}.jpg`, iso_639_1: index === 5 ? 'en' : index === 6 ? 'de' : null }))
  const posters = [{ file_path: '/p-de.jpg', iso_639_1: 'de' }, { file_path: '/p-en.jpg', iso_639_1: 'en' }, { file_path: '/aup.jpg', iso_639_1: 'en' }]
  const client = bigBrotherClient({ localNetworks: [{ name: '10' }] })
  const details = client.getJson
  client.getJson = async (request) => {
    const found = await details(request)
    return request.url.endsWith('/tv/990') ? { ...found, images: { backdrops, posters } } : found
  }
  const lookUp = createArtworkLookup({ client, countryCode: () => 'AU' })
  const { sources } = await lookUp({ title: 'Big Brother', hints: bigBrotherHints(), apiKey: 'k' })
  const base = 'https://image.tmdb.org/t/p'
  assert.deepEqual(sources, [
    `${base}/original/au.jpg`,
    `${base}/w780/aup.jpg`,
    ...['b5', 'b0', 'b1', 'b2', 'b3', 'b4', 'b7'].map((name) => `${base}/original/${name}.jpg`),
    `${base}/w780/p-en.jpg`,
    `${base}/w780/p-de.jpg`,
  ])
  const detailsCall = client.calls.find((call) => call.path === '/3/tv/990')
  assert.equal(detailsCall.params.include_image_language, 'en,null')
  assert.match(detailsCall.params.append_to_response, /images/)
})
