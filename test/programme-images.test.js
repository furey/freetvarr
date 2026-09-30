import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { createProgrammeImages } from '../src/programme-images.js'

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const CHANNEL = 'ch-9hd'

let tmpDir
let server
let base
let epg
let tvheadend
let db

const eventsGrid = () => {
  const start = Math.floor(Date.now() / 1000)
  const event = (eventId, image, offsetMinutes) => ({
    eventId,
    channelUuid: CHANNEL,
    title: `Programme ${eventId}`,
    start: start + offsetMinutes * 60,
    stop: start + (offsetMinutes + 1) * 60,
    ...(image ? { image } : {}),
  })
  return {
    entries: [
      event(101, `${base}/img/block.jpg`, 0),
      event(102, `${base}/img/page`, 1),
      event(103, `${base}/img/json`, 2),
      event(104, null, 3),
    ],
  }
}

const routes = {
  '/api/channel/grid': () => ({ json: { entries: [{ uuid: CHANNEL, name: '9HD Sydney', number: 9 }] } }),
  '/api/epggrab/channel/grid': () => ({ json: { entries: [] } }),
  '/api/epg/events/grid': () => ({ json: eventsGrid() }),
  '/img/block.jpg': () => ({ contentType: 'image/jpeg', body: JPEG }),
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
  await db('settings').insert({ key: 'tvh_url', value: base })
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
    [101, true], [102, true], [103, true], [104, false],
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

test('getProgrammeImage: serves the image of a known event', async () => {
  const image = await epg.getProgrammeImage({ eventId: '101' })
  assert.equal(image.contentType, 'image/jpeg')
  assert.deepEqual(image.body, JPEG)
})

test('getProgrammeImage: unknown and imageless events resolve to nothing (the route answers 404)', async () => {
  assert.equal(await epg.getProgrammeImage({ eventId: '999' }), null)
  assert.equal(await epg.getProgrammeImage({ eventId: '104' }), null)
})

test('getProgrammeImage: rejects an upstream answer that is not an image', async () => {
  assert.equal(await epg.getProgrammeImage({ eventId: '102' }), null)
  assert.equal(await epg.getProgrammeImage({ eventId: '103' }), null)
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
  assert.deepEqual(images.stats(), { entries: 2, bytes: 20 })
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
  assert.deepEqual(images.stats(), { entries: 2, bytes: 90 })
  const huge = await images.imageFor('huge')
  assert.equal(huge.body.length, 200)
  assert.deepEqual(images.stats(), { entries: 2, bytes: 90 })
  sizes.large = 70
  await images.imageFor('large')
  assert.deepEqual(images.stats(), { entries: 1, bytes: 70 })
})

test('createProgrammeImages: shares one fetch between concurrent requests and caches no failure', async () => {
  let calls = 0
  const images = createProgrammeImages({
    fetchImage: async () => {
      calls += 1
      return calls === 1 ? null : { body: Buffer.alloc(1), contentType: 'image/png' }
    },
  })
  const [first, second] = await Promise.all([images.imageFor('x'), images.imageFor('x')])
  assert.equal(first, null)
  assert.equal(second, null)
  assert.equal(calls, 1)
  assert.equal((await images.imageFor('x')).contentType, 'image/png')
  assert.equal(await images.imageFor(null), null)
})
