import assert from 'node:assert/strict'
import test from 'node:test'

import { ArrError, arrConfigOf, createArrClient, pingArr, recycleBinOf } from '../src/arr-client.js'
import { arrSettingOf, buildManagerIndex, discoveryHostsOf, findArr } from '../src/arr-store.js'
import { arrBodyOf, arrPatchFrom } from '../src/arr-routes.js'
import { createCircuitBreaker } from '../src/outbound-http.js'
import { createImageCache, imageWidthFrom, wholeLibraryPatchFrom } from '../src/plex-library-routes.js'

const KEY = 'a'.repeat(32)

const fakeRequest = (replies) => {
  const calls = []
  const request = async (options) => {
    calls.push(options)
    const reply = replies.shift()
    if (reply instanceof Error) throw reply
    return reply
  }
  return { calls, request }
}

const client = (replies, patch = {}) => {
  const fake = fakeRequest(replies)
  return { fake, arr: createArrClient({ app: 'sonarr', url: 'http://nas:8989/', apiKey: KEY, request: fake.request, sleep: async () => {}, ...patch }) }
}

test('arr client: sends the key, times out, limits size, and never follows the key into a URL', async () => {
  const { fake, arr } = client([{ status: 200, data: { version: '4.0.15' } }])
  assert.deepEqual(await arr.status(), { version: '4.0.15' })
  const [call] = fake.calls
  assert.equal(call.url, 'http://nas:8989/api/v3/system/status')
  assert.equal(call.headers['X-Api-Key'], KEY)
  assert.equal(call.params, undefined)
  assert.ok(call.timeoutMs > 0 && call.maxBytes > 0)
})

test('arr client: a rejected key, a missing item, and a 409 are plain errors with no retry', async () => {
  const cases = [[401, 'key'], [404, 'missing'], [409, 'conflict']]
  for (const [status, kind] of cases) {
    const { fake, arr } = client([{ status, data: { message: 'Root folder missing' } }, { status: 200, data: {} }])
    await assert.rejects(arr.series(), (err) => err instanceof ArrError && err.kind === kind)
    assert.equal(fake.calls.length, 1)
  }
})

test('arr client: a read retries once; a write never retries; repeated failures open the breaker', async () => {
  const read = client([new Error('ECONNRESET'), { status: 200, data: [] }])
  assert.deepEqual(await read.arr.series(), [])
  assert.equal(read.fake.calls.length, 2)
  const write = client([{ status: 503 }, { status: 200 }])
  await assert.rejects(write.arr.deleteEpisodeFile(3))
  assert.equal(write.fake.calls.length, 1)
  assert.equal(write.fake.calls[0].method, 'delete')
  const breaker = createCircuitBreaker({ failureThreshold: 1, now: () => 0 })
  const down = client([{ status: 502 }, { status: 502 }], { breaker })
  await assert.rejects(down.arr.series())
  await assert.rejects(down.arr.series(), (err) => err.kind === 'backing-off')
})

test('arr client: unmonitor and series removal send the documented bodies', async () => {
  const { fake, arr } = client([{ status: 202, data: {} }, { status: 200, data: {} }, { status: 200, data: {} }])
  await arr.unmonitorEpisodes([1, 2])
  await arr.unmonitorMovies([9])
  await arr.deleteSeries(5)
  assert.deepEqual(fake.calls[0].data, { episodeIds: [1, 2], monitored: false })
  assert.equal(fake.calls[1].url, 'http://nas:8989/api/v3/movie/editor')
  assert.deepEqual(fake.calls[2].params, { deleteFiles: false, addImportListExclusion: true })
})

test('pingArr: true only for a 2xx /ping', async () => {
  assert.equal(await pingArr({ url: 'http://x:1', request: async () => ({ status: 200 }) }), true)
  assert.equal(await pingArr({ url: 'http://x:1', request: async () => ({ status: 401 }) }), false)
  assert.equal(await pingArr({ url: 'http://x:1', request: async () => { throw new Error('ECONNREFUSED') } }), false)
})

test('arrConfigOf and recycleBinOf: read the key, port, URL base, and the recycle bin', () => {
  const config = arrConfigOf(`<Config><Port>8989</Port><UrlBase>sonarr/</UrlBase><ApiKey>${KEY}</ApiKey></Config>`)
  assert.deepEqual(config, { apiKey: KEY, port: 8989, urlBase: '/sonarr' })
  assert.deepEqual(arrConfigOf('<Config></Config>'), { apiKey: null, port: null, urlBase: '' })
  assert.deepEqual(recycleBinOf({ recycleBin: '/data/recycle/sonarr', recycleBinCleanupDays: 7 }), { on: true, days: 7 })
  assert.deepEqual(recycleBinOf({ recycleBin: '' }), { on: false, days: null })
})

