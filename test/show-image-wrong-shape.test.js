import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import sharp from 'sharp'

const jpegOf = async ({ width, height }) => sharp({ create: { width, height, channels: 3, background: { r: 60, g: 40, b: 20 } } }).jpeg().toBuffer()

const PORTRAIT = await jpegOf({ width: 200, height: 300 })
const LANDSCAPE = await jpegOf({ width: 320, height: 180 })
const CHANNEL = 'ch-1'

let tmpDir
let server
let base
let epg
let db
const requested = []

const routes = {
  '/api/channel/grid': () => ({ json: { entries: [{ uuid: CHANNEL, name: 'Channel One', number: 1 }] } }),
  '/api/epggrab/channel/grid': () => ({ json: { entries: [] } }),
  '/api/epg/events/grid': () => ({
    json: {
      entries: [{
        eventId: 301,
        channelUuid: CHANNEL,
        title: 'Obsession',
        start: Math.floor(Date.now() / 1000) + 3600,
        stop: Math.floor(Date.now() / 1000) + 9000,
        image: `${base}/guide/obsession.jpg`,
      }],
    },
  }),
  '/guide/obsession.jpg': () => ({ contentType: 'image/jpeg', body: PORTRAIT }),
  '/library/sections/2/all': () => ({ json: { MediaContainer: { Metadata: [{ title: 'Obsession', art: '/library/metadata/9/art/1', thumb: '/library/metadata/9/thumb/1' }] } } }),
  '/photo/:/transcode': () => ({ contentType: 'image/jpeg', body: LANDSCAPE }),
}

before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-wrong-shape-'))
  process.env.DB_PATH = path.join(tmpDir, 'state.db')
  server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://x')
    requested.push(pathname)
    const route = routes[pathname]
    if (!route) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      return res.end('missing')
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
    { key: 'plex_url', value: base },
    { key: 'plex_token', value: 'secret' },
    { key: 'plex_movies_section_id', value: '2' },
    { key: 'show_artwork_lookup', value: 'false' },
  ])
  epg = await import('../src/epg.js')
})

after(async () => {
  await db.destroy()
  await new Promise((resolve) => server.close(resolve))
  await fs.rm(tmpDir, { recursive: true, force: true })
})

test('a film whose Plex pictures are all landscape goes on down the chain for a poster', async () => {
  const found = await epg.findShowPoster({ title: 'Obsession', width: 192, kind: 'movie' })
  assert.ok(requested.includes('/photo/:/transcode'))
  assert.ok(requested.includes('/guide/obsession.jpg'))
  assert.equal(found.pending, false)
  assert.equal(found.image.contentType, 'image/webp')
})
