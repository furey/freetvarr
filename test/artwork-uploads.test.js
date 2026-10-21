import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import sharp from 'sharp'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-artwork-uploads-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { createArtworkChoices } = await import('../src/artwork-choices.js')
const { candidateIdOf, createArtworkCandidates, mountArtworkChoiceRoutes } = await import('../src/artwork-choice-routes.js')
const {
  MAX_UPLOADS_PER_KIND, UploadRejected, createArtworkUploads, croppedSizeOf, prepareUpload, uploadPartsOf,
} = await import('../src/artwork-uploads.js')

const passThrough = (req, res, next) => next()
const uploadRoot = path.join(tmpDir, 'uploads')
let clock = 1_700_000_000_000
const uploads = createArtworkUploads({ root: uploadRoot, now: () => clock++ })
const memoryStore = { readAll: async () => [], write: async () => {}, remove: async () => {} }
const choices = createArtworkChoices({ store: memoryStore, now: () => 5000 })

let appServer
let baseUrl

const photoOf = ({ width, height, exif = undefined, orientation = undefined, format = 'jpeg' }) => {
  const image = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 80, b: 40 } } })
  const tagged = exif ? image.withExif(exif) : image
  return (orientation ? tagged.withMetadata({ orientation }) : tagged).toFormat(format).toBuffer()
}

const post = async (url, body, type = 'image/jpeg') => {
  const res = await fetch(`${baseUrl}${url}`, { method: 'POST', headers: { 'Content-Type': type }, body })
  return { status: res.status, body: await res.json() }
}

const call = async (method, url) => {
  const res = await fetch(`${baseUrl}${url}`, { method })
  const type = res.headers.get('content-type') || ''
  return { status: res.status, body: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) }
}