test('arrSettingOf: a saved key wins over config.xml; an environment-only key needs pasting', () => {
  assert.equal(arrSettingOf({ url: 'http://a/', savedKey: 'x', fileConfig: { apiKey: 'y' } }).keySource, 'saved')
  assert.equal(arrSettingOf({ url: '', savedKey: null, fileConfig: { apiKey: 'y' } }).keySource, 'config.xml')
  assert.deepEqual(arrSettingOf({ url: null, savedKey: null, fileConfig: { apiKey: null } }), { url: null, apiKey: null, keySource: null, configFound: true })
})

test('findArr: tries each host on the config port and reports whether a key is readable', async () => {
  const pinged = []
  const found = await findArr({
    hosts: ['192.168.86.254', 'localhost'],
    readConfig: async (app) => (app === 'sonarr' ? { apiKey: KEY, port: 8989, urlBase: '' } : null),
    ping: async ({ url }) => {
      pinged.push(url)
      return url === 'http://localhost:8989'
    },
  })
  assert.deepEqual(found.sonarr, { url: 'http://localhost:8989', keyFound: true })
  assert.deepEqual(found.radarr, { url: null, keyFound: false })
  assert.ok(pinged.includes('http://192.168.86.254:7878'))
  assert.deepEqual(discoveryHostsOf({ plexUrl: 'http://192.168.86.254:32400', tvhUrl: 'http://192.168.86.254:9981' })[0], '192.168.86.254')
})

test('buildManagerIndex: maps Sonarr episode files and Radarr movie files by path; nothing connected gives an empty index', async () => {
  const sonarr = { series: async () => [{ id: 3, path: '/data/media/tv/Show' }], episodeFiles: async () => [{ id: 11, relativePath: 'Season 01/x.mkv' }] }
  const radarr = { movies: async () => [{ id: 4, path: '/data/media/movies/Heat (1995)', movieFile: { id: 21, path: '/data/media/movies/Heat (1995)/Heat.mkv' } }, { id: 5, movieFile: null }] }
  const index = await buildManagerIndex({ settings: {}, clientFor: async (app) => ({ sonarr, radarr }[app]) })
  assert.deepEqual(index.get('/data/media/tv/Show/Season 01/x.mkv'), { manager: 'sonarr', path: '/data/media/tv/Show/Season 01/x.mkv', fileId: 11, itemId: null, seriesId: 3 })
  assert.equal(index.get('/data/media/movies/Heat (1995)/Heat.mkv').itemId, 4)
  assert.equal((await buildManagerIndex({ settings: {}, clientFor: async () => null })).size, 0)
})

test('arr routes: validate URLs and keys, and never send the key back', () => {
  assert.deepEqual(arrPatchFrom({ sonarr: { url: 'http://nas:8989/', api_key: KEY } }), { sonarr: { url: 'http://nas:8989', apiKey: KEY } })
  assert.ok(arrPatchFrom({ sonarr: { url: 'ftp://nas' } }).error)
  assert.ok(arrPatchFrom({ radarr: { api_key: 'short' } }).error)
  assert.ok(arrPatchFrom({ unmonitor_on_delete: 'yes' }).error)
  assert.ok(arrPatchFrom({}).error)
  const body = arrBodyOf({
    sonarr: { url: 'http://nas:8989', apiKey: KEY, keySource: 'config.xml', configFound: true },
    radarr: { url: null, apiKey: null, keySource: null, configFound: false },
    unmonitorOnDelete: true,
  })
  assert.equal(JSON.stringify(body).includes(KEY), false)
  assert.equal(body.sonarr.hasKey, true)
})

test('whole library routes: validate the switch and the library ids; images are sized and cached', async () => {
  assert.deepEqual(wholeLibraryPatchFrom({ enabled: false, section_ids: ['2', 1] }), { enabled: false, sectionIds: ['2', '1'] })
  assert.ok(wholeLibraryPatchFrom({ section_ids: ['../x'] }).error)
  assert.ok(wholeLibraryPatchFrom({}).error)
  assert.equal(imageWidthFrom('5000'), 384)
  assert.equal(imageWidthFrom('640'), 640)
  let loads = 0
  let clock = 0
  const cache = createImageCache({ maxEntries: 1, missMs: 10, now: () => clock })
  const load = async () => {
    loads += 1
    return null
  }
  await cache.get({ key: 'a', load })
  await cache.get({ key: 'a', load })
  clock = 11
  await cache.get({ key: 'a', load })
  assert.equal(loads, 2)
})
