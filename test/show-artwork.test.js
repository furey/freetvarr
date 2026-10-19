import { test } from 'node:test'
import assert from 'node:assert/strict'

import sharp from 'sharp'

import { createShowArtwork, pickShow, plexSourcesOf, showTitleKey, tvmazeSourcesOf } from '../src/show-artwork.js'
import { landscapeOf } from '../src/image-thumbnails.js'

const tvmazeShow = ({ id, name, country = 'AU', image = true }) => ({
  show: {
    id,
    name,
    network: { country: { code: country } },
    image: image ? { medium: `https://tvmaze.test/${id}-m.jpg`, original: `https://tvmaze.test/${id}.jpg` } : null,
  },
})

const memoryCache = () => {
  const rows = new Map()
  return {
    rows,
    read: async (key) => rows.get(key) || null,
    write: async ({ key, sources, expiresAt }) => { rows.set(key, { sources, expiresAt }) },
  }
}

const artworkWith = (overrides = {}) => createShowArtwork({
  loadPlexShows: async () => new Map(),
  searchTvmaze: async () => [],
  loadTvmazeImages: async () => [],
  cache: memoryCache(),
  isTvmazeEnabled: async () => true,
  countryCode: () => 'AU',
  lookupGapMs: 0,
  ...overrides,
})

test('showTitleKey: ignores case, punctuation, a leading "the", and a trailing year', () => {
  assert.equal(showTitleKey('The Block'), 'block')
  assert.equal(showTitleKey('Bluey (2018)'), 'bluey')
  assert.equal(showTitleKey('Telethon 2026'), 'telethon')
  assert.equal(showTitleKey('Celebrity Jeopardy!'), 'celebrity jeopardy')
  assert.equal(showTitleKey('Cool Cars & Bikes'), 'cool cars and bikes')
  assert.equal(showTitleKey('Pokémon'), 'pokemon')
  assert.equal(showTitleKey('1984'), '1984')
  assert.equal(showTitleKey(''), '')
})

test('pickShow: takes only an exact title match, preferring the local country', () => {
  const results = [
    tvmazeShow({ id: 1, name: 'Ukrainian Song Project' }),
    tvmazeShow({ id: 2, name: 'The Traitors', country: 'US' }),
    tvmazeShow({ id: 3, name: 'The Traitors', country: 'AU' }),
  ]
  assert.equal(pickShow({ results, key: showTitleKey('Ukrainian'), country: 'AU' }), null)
  assert.equal(pickShow({ results, key: showTitleKey('The Traitors'), country: 'AU' }).id, 3)
  assert.equal(pickShow({ results, key: showTitleKey('The Traitors'), country: 'NZ' }).id, 2)
})

test('pickShow: skips a match with no picture', () => {
  const results = [tvmazeShow({ id: 1, name: 'Chefs Ahoy', image: false })]
  assert.equal(pickShow({ results, key: 'chefs ahoy', country: 'AU' }), null)
})

test('tvmazeSourcesOf: puts the main landscape background before the poster', () => {
  const { show } = tvmazeShow({ id: 7, name: 'Show' })
  const images = [
    { type: 'poster', main: true, resolutions: { original: { url: 'https://tvmaze.test/poster.jpg' } } },
    { type: 'background', main: false, resolutions: { original: { url: 'https://tvmaze.test/bg-2.jpg' } } },
    { type: 'background', main: true, resolutions: { original: { url: 'https://tvmaze.test/bg-1.jpg' } } },
  ]
  assert.deepEqual(tvmazeSourcesOf({ show, images }), ['https://tvmaze.test/bg-1.jpg', 'https://tvmaze.test/7.jpg'])
  assert.deepEqual(tvmazeSourcesOf({ show }), ['https://tvmaze.test/7.jpg'])
})

test('plexSourcesOf: keys each library item by title, background art first, token attached', () => {
  const items = [
    { title: 'Bluey (2018)', art: '/library/metadata/1/art/9', thumb: '/library/metadata/1/thumb/9' },
    { title: 'Chefs Ahoy', thumb: '/library/metadata/2/thumb/9' },
    { title: 'No Pictures' },
  ]
  const byTitle = plexSourcesOf({ items, url: 'http://plex:32400', token: 'a b' })
  assert.deepEqual(byTitle.get('bluey'), [
    'http://plex:32400/library/metadata/1/art/9?X-Plex-Token=a%20b',
    'http://plex:32400/library/metadata/1/thumb/9?X-Plex-Token=a%20b',
  ])
  assert.deepEqual(byTitle.get('chefs ahoy'), ['http://plex:32400/library/metadata/2/thumb/9?X-Plex-Token=a%20b'])
  assert.equal(byTitle.has('no pictures'), false)
})

test('sourcesFor: a Plex match wins and TVmaze is never asked', async () => {
  let searches = 0
  const artwork = artworkWith({
    loadPlexShows: async () => new Map([['chefs ahoy', ['http://plex/thumb']]]),
    searchTvmaze: async () => { searches += 1; return [] },
  })
  assert.deepEqual(await artwork.sourcesFor('Chefs Ahoy'), ['http://plex/thumb'])
  assert.equal(searches, 0)
})

test('sourcesFor: asks TVmaze once per title and remembers the answer', async () => {
  let searches = 0
  const cache = memoryCache()
  const artwork = artworkWith({
    cache,
    searchTvmaze: async () => { searches += 1; return [tvmazeShow({ id: 9, name: 'Chefs Ahoy' })] },
  })
  const [first, second] = await Promise.all([artwork.sourcesFor('Chefs Ahoy'), artwork.sourcesFor('chefs ahoy!')])
  assert.deepEqual(first, ['https://tvmaze.test/9.jpg'])
  assert.deepEqual(second, first)
  assert.deepEqual(await artwork.sourcesFor('Chefs Ahoy'), first)
  assert.equal(searches, 1)
  assert.deepEqual(cache.rows.get('chefs ahoy').sources, first)
})

