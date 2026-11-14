import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import sharp from 'sharp'

import { createProgrammeImages } from '../src/programme-images.js'

const JPEG = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 9, g: 9, b: 9 } } }).jpeg().toBuffer()
const CHANNEL = 'ch-9hd'

let tmpDir
let server
let base
let epg
let tvheadend
let db

const eventsGrid = () => {
  const start = Math.floor(Date.now() / 1000)
  const event = (eventId, image, offsetSeconds, title = `Programme ${eventId}`) => ({
    eventId,
    channelUuid: CHANNEL,
    title,
    start: start + offsetSeconds,
    stop: start + offsetSeconds + 60,
    ...(image ? { image } : {}),
  })
  return {
    entries: [
      event(101, `${base}/img/block.jpg`, 0),
      event(102, `${base}/img/page`, 1),
      event(103, `${base}/img/json`, 2),
      event(104, null, 3),
      event(105, `${base}/img/missing.jpg`, 4, 'Shared Show'),
      event(106, `${base}/img/block.jpg`, 5, 'Shared Show'),
      event(107, `${base}/img/814112_default_program_image.png`, 6, 'Big Brother'),
    ],
  }
}

const routes = {
  '/api/channel/grid': () => ({ json: { entries: [{ uuid: CHANNEL, name: '9HD Sydney', number: 9 }] } }),
  '/api/epggrab/channel/grid': () => ({ json: { entries: [] } }),
  '/api/epg/events/grid': () => ({ json: eventsGrid() }),
  '/img/block.jpg': () => ({ contentType: 'image/jpeg', body: JPEG }),
  '/img/814112_default_program_image.png': () => ({ contentType: 'image/jpeg', body: JPEG }),
  '/img/page': () => ({ contentType: 'text/html', body: '<html>not an image</html>' }),
  '/img/json': () => ({ contentType: 'application/json', body: '{"image":false}' }),
}

before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-images-'))
  process.env.DB_PATH = path.join(tmpDir, 'state.db')
  server = http.createServer((req, res) => {
    const route = routes[new URL(req.url, 'http://x').pathname]
    if (!route) {
      res.writeHead(404, { 'Content-Type': 'text/html' })
      return res.end('<html>404</html>')
    }
    const { json, contentType, body } = route()
    res.writeHead(200, { 'Content-Type': json ? 'application/json' : contentType })
    res.end(json ? JSON.stringify(json) : body)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  ;({ db } = await import('../src/db.js'))
  await db.migrate.latest()
  await db('settings').insert([
    { key: 'tvh_url', value: base },
    { key: 'show_artwork_lookup', value: 'false' },
  ])
  epg = await import('../src/epg.js')
  tvheadend = await import('../src/tvheadend.js')
})

after(async () => {
  await db.destroy()
  await new Promise((resolve) => server.close(resolve))
  await fs.rm(tmpDir, { recursive: true, force: true })
})

test('listEvents: keeps the XMLTV image URL on each event', async () => {
  const conn = { url: base, username: '', password: '' }
  const events = await tvheadend.listEvents({ startMs: 0, endMs: Infinity, conn })
  assert.equal(events.find((e) => e.program_id === 101).image, `${base}/img/block.jpg`)
  assert.equal(events.find((e) => e.program_id === 104).image, null)
})

test('getGuideDay: the browser payload carries has_image, never the image URL', async () => {
  const day = await epg.getGuideDay({ day: 0 })
  const programs = day.programs[CHANNEL]
  assert.deepEqual(programs.map((p) => [p.program_id, p.has_image]), [
    [101, true], [102, true], [103, true], [104, false], [105, true], [106, true], [107, true],
  ])
  assert.ok(!JSON.stringify(day).includes('/img/'))
  assert.ok(programs.every((p) => !('image' in p)))
})

test('searchGuide: results carry has_image without the image URL', async () => {
  const { results } = await epg.searchGuide({ q: 'programme 101' })
  assert.equal(results.length, 1)
  assert.equal(results[0].has_image, true)
  assert.ok(!('image' in results[0]))
})

test('recordingPictureFor: a recording saves the picture of its airing', async () => {
  const { image, settled } = await epg.recordingPictureFor({ eventId: '101' })
  assert.equal(image.contentType, 'image/jpeg')
  assert.deepEqual(image.body, JPEG)
  assert.equal(settled, true)
})

test('recordingPictureFor: unknown and imageless airings save no picture, and are not asked again', async () => {
  assert.deepEqual(await epg.recordingPictureFor({ eventId: '999' }), { image: null, settled: false, deferred: false, slowHost: false })
  assert.deepEqual(await epg.recordingPictureFor({ eventId: '104' }), { image: null, settled: true, deferred: false, slowHost: false })
})

test('recordingPictureFor: an upstream answer that is not an image is no picture', async () => {
  assert.equal((await epg.recordingPictureFor({ eventId: '102' })).image, null)
  assert.equal((await epg.recordingPictureFor({ eventId: '103' })).image, null)
})

