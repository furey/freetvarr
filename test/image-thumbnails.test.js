import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

import {
  createThumbnailStore,
  imageCacheBytesFrom,
  resizeToWebp,
  thumbnailWidthFrom,
  heroWidthFrom,
  HERO_IMAGE_WIDTHS,
  PROGRAMME_IMAGE_WIDTHS,
  createRenderQueue,
  landscapeOf,
} from '../src/image-thumbnails.js'
import { sourceImageTypeOf } from '../src/raster-type.js'

const MB = 1024 * 1024
const ORIGINAL = { body: Buffer.from('original'), contentType: 'image/png' }
const fakeResize = async ({ width }) => ({ body: Buffer.alloc(width), contentType: 'image/webp' })

let dir

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-thumbs-'))
})

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

const countingLoader = (image = ORIGINAL) => {
  const loader = async () => {
    loader.calls += 1
    return image
  }
  loader.calls = 0
  return loader
}

const cachedFiles = async () => (await fs.readdir(dir)).sort()

const pngOf = ({ width, height }) =>
  sharp({ create: { width, height, channels: 3, background: '#336699' } }).png().toBuffer()

test('thumbnailWidthFrom: accepts only the allowed widths and defaults to the largest', () => {
  assert.equal(thumbnailWidthFrom({ requested: undefined, allowed: PROGRAMME_IMAGE_WIDTHS }), 768)
  assert.equal(thumbnailWidthFrom({ requested: '192', allowed: PROGRAMME_IMAGE_WIDTHS }), 192)
  assert.equal(thumbnailWidthFrom({ requested: '384', allowed: PROGRAMME_IMAGE_WIDTHS }), 384)
  for (const requested of ['100', '192px', '', ' 192', '1e3', '0x60']) {
    assert.equal(thumbnailWidthFrom({ requested, allowed: PROGRAMME_IMAGE_WIDTHS }), null, requested)
  }
  assert.equal(thumbnailWidthFrom({ requested: ['192', '384'], allowed: PROGRAMME_IMAGE_WIDTHS }), null)
})

test('imageCacheBytesFrom: reads megabytes and falls back to 100 MB on a missing or bad value', () => {
  assert.equal(imageCacheBytesFrom(undefined), 100 * MB)
  assert.equal(imageCacheBytesFrom(''), 100 * MB)
  assert.equal(imageCacheBytesFrom('abc'), 100 * MB)
  assert.equal(imageCacheBytesFrom('-5'), 100 * MB)
  assert.equal(imageCacheBytesFrom('250'), 250 * MB)
  assert.equal(imageCacheBytesFrom('0'), 0)
})

test('resizeToWebp: shrinks to the width, keeps the aspect ratio, and never enlarges', async () => {
  const large = await resizeToWebp({ body: await pngOf({ width: 910, height: 512 }), width: 192 })
  assert.equal(large.contentType, 'image/webp')
  assert.deepEqual(await sharp(large.body).metadata().then(({ format, width, height }) => ({ format, width, height })),
    { format: 'webp', width: 192, height: 108 })
  const small = await resizeToWebp({ body: await pngOf({ width: 120, height: 60 }), width: 384 })
  assert.equal((await sharp(small.body).metadata()).width, 120)
})

test('createThumbnailStore: writes a thumbnail to disk and serves it again without the original', async () => {
  const store = createThumbnailStore({ dir, resize: fakeResize })
  const loadOriginal = countingLoader()
  const first = await store.thumbnailFor({ key: 'programme:a', width: 192, loadOriginal })
  const second = await store.thumbnailFor({ key: 'programme:a', width: 192, loadOriginal })
  assert.equal(first.body.length, 192)
  assert.deepEqual(second, { body: Buffer.alloc(192), contentType: 'image/webp' })
  assert.equal(loadOriginal.calls, 1)
  assert.equal((await cachedFiles()).length, 1)
  assert.deepEqual(store.stats(), { files: 1, bytes: 192 })
})

test('createThumbnailStore: keeps each width as its own file', async () => {
  const store = createThumbnailStore({ dir, resize: fakeResize })
  await store.thumbnailFor({ key: 'programme:a', width: 192, loadOriginal: countingLoader() })
  await store.thumbnailFor({ key: 'programme:a', width: 384, loadOriginal: countingLoader() })
  assert.deepEqual(store.stats(), { files: 2, bytes: 576 })
})

