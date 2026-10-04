import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { findArtwork, pruneRecordingArtwork, readArtwork, removeArtwork, saveArtwork, shrinkImage } from '../src/artwork.js'

const makeRoot = () => fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-artwork-'))
const jpeg = { body: Buffer.from('jpeg-bytes'), contentType: 'image/jpeg' }
const png = { body: Buffer.from('png-bytes'), contentType: 'image/png; charset=binary' }

test('saveArtwork: stores a recording image by id and finds it again', async () => {
  const root = await makeRoot()
  const relative = await saveArtwork({ kind: 'recording', id: 'abc123', image: jpeg, root, shrink: async (i) => i })
  assert.equal(relative, 'recordings/abc123.jpg')
  const found = await findArtwork({ kind: 'recording', id: 'abc123', root })
  assert.equal(found.contentType, 'image/jpeg')
  assert.equal(found.body.toString(), 'jpeg-bytes')
})

test('saveArtwork: a new image type replaces the old file', async () => {
  const root = await makeRoot()
  await saveArtwork({ kind: 'channel', id: 'chan1', image: jpeg, root })
  await saveArtwork({ kind: 'channel', id: 'chan1', image: png, root })
  assert.deepEqual(await fs.readdir(path.join(root, 'channels')), ['chan1.png'])
  assert.equal((await findArtwork({ kind: 'channel', id: 'chan1', root })).contentType, 'image/png')
})

test('saveArtwork: refuses ids and paths that could leave the artwork folder', async () => {
  const root = await makeRoot()
  assert.equal(await saveArtwork({ kind: 'recording', id: '../evil', image: jpeg, root }), null)
  assert.equal(await saveArtwork({ kind: 'other', id: 'abc', image: jpeg, root }), null)
  assert.equal(await readArtwork({ relative: 'recordings/../../etc/passwd', root }), null)
  assert.equal(await findArtwork({ kind: 'recording', id: '../evil', root }), null)
})

test('removeArtwork and pruneRecordingArtwork: delete one, then every old orphan', async () => {
  const root = await makeRoot()
  for (const id of ['keep', 'gone', 'orphan']) await saveArtwork({ kind: 'recording', id, image: jpeg, root })
  await removeArtwork({ kind: 'recording', id: 'gone', root })
  assert.equal(await findArtwork({ kind: 'recording', id: 'gone', root }), null)
  assert.equal(await pruneRecordingArtwork({ keepIds: ['keep'], root }), 0)
  const later = Date.now() + 15 * 24 * 60 * 60 * 1000
  assert.equal(await pruneRecordingArtwork({ keepIds: ['keep'], nowMs: later, root }), 1)
  assert.deepEqual(await fs.readdir(path.join(root, 'recordings')), ['keep.jpg'])
})

test('shrinkImage: leaves a small image alone and keeps only a smaller result', async () => {
  const big = { body: Buffer.alloc(300 * 1024, 1), contentType: 'image/png' }
  const calls = []
  const run = async ({ args }) => { calls.push(args); return Buffer.alloc(80 * 1024) }
  assert.equal(await shrinkImage(jpeg, { run }), jpeg)
  const shrunk = await shrinkImage(big, { run })
  assert.equal(shrunk.contentType, 'image/jpeg')
  assert.equal(shrunk.body.length, 80 * 1024)
  assert.ok(calls[0].includes("scale='min(960,iw)':-2"))
  assert.equal(await shrinkImage(big, { run: async () => Buffer.alloc(400 * 1024) }), big)
})
