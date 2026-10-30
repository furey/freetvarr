import { test } from 'node:test'
import assert from 'node:assert/strict'
import { serveImageRoute } from '../src/image-routes.js'
import {
  composeShowPool, contentKeyOf, createArtPool, guideEpisodePoolOf, imageIdOf, plexArtsPoolOf, plexEpisodePoolOf, plexSourceOf,
  plexTranscodeOrigin, poolImagesOf, recordingImageRoute as recordingImageRouteOf, tvmazePoolOf, warmHomeArtPools,
} from '../src/art-pool.js'

const tvImage = (over) => ({
  type: 'background', main: false, resolutions: { original: { url: `https://tvmaze/${over.id}.jpg`, width: 1920, height: 1080 } }, ...over,
})

test('tvmazePoolOf keeps every background, main first, then posters and banners', () => {
  const images = [
    tvImage({ id: 'b1' }),
    tvImage({ id: 'b2', main: true }),
    tvImage({ id: 'p1', type: 'poster' }),
    tvImage({ id: 'n1', type: 'banner' }),
    tvImage({ id: 't1', type: 'typography' }),
  ]
  const pool = tvmazePoolOf({ show: { image: { original: 'https://tvmaze/show.jpg' } }, images })
  assert.deepEqual(pool.map((entry) => [entry.origin, entry.kind]), [
    ['https://tvmaze/b2.jpg', 'background'],
    ['https://tvmaze/b1.jpg', 'background'],
    ['https://tvmaze/show.jpg', 'poster'],
    ['https://tvmaze/p1.jpg', 'poster'],
    ['https://tvmaze/n1.jpg', 'poster'],
  ])
  assert.equal(pool[0].width, 1920)
  assert.equal(pool[0].source, 'tvmaze')
})

test('plexArtsPoolOf puts the selected art first and routes art through the Plex transcoder', () => {
  const pool = plexArtsPoolOf([
    { key: 'https://image.tmdb.org/a.jpg', selected: false },
    { key: '/library/metadata/1/file?url=metadata%3A%2F%2Fart', selected: true },
    { key: 'https://image.tmdb.org/a.jpg' },
    {},
  ])
  assert.equal(pool.length, 2)
  assert.equal(pool[0].selected, true)
  assert.match(pool[0].origin, /^plex:\/photo\/:\/transcode\?width=1920&height=1080/)
  assert.ok(pool[1].origin.endsWith(`url=${encodeURIComponent('https://image.tmdb.org/a.jpg')}`))
})

test('plexSourceOf adds the server and token at fetch time', () => {
  const source = plexSourceOf({ origin: plexTranscodeOrigin('/x'), url: 'http://plex:32400', token: 'a b' })
  assert.equal(source, 'http://plex:32400/photo/:/transcode?width=1920&height=1080&minSize=1&upscale=0&url=%2Fx&X-Plex-Token=a%20b')
})

test('plexEpisodePoolOf uses the episode thumb, or film art and poster', () => {
  const episode = plexEpisodePoolOf({ item: { thumb: '/t', art: '/a' }, section: { type: 'show' } })
  assert.deepEqual(episode.map((entry) => entry.kind), ['episode'])
  const film = plexEpisodePoolOf({ item: { thumb: '/t', art: '/a' }, section: { type: 'movie' } })
  assert.deepEqual(film.map((entry) => entry.kind), ['background', 'poster'])
  assert.deepEqual(plexEpisodePoolOf(null), [])
})

test('guideEpisodePoolOf prefers the saved recording image and keys it by content', () => {
  const saved = { body: Buffer.from('jpeg') }
  const [entry] = guideEpisodePoolOf({ row: { recording_id: 'r 1', image_path: 'x', image_url: 'http://g' }, saved })
  assert.equal(entry.url, '/api/recordings/r%201/image?w=768')
  assert.equal(entry.contentKey, contentKeyOf(Buffer.from('jpeg')))
  assert.deepEqual(guideEpisodePoolOf({ row: { recording_id: 'r1', image_path: 'x', image_url: 'http://g' } }), [])
  assert.deepEqual(guideEpisodePoolOf({ row: { recording_id: 'r1', image_url: 'http://g' } }), [
    { origin: 'http://g', kind: 'episode', source: 'guide' },
  ])
  assert.deepEqual(guideEpisodePoolOf({ row: { recording_id: 'r1' } }), [])
})