test('createThumbnailStore: evicts the least recently used thumbnail past the byte cap', async () => {
  const store = createThumbnailStore({ dir, maxBytes: 250, resize: fakeResize })
  const loaders = { a: countingLoader(), b: countingLoader(), c: countingLoader() }
  const thumbnailOf = (key) => store.thumbnailFor({ key, width: 100, loadOriginal: loaders[key] })
  await thumbnailOf('a')
  await thumbnailOf('b')
  await thumbnailOf('a')
  await thumbnailOf('c')
  assert.deepEqual(store.stats(), { files: 2, bytes: 200 })
  assert.equal((await cachedFiles()).length, 2)
  await thumbnailOf('a')
  await thumbnailOf('c')
  assert.deepEqual([loaders.a.calls, loaders.c.calls], [1, 1])
  await thumbnailOf('b')
  assert.equal(loaders.b.calls, 2)
})

test('createThumbnailStore: on startup indexes old files by modified time and prunes to the cap', async () => {
  const seed = async (name, bytes, mtimeSeconds) => {
    await fs.writeFile(path.join(dir, name), Buffer.alloc(bytes))
    await fs.utimes(path.join(dir, name), mtimeSeconds, mtimeSeconds)
  }
  const oldest = `${'a'.repeat(64)}.webp`
  const middle = `${'b'.repeat(64)}.webp`
  const newest = `${'c'.repeat(64)}.webp`
  await seed(middle, 100, 2_000)
  await seed(oldest, 100, 1_000)
  await seed(newest, 100, 3_000)
  await seed(`${'d'.repeat(64)}.webp.123.partial`, 50, 3_000)
  await seed('notes.txt', 10, 1_000)
  const store = createThumbnailStore({ dir, maxBytes: 250, resize: fakeResize })
  await store.prepare()
  assert.deepEqual(await cachedFiles(), [middle, newest, 'notes.txt'].sort())
  assert.deepEqual(store.stats(), { files: 2, bytes: 200 })
})

test('createThumbnailStore: a missing original gives nothing and writes nothing', async () => {
  const store = createThumbnailStore({ dir, resize: fakeResize })
  const thumbnail = await store.thumbnailFor({ key: 'programme:x', width: 192, loadOriginal: async () => null })
  assert.equal(thumbnail, null)
  assert.deepEqual(await cachedFiles(), [])
})

test('createThumbnailStore: gives no image when resizing fails, uncached, and skips the original for a while', async () => {
  let clock = 1000
  const store = createThumbnailStore({ dir, resize: async () => { throw new Error('corrupt') }, now: () => clock })
  const loadOriginal = countingLoader()
  assert.equal(await store.thumbnailFor({ key: 'channel:1', width: 96, loadOriginal }), null)
  assert.equal(await store.thumbnailFor({ key: 'channel:1', width: 96, loadOriginal }), null)
  assert.equal(loadOriginal.calls, 1)
  clock += 11 * 60 * 1000
  assert.equal(await store.thumbnailFor({ key: 'channel:1', width: 96, loadOriginal }), null)
  assert.equal(loadOriginal.calls, 2)
  assert.deepEqual(await cachedFiles(), [])
})

test('createThumbnailStore: renders an SVG original to a WebP thumbnail at the requested width', async () => {
  const store = createThumbnailStore({ dir })
  const svg = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="32" height="16"><rect width="32" height="16" fill="#c00"/></svg>')
  const thumbnail = await store.thumbnailFor({ key: 'channel:svg', width: 96, loadOriginal: countingLoader({ body: svg, contentType: 'image/svg+xml' }) })
  assert.equal(thumbnail.contentType, 'image/webp')
  const { format, width, height } = await sharp(thumbnail.body).metadata()
  assert.deepEqual({ format, width, height }, { format: 'webp', width: 96, height: 48 })
})

const FILTER_SVGS = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><filter id="b"><feGaussianBlur stdDeviation="9"/></filter><rect width="40" height="20" filter="url(#b)"/></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><svg:FILTER id="b"/><rect width="40" height="20"/></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" style="filter: blur(9px)"/></svg>',
]

test('createThumbnailStore: refuses an SVG with a filter without rendering it', async () => {
  let renders = 0
  const store = createThumbnailStore({ dir, rasterize: async () => { renders += 1; return { body: Buffer.alloc(1), contentType: 'image/webp' } } })
  for (const [at, text] of FILTER_SVGS.entries()) {
    const thumbnail = await store.thumbnailFor({ key: `channel:filter-${at}`, width: 96, loadOriginal: countingLoader({ body: Buffer.from(text), contentType: 'image/svg+xml' }) })
    assert.equal(thumbnail, null, text)
    assert.equal(sourceImageTypeOf(Buffer.from(text)), null, text)
  }
  assert.equal(renders, 0)
})

test('createThumbnailStore: never hands an SVG it cannot vouch for to the raster resize', async () => {
  let resizes = 0
  const store = createThumbnailStore({ dir, resize: async () => { resizes += 1; return { body: Buffer.alloc(1), contentType: 'image/webp' } } })
  const entity = Buffer.from('<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "aaaa">]><svg xmlns="http://www.w3.org/2000/svg" width="4" height="4">&a;</svg>')
  assert.equal(await store.thumbnailFor({ key: 'channel:entity', width: 96, loadOriginal: countingLoader({ body: entity, contentType: 'image/svg+xml' }) }), null)
  assert.equal(resizes, 0)
})