test('recordingPictureFor: a dead image link saves no picture of another airing; the guide cell still shows one live', async () => {
  const { image } = await epg.recordingPictureFor({ eventId: '105' })
  assert.equal(image, null)
  const thumbnail = await epg.getProgrammeThumbnail({ eventId: '105', width: 192 })
  assert.equal(thumbnail.contentType, 'image/webp')
})

test('recordingPictureFor: a stand-in picture is never saved for a recording', async () => {
  assert.deepEqual(await epg.recordingPictureFor({ eventId: '107' }), { image: null, settled: true, deferred: false, slowHost: false })
  assert.deepEqual(await epg.recordingPictureFor({ title: 'Big Brother', source: `${base}/img/814112_default_program_image.png` }), { image: null, settled: true, deferred: false, slowHost: false })
})

test('recordingPictureFor: a TVHeadend entry gone from the guide uses its own image and title', async () => {
  const { image, settled } = await epg.recordingPictureFor({ eventId: '5555', title: 'Old Show', source: `${base}/img/block.jpg` })
  assert.deepEqual(image.body, JPEG)
  assert.equal(settled, true)
})

test('saveRecordingPicture: saves a settled picture, asks again for an unsettled one, and saves it on the last attempt', async () => {
  const saved = []
  const save = async ({ id }) => saved.push(id)
  const picture = { body: JPEG, contentType: 'image/jpeg' }
  const outcomeOf = (found, lastAttempt = false) => epg.saveRecordingPicture({ recordingId: `r${saved.length}`, lastAttempt, findPicture: async () => found, save })
  assert.equal(await outcomeOf({ image: picture, settled: true }), 'saved')
  assert.equal(await outcomeOf({ image: picture, settled: false }), 'retry')
  assert.equal(await outcomeOf({ image: picture, settled: false }, true), 'saved')
  assert.equal(await outcomeOf({ image: null, settled: true }), 'missed')
  assert.equal(await outcomeOf({ image: null, settled: false }), 'retry')
  assert.equal(await outcomeOf({ image: null, settled: false }, true), 'missed')
  assert.equal(await epg.saveRecordingPicture({ recordingId: 'boom', findPicture: async () => { throw new Error('down') }, save }), 'retry')
  assert.equal(await outcomeOf({ image: null, settled: false, deferred: true }), 'deferred')
  assert.equal(await outcomeOf({ image: null, settled: false, deferred: true }, true), 'deferred')
  assert.deepEqual(saved, ['r0', 'r1'])
})

test('createRecordingPictureRun: a host that times out is skipped for the rest of the run, without counting as a try', async () => {
  const loads = []
  const run = epg.createRecordingPictureRun({
    loadTimeoutMs: 20,
    load: (origin) => {
      loads.push(origin)
      return origin.includes('slow.example') ? new Promise(() => {}) : Promise.resolve({ body: JPEG })
    },
  })
  await assert.rejects(run.load('https://slow.example/a.jpg'), /did not answer/)
  const startedAt = Date.now()
  await assert.rejects(run.load('https://slow.example/b.jpg'), (error) => error.code === 'skipped-host')
  assert.ok(Date.now() - startedAt < 15)
  assert.deepEqual((await run.load('https://fast.example/c.jpg')).body, JPEG)
  assert.deepEqual(loads, ['https://slow.example/a.jpg', 'https://fast.example/c.jpg'])
  const skipped = await epg.recordingPictureFor({ eventId: '101', run: epg.createRecordingPictureRun({ load: async () => { throw Object.assign(new Error('recent'), { code: 'recent-failure' }) } }) })
  assert.deepEqual(skipped, { image: null, settled: false, deferred: true, slowHost: false })
})

test('saveRecordingPicture: one slow TVHeadend image host does not hold back 20 recordings whose Freeview pictures load', async () => {
  const imagecacheLoads = []
  const run = epg.createRecordingPictureRun({
    loadTimeoutMs: 30,
    load: (origin) => {
      if (!origin.startsWith('imagecache/')) return Promise.resolve({ body: JPEG, contentType: 'image/jpeg' })
      imagecacheLoads.push(origin)
      return new Promise(() => {})
    },
  })
  const { createArtResolver } = await import('../src/art-resolver.js')
  const resolver = createArtResolver({
    stages: {
      own: async ({ ownSource }) => ({ sources: [ownSource] }),
      'freeview-show': async ({ title }) => ({ sources: [`guide-picture:fv-${title}`] }),
    },
    store: { read: async () => null, write: async () => {}, markDue: async () => [], stamped: async () => [] },
    followUpDelaysMs: [],
  })
  const saved = []
  const startedAt = Date.now()
  const outcomes = []
  for (let n = 0; n < 20; n += 1) {
    outcomes.push(await epg.saveRecordingPicture({
      recordingId: `slow-${n}`,
      title: `Show ${n}`,
      source: `imagecache/${n}`,
      run,
      resolver,
      save: async ({ id }) => saved.push(id),
    }))
  }
  assert.deepEqual(outcomes, Array(20).fill('saved'))
  assert.equal(saved.length, 20)
  assert.deepEqual(imagecacheLoads, ['imagecache/0'])
  assert.ok(Date.now() - startedAt < 1000)
})