test('composeShowPool leads with the library art and drops the art it already shows', () => {
  const plex = { found: true, entries: [{ origin: 'p0', selected: true, kind: 'background' }, { origin: 'p1', kind: 'background' }] }
  const tvmaze = [{ origin: 't0', kind: 'background' }, { origin: 't1', kind: 'background' }, { origin: 'tp', kind: 'poster' }]
  const withPlex = composeShowPool({ title: 'The Block', plex, tvmaze })
  assert.deepEqual(withPlex.map((entry) => entry.origin ?? entry.source), ['library', 'p1', 't0', 't1', 'tp'])
  assert.equal(withPlex[0].url, '/api/epg/show-image?title=The%20Block&w=768')
  const withoutPlex = composeShowPool({ title: 'The Block', tvmaze })
  assert.deepEqual(withoutPlex.map((entry) => entry.origin ?? entry.source), ['library', 't1', 'tp'])
})

test('poolImagesOf gives proxied urls for upstream images', () => {
  const images = poolImagesOf({
    entries: [{ id: 'abc', origin: 'x', kind: 'background', source: 'plex' }, { url: '/lib', kind: 'background', source: 'library' }],
    base: '/api/library/shows/the-block/art-pool',
  })
  assert.deepEqual(images, [
    { url: '/api/library/shows/the-block/art-pool/abc?w=768', kind: 'background', source: 'plex', width: null, height: null, contentKey: null },
    { url: '/lib', kind: 'background', source: 'library', width: null, height: null, contentKey: null },
  ])
})

const memoryCache = () => {
  const rows = new Map()
  return { read: async (key) => rows.get(key) ?? null, write: async ({ key, ...value }) => rows.set(key, value), rows }
}

const poolWith = (over = {}) => createArtPool({
  loadShowRows: async (key) => (key === 'the-block' ? [{ recording_id: 'r1', title: 'The Block', file_path: '/tv/The Block/s01e01.ts' }] : []),
  loadRuleTitle: async (key) => (key === 'big-brother' ? 'Big Brother' : null),
  loadRecordingRow: async (id) => (id === 'r1' ? { recording_id: 'r1', file_path: '/tv/The Block/s01e01.ts', image_path: 'x' } : null),
  plexConnection: async () => ({ url: 'http://plex', token: 't' }),
  plexSections: async () => [{ id: '2', type: 'show' }],
  plexItems: async () => [{ ratingKey: '9', grandparentRatingKey: '5', thumb: '/ep', Media: [{ Part: [{ file: '/data/The Block/s01e01.ts' }] }] }],
  plexArts: async ({ ratingKey }) => (ratingKey === '5' ? [{ key: '/sel', selected: true }, { key: 'https://tmdb/a.jpg' }] : []),
  isTvmazeEnabled: async () => true,
  searchTvmaze: async () => [{ show: { id: 1, name: 'The Block', image: { original: 'https://tvmaze/show.jpg' } } }],
  hintsFor: async () => null,
  loadTvmazeImages: async () => [tvImage({ id: 'b1' })],
  countryCode: () => 'AU',
  cache: memoryCache(),
  poolStore: memoryCache(),
  loadSavedArtwork: async () => ({ body: Buffer.from('jpeg') }),
  thumbnailFor: async ({ source, width }) => ({ body: Buffer.from(`${source}|${width}`), contentType: 'image/webp' }),
  chosenBackground: async () => null,
  ...over,
})

test('showPool merges Plex alternates and TVmaze art for a library show', async () => {
  const pool = await poolWith().showPool('the-block')
  assert.deepEqual(pool.entries.map((entry) => entry.source), ['library', 'plex', 'tvmaze', 'tvmaze'])
  assert.ok(pool.entries.slice(1).every((entry) => entry.id === imageIdOf(entry.origin)))
  assert.equal(await poolWith().showPool('missing'), null)
})

test('showSources falls back to the series rule title for a show with no recordings', async () => {
  const sources = await poolWith({
    searchTvmaze: async () => [{ show: { id: 2, name: 'Big Brother', image: { original: 'https://tvmaze/bb.jpg' } } }],
  }).showSources('big-brother')
  assert.equal(sources.title, 'Big Brother')
  assert.deepEqual(sources.rows, [])
  assert.ok(sources.tvmaze.length > 0)
  assert.equal(await poolWith({ loadRuleTitle: async () => { throw new Error('tvheadend down') } }).showSources('big-brother'), null)
})

