import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import sharp from 'sharp'

const jpegOf = async ({ width, height }) => sharp({ create: { width, height, channels: 3, background: { r: 20, g: 40, b: 60 } } }).jpeg().toBuffer()

const PORTRAIT = await jpegOf({ width: 400, height: 600 })
const OVERSIZED = Buffer.concat([PORTRAIT, Buffer.alloc(5 * 1024 * 1024)])
const LANDSCAPE = await jpegOf({ width: 1280, height: 720 })
const CHANNEL = 'ch-1'

let tmpDir
let server
let base
let epg
let db
const requested = []
const outbound = []

const routes = {
  '/api/channel/grid': () => ({ json: { entries: [{ uuid: CHANNEL, name: 'Channel One', number: 1 }] } }),
  '/api/epggrab/channel/grid': () => ({ json: { entries: [] } }),
  '/api/epg/events/grid': () => ({ json: { entries: [] } }),
  '/library/sections/2/all': () => ({ json: { MediaContainer: { Metadata: [{ title: 'Dune', art: '/library/metadata/7/art/1', thumb: '/library/metadata/7/thumb/1' }] } } }),
  '/library/metadata/7/art/1': () => ({ contentType: 'image/jpeg', body: LANDSCAPE }),
  '/library/metadata/7/thumb/1': () => ({ contentType: 'image/jpeg', body: OVERSIZED }),
  '/photo/:/transcode': (params) => ({ contentType: 'image/jpeg', body: params.get('url').includes('/thumb/') ? PORTRAIT : LANDSCAPE }),
}

const recordOutbound = () => {
  const connect = net.Socket.prototype.connect
  net.Socket.prototype.connect = function recorded(...args) {
    const [first] = args
    const host = first && typeof first === 'object' ? first.host : args[1]
    if (host && !/^(127\.|localhost$|::1$)/.test(String(host))) outbound.push(host)
    return connect.apply(this, args)
  }
}

before(async () => {
  recordOutbound()
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-local-art-'))
  process.env.DB_PATH = path.join(tmpDir, 'state.db')
  server = http.createServer((req, res) => {
    const { pathname, searchParams } = new URL(req.url, 'http://x')
    requested.push(searchParams.get('url') || pathname)
    const route = routes[pathname]
    if (!route) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      return res.end('missing')
    }
    const { json, contentType, body } = route(searchParams)
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
    { key: 'show_artwork_lookup', value: 'true' },
    { key: 'tmdb_api_key', value: 'key' },
  ])
  const { saveArtwork } = await import('../src/artwork.js')
  const imagePath = await saveArtwork({ kind: 'recording', id: 'rec-1', image: { body: LANDSCAPE, contentType: 'image/jpeg' } })
  await db('recordings').insert({ recording_id: 'rec-1', title: 'Garden Rescue', status: 'done', image_path: imagePath, aired_at: 1 })
  epg = await import('../src/epg.js')
})

after(async () => {
  await db.destroy()
  await new Promise((resolve) => server.close(resolve))
  await fs.rm(tmpDir, { recursive: true, force: true })
})

test('a film with kind=movie still gets its Plex poster, thumb first and resized by Plex past the 4 MB original, with no web request', async () => {
  const found = await epg.findShowPoster({ title: 'Dune', width: 192, kind: 'movie' })
  assert.equal(found.pending, false)
  assert.equal(found.image.contentType, 'image/webp')
  assert.ok(requested.includes('/library/metadata/7/thumb/1'))
  assert.equal(requested.includes('/library/metadata/7/art/1'), false)
  assert.deepEqual(outbound, [])
})

test('a film with kind=movie gets its Plex background art with no web request', async () => {
  const found = await epg.findShowThumbnail({ title: 'Dune', width: 192, kind: 'movie' })
  assert.equal(found.pending, false)
  assert.equal(found.image.contentType, 'image/webp')
  assert.ok(requested.includes('/library/metadata/7/art/1'))
  assert.deepEqual(outbound, [])
})

test('plexResizedSourceOf: a Plex library picture goes through the Plex photo transcoder; other sources stay as they are', () => {
  const resized = new URL(epg.plexResizedSourceOf('http://plex:32400/library/metadata/5/thumb/9?X-Plex-Token=a%20b'))
  assert.equal(resized.pathname, '/photo/:/transcode')
  assert.equal(resized.searchParams.get('url'), '/library/metadata/5/thumb/9')
  assert.equal(resized.searchParams.get('width'), '1920')
  assert.equal(resized.searchParams.get('X-Plex-Token'), 'a b')
  assert.equal(epg.plexResizedSourceOf('https://image.tmdb.org/t/p/w780/a.jpg'), 'https://image.tmdb.org/t/p/w780/a.jpg')
  assert.equal(epg.plexResizedSourceOf('http://plex:32400/library/metadata/5/thumb/9'), 'http://plex:32400/library/metadata/5/thumb/9')
})

test('a series with a recording picture and no Plex entry uses the recording picture with no web request', async () => {
  const found = await epg.findShowThumbnail({ title: 'Garden Rescue', width: 192 })
  assert.equal(found.pending, false)
  assert.equal(found.image.contentType, 'image/webp')
  assert.deepEqual(outbound, [])
})

test('art_resolutions never holds a Plex token, and a Plex source from another server is skipped', async () => {
  const origins = (await db('art_resolutions').select('origin')).map((row) => row.origin)
  assert.ok(origins.includes('plex:/library/metadata/7/thumb/1'))
  assert.equal(origins.some((origin) => /X-Plex-Token/i.test(origin ?? '')), false)
  assert.equal(epg.plexOriginOf({ source: 'http://other:32400/library/metadata/1/art?X-Plex-Token=t', url: base }), null)
  assert.equal(epg.plexOriginOf({ source: `${base}/library/metadata/1/art?X-Plex-Token=t`, url: base }), 'plex:/library/metadata/1/art')
})

test('a picture whose resize runs past the request budget tells the art feed when it is ready', async () => {
  const published = []
  const publish = (change) => published.push(change)
  await epg.publishWhenRendered({ rendering: Promise.resolve({ body: Buffer.from('x') }), title: 'Muster Dogs', shape: 'poster', publish })
  await epg.publishWhenRendered({ rendering: Promise.resolve(null), title: 'Gruen', shape: 'landscape', publish })
  assert.deepEqual(published, [{ key: 'muster-dogs', kind: 'poster', stamp: null }])
})
