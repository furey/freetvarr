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
  PROGRAMME_IMAGE_WIDTHS,
} from '../src/image-thumbnails.js'

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

test('createThumbnailStore: serves the original when resizing fails or the image is SVG, uncached', async () => {
  const store = createThumbnailStore({ dir, resize: async () => { throw new Error('corrupt') } })
  const broken = await store.thumbnailFor({ key: 'channel:1', width: 96, loadOriginal: countingLoader() })
  assert.equal(broken, ORIGINAL)
  const svg = { body: Buffer.from('<svg/>'), contentType: 'image/svg+xml' }
  assert.equal(await store.thumbnailFor({ key: 'channel:2', width: 96, loadOriginal: countingLoader(svg) }), svg)
  assert.deepEqual(await cachedFiles(), [])
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