before(async () => {
  const app = express()
  app.use(express.json())
  mountArtworkChoiceRoutes({
    app,
    csrf: passThrough,
    readLimiter: passThrough,
    writeLimiter: passThrough,
    candidates: createArtworkCandidates({
      showSources: async (key) => (key === 'the-block' ? { title: 'The Block', rows: [] } : null),
      automaticSources: async () => ({ library: [], fallback: [], guide: [] }),
      plexUrl: async () => null,
      hasTmdbKey: async () => false,
    }),
    choices,
    uploads,
    loadImage: async ({ origin }) => uploads.read(origin),
  })
  appServer = app.listen(0)
  await new Promise((resolve) => appServer.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${appServer.address().port}`
})

after(async () => {
  appServer.close()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

test('croppedSizeOf keeps the aspect, caps the size, and never enlarges', () => {
  const background = { width: 1920, height: 1080 }
  const poster = { width: 1000, height: 1500 }
  assert.deepEqual(croppedSizeOf({ width: 4000, height: 3000, max: background }), { width: 1920, height: 1080 })
  assert.deepEqual(croppedSizeOf({ width: 1000, height: 2000, max: background }), { width: 1000, height: 563 })
  assert.deepEqual(croppedSizeOf({ width: 4000, height: 3000, max: poster }), { width: 1000, height: 1500 })
  assert.deepEqual(croppedSizeOf({ width: 300, height: 300, max: poster }), { width: 200, height: 300 })
})

test('prepareUpload crops a generated photo to 16:9 or 2:3 WebP', async () => {
  const body = await photoOf({ width: 3000, height: 2000 })
  const background = await sharp(await prepareUpload({ body, kind: 'background' })).metadata()
  assert.deepEqual([background.format, background.width, background.height], ['webp', 1920, 1080])
  const poster = await sharp(await prepareUpload({ body, kind: 'poster' })).metadata()
  assert.deepEqual([poster.format, poster.width, poster.height], ['webp', 1000, 1500])
})

test('prepareUpload turns the picture upright and strips EXIF and GPS', async () => {
  const exif = { IFD0: { Copyright: 'Someone' }, IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '33/1 52/1 0/1' } }
  const body = await photoOf({ width: 1600, height: 900, exif, orientation: 6 })
  const input = await sharp(body).metadata()
  assert.ok(input.exif)
  assert.equal(input.orientation, 6)
  const meta = await sharp(await prepareUpload({ body, kind: 'poster' })).metadata()
  assert.equal(meta.exif, undefined)
  assert.equal(meta.orientation, undefined)
  assert.deepEqual([meta.width, meta.height], [900, 1350])
})

test('prepareUpload rejects SVG, text, and other formats', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>')
  await assert.rejects(prepareUpload({ body: svg, kind: 'background' }), UploadRejected)
  await assert.rejects(prepareUpload({ body: Buffer.from('not a picture'), kind: 'background' }), UploadRejected)
  const gif = await photoOf({ width: 20, height: 20, format: 'gif' })
  await assert.rejects(prepareUpload({ body: gif, kind: 'poster' }), UploadRejected)
})

test('uploadPartsOf accepts only upload origins with a show key and a known file name', () => {
  assert.equal(uploadPartsOf('upload:the-block/poster-abc-0123abcd.webp').kind, 'poster')
  for (const bad of [
    'upload:../etc/poster-abc-0123abcd.webp',
    'upload:the-block/../poster-abc-0123abcd.webp',
    'upload:the-block/banner-abc-0123abcd.webp',
    'upload:The-Block/poster-abc-0123abcd.webp',
    'upload:the-block/poster-abc-0123abcd.svg',
    'https://evil.example/x.webp',
    null,
  ]) assert.equal(uploadPartsOf(bad), null, String(bad))
})

test('POST an upload saves it, picks it, and offers it as a candidate', async () => {
  const { status, body } = await post('/api/library/shows/the-block/artwork/background/uploads', await photoOf({ width: 2400, height: 1600 }))
  assert.equal(status, 201)
  assert.equal(body.candidate.source, 'upload')
  assert.equal(body.chosen, body.candidate.id)
  assert.equal(body.stamp, (5000).toString(36))
  const offer = await call('GET', '/api/library/shows/the-block/artwork-candidates')
  assert.equal(offer.body.chosen.background, body.chosen)
  assert.deepEqual(offer.body.candidates.map((c) => [c.source, c.kind]), [['upload', 'background']])
  assert.ok(!JSON.stringify(offer.body).includes('upload:'))
  const tile = await call('GET', `/api/library/shows/the-block/artwork-candidates/${body.chosen}?w=192`)
  assert.equal(tile.status, 200)
  assert.equal((await sharp(tile.body).metadata()).width, 1920)
})

test('POST an upload validates the show, kind, body, and size', async () => {
  const photo = await photoOf({ width: 400, height: 300 })
  assert.equal((await post('/api/library/shows/..%2Fetc/artwork/poster/uploads', photo)).status, 400)
  assert.equal((await post('/api/library/shows/the-block/artwork/banner/uploads', photo)).status, 400)
  assert.equal((await post('/api/library/shows/nothing/artwork/poster/uploads', photo)).status, 404)
  assert.equal((await post('/api/library/shows/the-block/artwork/poster/uploads', Buffer.alloc(0))).status, 400)
  const svg = await post('/api/library/shows/the-block/artwork/poster/uploads', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml')
  assert.equal(svg.status, 415)
  const oversize = await post('/api/library/shows/the-block/artwork/poster/uploads', Buffer.alloc(20 * 1024 * 1024 + 1))
  assert.equal(oversize.status, 413)
  assert.match(oversize.body.error, /20 MB/)
})

test('POST an upload stops at the per-kind limit', async () => {
  const photo = await photoOf({ width: 60, height: 90 })
  const kept = await uploads.list({ key: 'the-block', kind: 'poster' })
  for (let at = kept.length; at < MAX_UPLOADS_PER_KIND; at += 1) await uploads.save({ key: 'the-block', kind: 'poster', body: photo })
  assert.equal((await post('/api/library/shows/the-block/artwork/poster/uploads', photo)).status, 409)
  for (const upload of await uploads.list({ key: 'the-block', kind: 'poster' })) await uploads.remove(upload.origin)
})

test('DELETE an upload removes the file and falls back to automatic when it was the pick', async () => {
  const { body } = await post('/api/library/shows/the-block/artwork/poster/uploads', await photoOf({ width: 900, height: 900 }))
  const other = await post('/api/library/shows/the-block/artwork/poster/uploads', await photoOf({ width: 900, height: 900 }))
  const keep = await call('DELETE', `/api/library/shows/the-block/artwork/poster/uploads/${body.chosen}`)
  assert.equal(keep.status, 200)
  assert.equal(keep.body.chosen, other.body.chosen)
  const removed = await call('DELETE', `/api/library/shows/the-block/artwork/poster/uploads/${other.body.chosen}`)
  assert.deepEqual([removed.body.chosen, removed.body.stamp], [null, null])
  assert.equal(await choices.chosenFor({ key: 'the-block', kind: 'poster' }), null)
  assert.deepEqual(await uploads.list({ key: 'the-block', kind: 'poster' }), [])
  assert.equal((await call('DELETE', `/api/library/shows/the-block/artwork/poster/uploads/${other.body.chosen}`)).status, 404)
  assert.equal((await call('DELETE', '/api/library/shows/the-block/artwork/poster/uploads/not-an-id')).status, 400)
  const notUpload = candidateIdOf({ kind: 'poster', origin: 'https://static.tvmaze.com/p.jpg' })
  assert.equal((await call('DELETE', `/api/library/shows/the-block/artwork/poster/uploads/${notUpload}`)).status, 404)
})

test('the upload store ignores files that are not uploads', async () => {
  await fs.mkdir(path.join(uploadRoot, 'the-block'), { recursive: true })
  await fs.writeFile(path.join(uploadRoot, 'the-block', 'notes.txt'), 'x')
  await fs.writeFile(path.join(uploadRoot, 'the-block', 'poster-abc-0123abcd.webp.partial'), 'x')
  assert.deepEqual(await uploads.list({ key: 'the-block', kind: 'poster' }), [])
  assert.equal(await uploads.read('upload:the-block/poster-zzz-0123abcd.webp'), null)
})