test('showPool skips TVmaze when the artwork lookup setting is off and Plex when unset', async () => {
  const pool = await poolWith({
    isTvmazeEnabled: async () => false,
    plexConnection: async () => { throw new Error('plex_url and plex_token are required') },
  }).showPool('the-block')
  assert.deepEqual(pool.entries.map((entry) => entry.source), ['library'])
})

test('showPool caches the TVmaze lookup', async () => {
  let searches = 0
  const cache = memoryCache()
  const searchTvmaze = async () => {
    searches += 1
    return [{ show: { id: 1, name: 'The Block', image: null } }]
  }
  await poolWith({ cache, searchTvmaze }).showPool('the-block')
  await poolWith({ cache, searchTvmaze }).showPool('the-block')
  assert.equal(searches, 1)
  assert.ok(cache.rows.has('wide-v1:art-pool:tvmaze-series-v2:block'))
})

test('recordingArt lists the guide image and the Plex episode thumb', async () => {
  const art = await poolWith().recordingArt('r1')
  assert.deepEqual(art.entries.map((entry) => [entry.source, entry.kind]), [['guide', 'episode'], ['plex', 'episode']])
  assert.equal(await poolWith().recordingArt('nope'), null)
})

test('imageFor resolves Plex origins with the current token', async () => {
  const image = await poolWith().imageFor({ origin: plexTranscodeOrigin('/ep'), width: 768 })
  assert.match(image.body.toString(), /^http:\/\/plex\/photo\/:\/transcode\?.*X-Plex-Token=t\|768$/)
})

test('recordingArt leaves out a guide image that no longer loads', async () => {
  const pool = poolWith({
    loadRecordingRow: async () => ({ recording_id: 'r2', file_path: null, image_url: 'imagecache/9' }),
    thumbnailFor: async () => null,
  })
  assert.deepEqual((await pool.recordingArt('r2')).entries, [])
})

const countingPlexItems = () => {
  const calls = { count: 0 }
  const plexItems = async () => {
    calls.count += 1
    return [{ ratingKey: '9', grandparentRatingKey: '5', thumb: '/ep', Media: [{ Part: [{ file: '/data/The Block/s01e01.ts' }] }] }]
  }
  return { calls, plexItems }
}

test('a restarted art pool serves the saved Plex art without listing Plex again', async () => {
  const poolStore = memoryCache()
  const first = countingPlexItems()
  const before = await poolWith({ poolStore, plexItems: first.plexItems }).showPool('the-block')
  const second = countingPlexItems()
  const after = await poolWith({ poolStore, plexItems: second.plexItems }).showPool('the-block')
  assert.equal(first.calls.count, 1)
  assert.equal(second.calls.count, 0)
  assert.deepEqual(after, before)
  assert.ok(poolStore.rows.get('wide-v1:show:the-block').expiresAt > Date.now() + 24 * 60 * 60 * 1000)
})

test('an expired saved pool is served at once and refreshed in the background', async () => {
  const poolStore = memoryCache()
  poolStore.rows.set('wide-v1:show:the-block', { value: { found: true, entries: [] }, expiresAt: 0 })
  const { calls, plexItems } = countingPlexItems()
  const pool = await poolWith({ poolStore, plexItems }).showPool('the-block')
  assert.deepEqual(pool.entries.map((entry) => entry.source), ['library', 'tvmaze', 'tvmaze'])
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(calls.count, 1)
  assert.equal(poolStore.rows.get('wide-v1:show:the-block').value.entries.length, 2)
})

test('a Plex failure keeps the saved pool and saves nothing new', async () => {
  const poolStore = memoryCache()
  const saved = { found: true, entries: [{ origin: 'plex:/old', kind: 'background', source: 'plex', selected: false }] }
  poolStore.rows.set('wide-v1:show:the-block', { value: saved, expiresAt: 0 })
  const failing = async () => { throw new Error('Plex HTTP 500') }
  await poolWith({ poolStore, plexItems: failing }).showPool('the-block')
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(poolStore.rows.get('wide-v1:show:the-block').value, saved)
  const fresh = memoryCache()
  const pool = await poolWith({ poolStore: fresh, plexItems: failing }).showPool('the-block')
  assert.deepEqual(pool.entries.map((entry) => entry.source), ['library', 'tvmaze'])
  assert.equal(fresh.rows.size, 0)
})