test('getProgrammeThumbnail: unknown and imageless events give nothing; a known image comes back as a WebP thumbnail', async () => {
  assert.equal(await epg.getProgrammeThumbnail({ eventId: '999', width: 192 }), null)
  assert.equal(await epg.getProgrammeThumbnail({ eventId: '104', width: 192 }), null)
  assert.equal((await epg.findProgrammeThumbnail({ eventId: '104', width: 192 })).final, true)
  const image = await epg.getProgrammeThumbnail({ eventId: '101', width: 192 })
  assert.equal(image.contentType, 'image/webp')
})

test('createProgrammeImages: evicts the least recently used image past the entry limit', async () => {
  const fetched = []
  const images = createProgrammeImages({
    maxEntries: 2,
    fetchImage: async (source) => {
      fetched.push(source)
      return { body: Buffer.alloc(10), contentType: 'image/jpeg' }
    },
  })
  await images.imageFor('a')
  await images.imageFor('b')
  await images.imageFor('a')
  await images.imageFor('c')
  assert.deepEqual(images.stats(), { entries: 2, bytes: 20, misses: 0, failures: 0 })
  await images.imageFor('a')
  await images.imageFor('b')
  assert.deepEqual(fetched, ['a', 'b', 'c', 'b'])
})

test('createProgrammeImages: stays under the byte limit and skips an image larger than it', async () => {
  const sizes = { small: 40, medium: 50, huge: 200 }
  const images = createProgrammeImages({
    maxBytes: 100,
    fetchImage: async (source) => ({ body: Buffer.alloc(sizes[source]), contentType: 'image/jpeg' }),
  })
  await images.imageFor('small')
  await images.imageFor('medium')
  assert.deepEqual(images.stats(), { entries: 2, bytes: 90, misses: 0, failures: 0 })
  const huge = await images.imageFor('huge')
  assert.equal(huge.body.length, 200)
  assert.deepEqual(images.stats(), { entries: 2, bytes: 90, misses: 0, failures: 0 })
  sizes.large = 70
  await images.imageFor('large')
  assert.deepEqual(images.stats(), { entries: 1, bytes: 70, misses: 0, failures: 0 })
})

test('createProgrammeImages: shares one fetch between concurrent requests', async () => {
  let calls = 0
  const images = createProgrammeImages({
    fetchImage: async () => {
      calls += 1
      return { body: Buffer.alloc(1), contentType: 'image/png' }
    },
  })
  const [first, second] = await Promise.all([images.imageFor('x'), images.imageFor('x')])
  assert.equal(first, second)
  assert.equal(calls, 1)
  assert.equal(await images.imageFor(null), null)
})

test('createProgrammeImages: remembers a miss until it expires, then asks upstream again', async () => {
  let clock = 1_000
  let calls = 0
  const images = createProgrammeImages({
    missTtlMs: 500,
    now: () => clock,
    fetchImage: async () => {
      calls += 1
      return calls === 1 ? null : { body: Buffer.alloc(1), contentType: 'image/png' }
    },
  })
  assert.equal(await images.imageFor('x'), null)
  assert.equal(await images.imageFor('x'), null)
  assert.equal(calls, 1)
  assert.equal(images.stats().misses, 1)
  clock += 500
  assert.equal((await images.imageFor('x')).contentType, 'image/png')
  assert.equal(calls, 2)
  assert.equal(images.stats().misses, 0)
})

test('createProgrammeImages: a failed fetch is kept apart from a miss, waits out a short backoff, and both lists stay bounded', async () => {
  let clock = 0
  let calls = 0
  const images = createProgrammeImages({
    maxMisses: 2,
    now: () => clock,
    fetchImage: async () => { calls += 1; throw new Error('upstream down') },
  })
  await images.imageFor('a')
  await images.imageFor('b')
  await images.imageFor('c')
  assert.deepEqual([images.stats().misses, images.stats().failures], [0, 2])
  await assert.rejects(images.imageOrErrorFor('c'))
  assert.equal(calls, 3)
  clock += 61 * 1000
  await assert.rejects(images.imageOrErrorFor('c'))
  assert.equal(calls, 4)
})

test('onGuideLoaded: tells listeners once the guide has loaded', async () => {
  const loaded = []
  const stop = epg.onGuideLoaded((guide) => loaded.push(guide.channels.length))
  epg.clearGuideCache()
  await epg.getGuideSnapshot()
  await new Promise((resolve) => setImmediate(resolve))
  stop()
  assert.deepEqual(loaded, [1])
})
