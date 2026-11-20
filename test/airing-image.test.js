import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

import { airingImageOf, findArtOriginThumbnail } from '../src/epg.js'
import { createThumbnailStore } from '../src/image-thumbnails.js'

const dirs = []
after(() => Promise.all(dirs.map((dir) => fs.rm(dir, { recursive: true, force: true }))))

const renderOf = (images) => async (resolution) => ({ image: images[resolution.origin] ?? null, pending: false })

test('a remembered airing picture that no longer renders is forgotten and resolved again in the same request', async () => {
  const answers = [{ origin: 'guide:gone', remembered: true }, { origin: 'guide:next' }]
  const forgotten = []
  const found = await airingImageOf({
    resolve: async () => answers.shift(),
    render: renderOf({ 'guide:next': { body: Buffer.from('next') } }),
    forget: () => forgotten.push(true),
  })
  assert.equal(found.image.body.toString(), 'next')
  assert.deepEqual(forgotten, [true])
  assert.deepEqual(answers, [])
})

test('an airing picture that was not remembered is not resolved again when it fails', async () => {
  let resolves = 0
  const found = await airingImageOf({
    resolve: async () => {
      resolves += 1
      return { origin: 'guide:gone' }
    },
    render: renderOf({}),
    forget: () => assert.fail('nothing to forget'),
  })
  assert.equal(found.image, null)
  assert.equal(resolves, 1)
})

test('findArtOriginThumbnail serves a cached art pool thumbnail without resolving its source', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-art-origin-'))
  dirs.push(dir)
  const thumbnails = createThumbnailStore({ dir })
  const origin = 'plex:/photo/:/transcode?width=1920&url=%2Fart'
  const body = await sharp({ create: { width: 64, height: 36, channels: 3, background: '#336699' } }).jpeg().toBuffer()
  await thumbnails.thumbnailFor({ key: `show-1080:${origin}`, width: 384, loadOriginal: async () => ({ body }) })
  let sourceAsks = 0
  const image = await findArtOriginThumbnail({
    origin,
    width: 384,
    thumbnails,
    sourceOf: async () => {
      sourceAsks += 1
      return 'http://plex/photo?X-Plex-Token=t'
    },
  })
  assert.ok(image.body.length)
  assert.equal(sourceAsks, 0)
})