test('createThumbnailStore: renders one SVG at a time', async () => {
  const events = []
  const releases = []
  const rasterize = ({ width }) => new Promise((resolve) => {
    events.push(`start ${width}`)
    releases.push(() => {
      events.push(`end ${width}`)
      resolve({ body: Buffer.alloc(width), contentType: 'image/webp' })
    })
  })
  const store = createThumbnailStore({ dir, rasterize, svgQueue: createRenderQueue({ maxWaiting: 20 }) })
  const svg = { body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>'), contentType: 'image/svg+xml' }
  const first = store.thumbnailFor({ key: 'channel:a', width: 96, loadOriginal: countingLoader(svg) })
  const second = store.thumbnailFor({ key: 'channel:b', width: 192, loadOriginal: countingLoader(svg) })
  while (releases.length < 1) await new Promise((resolve) => setTimeout(resolve, 5))
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.deepEqual(events, ['start 96'])
  releases[0]()
  while (releases.length < 2) await new Promise((resolve) => setTimeout(resolve, 5))
  releases[1]()
  await Promise.all([first, second])
  assert.deepEqual(events, ['start 96', 'end 96', 'start 192', 'end 192'])
})

test('landscapeOf: leaves an SVG unrendered for the thumbnail store to vet', async () => {
  const svg = { body: Buffer.from(FILTER_SVGS[0]), contentType: 'image/svg+xml' }
  assert.equal(await landscapeOf(svg), svg)
})

test('createRenderQueue: runs one task at a time and refuses tasks past the waiting limit', async () => {
  const queue = createRenderQueue({ maxWaiting: 1 })
  let release
  const running = queue.run(() => new Promise((resolve) => { release = resolve }))
  const waiting = queue.run(async () => 'second')
  await assert.rejects(queue.run(async () => 'third'), (err) => err.code === 'busy')
  release('first')
  assert.equal(await running, 'first')
  assert.equal(await waiting, 'second')
})

test('createThumbnailStore: renders an SVG with a script and an outside link to plain pixels and fetches nothing', async () => {
  const store = createThumbnailStore({ dir })
  const svg = Buffer.from([
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100000 100000">',
    '<script>alert(1)</script>',
    '<image href="http://192.0.2.1/x.png" xlink:href="http://192.0.2.1/x.png" width="10" height="10"/>',
    '<rect width="100000" height="100000" fill="#0c0"/></svg>',
  ].join(''))
  const thumbnail = await store.thumbnailFor({ key: 'channel:hostile', width: 192, loadOriginal: countingLoader({ body: svg, contentType: 'image/svg+xml' }) })
  assert.equal(thumbnail.contentType, 'image/webp')
  assert.equal((await sharp(thumbnail.body).metadata()).width, 192)
  assert.ok(!thumbnail.body.includes('script'))
})

test('createThumbnailStore: shares one resize between concurrent requests for the same thumbnail', async () => {
  const store = createThumbnailStore({ dir, resize: fakeResize })
  const loadOriginal = countingLoader()
  await Promise.all([1, 2, 3].map(() => store.thumbnailFor({ key: 'programme:a', width: 192, loadOriginal })))
  assert.equal(loadOriginal.calls, 1)
})

test('createThumbnailStore: a zero cap still serves thumbnails but keeps none', async () => {
  const store = createThumbnailStore({ dir, maxBytes: 0, resize: fakeResize })
  const thumbnail = await store.thumbnailFor({ key: 'programme:a', width: 192, loadOriginal: countingLoader() })
  assert.equal(thumbnail.body.length, 192)
  assert.deepEqual(await cachedFiles(), [])
})

test('heroWidthFrom: allows the hero sizes and keeps 768 as the default', () => {
  assert.deepEqual(HERO_IMAGE_WIDTHS, [192, 384, 768, 1280, 1920])
  assert.equal(heroWidthFrom(undefined), 768)
  assert.equal(heroWidthFrom('1280'), 1280)
  assert.equal(heroWidthFrom('1920'), 1920)
  assert.equal(heroWidthFrom('2560'), null)
  assert.equal(thumbnailWidthFrom({ requested: '1920', allowed: PROGRAMME_IMAGE_WIDTHS }), null)
})

test('resizeToWebp never enlarges a small source for a 1920 request', async () => {
  const body = await sharp({ create: { width: 219, height: 123, channels: 3, background: '#345' } }).png().toBuffer()
  const { body: out } = await resizeToWebp({ body, width: 1920 })
  assert.equal((await sharp(out).metadata()).width, 219)
})