test('recording art is saved under a key that changes with the recording files', async () => {
  const poolStore = memoryCache()
  await poolWith({ poolStore }).recordingArt('r1')
  const [key] = poolStore.rows.keys()
  assert.match(key, /^wide-v1:recording:r1:[0-9a-f]{16}$/)
})

test('warmHomeArtPools loads each candidate show and recording in turn', async () => {
  const seen = []
  const artPool = {
    showPool: async (key) => seen.push(`show:${key}`),
    recordingArt: async (id) => {
      seen.push(`recording:${id}`)
      throw new Error('gone')
    },
  }
  const warmed = await warmHomeArtPools({ artPool, loadCandidates: async () => ({ showKeys: ['a', 'b'], recordingIds: ['r1'] }) })
  assert.deepEqual(seen, ['show:a', 'show:b', 'recording:r1'])
  assert.deepEqual(warmed, { shows: 2, recordings: 1 })
})

const responseRecorder = () => {
  const res = { statusCode: 200, headers: {}, body: null }
  res.setHeader = (name, value) => { res.headers[name.toLowerCase()] = value }
  res.status = (code) => {
    res.statusCode = code
    return res
  }
  res.json = (body) => { res.body = body }
  res.send = (body) => { res.body = body }
  res.end = () => {}
  return res
}

const recordingImageRoute = () => {
  const widths = []
  const route = serveImageRoute({
    missingMaxAgeS: 300,
    imageMaxAgeS: 86400,
    route: recordingImageRouteOf({
      loadOriginal: async (id) => (id === 'r1' ? { body: Buffer.from('jpeg'), contentType: 'image/jpeg' } : null),
      thumbnails: () => ({
        thumbnailFor: async ({ key, width, loadOriginal }) => {
          widths.push({ key, width })
          const original = await loadOriginal()
          return { body: Buffer.from(`${original.body}|${width}`), contentType: 'image/webp' }
        },
      }),
    }),
  })
  const call = async ({ id = 'r1', query = {} } = {}) => {
    const res = responseRecorder()
    await route({ params: { recording_id: id }, query }, res)
    return res
  }
  return { call, widths }
}

test('the recording image route resizes to an allowed width as webp', async () => {
  const { call, widths } = recordingImageRoute()
  const res = await call({ query: { w: '384' } })
  assert.equal(res.headers['content-type'], 'image/webp')
  assert.equal(res.headers['cache-control'], 'public, max-age=86400')
  assert.equal(res.body.toString(), 'jpeg|384')
  assert.equal(widths[0].key, `recording:r1:${contentKeyOf(Buffer.from('jpeg'))}`)
})

test('the recording image route keeps the original without w and rejects other widths', async () => {
  const { call, widths } = recordingImageRoute()
  const original = await call()
  assert.equal(original.headers['content-type'], 'image/jpeg')
  assert.equal(original.body.toString(), 'jpeg')
  assert.equal((await call({ query: { w: '500' } })).statusCode, 400)
  const missing = await call({ id: 'gone', query: { w: '192' } })
  assert.equal(missing.statusCode, 404)
  assert.equal(missing.headers['cache-control'], 'public, max-age=300')
  assert.equal(widths.length, 0)
})

test('tvmazePoolOf puts the widest background first so a tiny main picture never leads the hero', () => {
  const sized = (id, width, main = false) => ({ ...tvImage({ id, main }), resolutions: { original: { url: `https://tvmaze/${id}.jpg`, width, height: Math.round(width * 9 / 16) } } })
  const pool = tvmazePoolOf({ show: {}, images: [sized('tiny', 219, true), sized('full', 1920), sized('mid', 1280)] })
  assert.deepEqual(pool.map((entry) => entry.origin), ['https://tvmaze/full.jpg', 'https://tvmaze/mid.jpg', 'https://tvmaze/tiny.jpg'])
})

test('a pool saved before the wide picture sizes is served at once and saved again under the sized key', async () => {
  const poolStore = memoryCache()
  const old = { found: true, entries: [{ origin: 'plex:/old', kind: 'background', source: 'plex', selected: false }] }
  poolStore.rows.set('show:the-block', { value: old, expiresAt: Date.now() + 60_000 })
  const { calls, plexItems } = countingPlexItems()
  const pool = await poolWith({ poolStore, plexItems }).showPool('the-block')
  assert.ok(pool.entries.some((entry) => entry.origin === 'plex:/old'))
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(calls.count, 1)
  assert.match(poolStore.rows.get('wide-v1:show:the-block').value.entries[0].origin, /width=1920&height=1080/)
})