test('sourcesFor: remembers a title TVmaze does not know until the miss expires', async () => {
  let clock = 1_000
  let searches = 0
  const artwork = artworkWith({
    now: () => clock,
    missTtlMs: 500,
    searchTvmaze: async () => { searches += 1; return [] },
  })
  assert.deepEqual(await artwork.sourcesFor('1 Euro House'), [])
  assert.deepEqual(await artwork.sourcesFor('1 Euro House'), [])
  assert.equal(searches, 1)
  clock += 500
  await artwork.sourcesFor('1 Euro House')
  assert.equal(searches, 2)
})

test('sourcesFor: a failed TVmaze request is not saved, and pauses lookups for that title', async () => {
  let clock = 1_000
  let searches = 0
  const cache = memoryCache()
  const artwork = artworkWith({
    cache,
    now: () => clock,
    failureBackoffMs: 500,
    searchTvmaze: async () => {
      searches += 1
      if (searches === 1) throw new Error('TVmaze HTTP 429')
      return [tvmazeShow({ id: 4, name: 'Pooch Perfect' })]
    },
  })
  assert.deepEqual(await artwork.sourcesFor('Pooch Perfect'), [])
  assert.equal(cache.rows.size, 0)
  assert.deepEqual(await artwork.sourcesFor('Pooch Perfect'), [])
  assert.equal(searches, 1)
  clock += 500
  assert.deepEqual(await artwork.sourcesFor('Pooch Perfect'), ['https://tvmaze.test/4.jpg'])
})

test('artworkFor: answers at once and looks TVmaze up in the background', async () => {
  let finishSearch
  const artwork = artworkWith({
    searchTvmaze: () => new Promise((resolve) => { finishSearch = resolve }),
  })
  assert.deepEqual(await artwork.artworkFor('Pooch Perfect'), { sources: [], pending: true })
  await new Promise(setImmediate)
  finishSearch([tvmazeShow({ id: 4, name: 'Pooch Perfect' })])
  assert.deepEqual(await artwork.sourcesFor('Pooch Perfect'), ['https://tvmaze.test/4.jpg'])
  assert.deepEqual(await artwork.artworkFor('Pooch Perfect'), { sources: ['https://tvmaze.test/4.jpg'], pending: false })
})

test('artworkFor: a Plex match and a remembered miss are final answers', async () => {
  const cache = memoryCache()
  await cache.write({ key: '1 euro house', sources: [], expiresAt: Infinity })
  const artwork = artworkWith({
    cache,
    loadPlexShows: async () => new Map([['chefs ahoy', ['http://plex/thumb']]]),
  })
  assert.deepEqual(await artwork.artworkFor('Chefs Ahoy'), { sources: ['http://plex/thumb'], pending: false })
  assert.deepEqual(await artwork.artworkFor('1 Euro House'), { sources: [], pending: false })
  assert.deepEqual(await artwork.artworkFor(''), { sources: [], pending: false })
})

test('artworkFor: a slow Plex library counts as pending', async () => {
  const artwork = artworkWith({
    plexWaitMs: 10,
    loadPlexShows: () => new Promise(() => {}),
  })
  assert.deepEqual(await artwork.artworkFor('Show'), { sources: [], pending: true })
})

test('sourcesFor: the setting turns TVmaze off', async () => {
  let searches = 0
  const artwork = artworkWith({
    isTvmazeEnabled: async () => false,
    searchTvmaze: async () => { searches += 1; return [tvmazeShow({ id: 1, name: 'Show' })] },
  })
  assert.deepEqual(await artwork.sourcesFor('Show'), [])
  assert.equal(searches, 0)
})

test('sourcesFor: a Plex error falls through to TVmaze', async () => {
  const artwork = artworkWith({
    loadPlexShows: async () => { throw new Error('Plex HTTP 401') },
    searchTvmaze: async () => [tvmazeShow({ id: 5, name: 'Show' })],
  })
  assert.deepEqual(await artwork.sourcesFor('Show'), ['https://tvmaze.test/5.jpg'])
})

test('landscapeOf: fits a portrait poster into a 16:9 picture and leaves landscape pictures alone', async () => {
  const solid = (width, height) => sharp({ create: { width, height, channels: 3, background: '#336699' } }).jpeg().toBuffer()
  const poster = { body: await solid(680, 1000), contentType: 'image/jpeg' }
  const fitted = await landscapeOf(poster)
  const { width, height } = await sharp(fitted.body).metadata()
  assert.equal(height, 720)
  assert.equal(width, 1280)
  const wide = { body: await solid(1280, 720), contentType: 'image/jpeg' }
  assert.equal(await landscapeOf(wide), wide)
})

test('forget: drops the cached sources and the failure backoff', async () => {
  const cache = memoryCache()
  let searches = 0
  const artwork = artworkWith({
    cache,
    searchTvmaze: async () => {
      searches += 1
      if (searches === 1) throw new Error('down')
      return [tvmazeShow({ id: 1, name: 'Bluey' })]
    },
  })
  await artwork.sourcesFor('Bluey')
  assert.deepEqual(await artwork.sourcesFor('Bluey'), [])
  await artwork.forget('Bluey')
  assert.equal((await artwork.sourcesFor('Bluey')).length > 0, true)
  cache.rows.set('bluey', { sources: ['old'], expiresAt: Date.now() + 100000 })
  cache.remove = async (key) => cache.rows.delete(key)
  await artwork.forget('Bluey')
  assert.equal(cache.rows.has('bluey'), false)
})
