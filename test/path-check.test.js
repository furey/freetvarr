import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { checkRecordingsFolder, checkMediaRoot, compareRecordingPaths } from '../src/path-check.js'

const tempDir = () => fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-path-check-'))

test('checkRecordingsFolder: a readable folder on the media filesystem passes', async () => {
  const root = await tempDir()
  const recordings = path.join(root, 'recordings')
  const media = path.join(root, 'media')
  await fs.mkdir(recordings)
  await fs.mkdir(media)
  assert.deepEqual(await checkRecordingsFolder({ recordingsPath: recordings, mediaRoot: media }), {
    ok: true,
    path: recordings,
    hardlinks: true,
    sameDevice: true,
  })
  assert.deepEqual(await fs.readdir(recordings), [])
  assert.deepEqual(await fs.readdir(media), [])
})

test('checkRecordingsFolder: a missing folder fails with a plain reason', async () => {
  const root = await tempDir()
  const missing = path.join(root, 'nope')
  const result = await checkRecordingsFolder({ recordingsPath: missing, mediaRoot: root })
  assert.equal(result.ok, false)
  assert.equal(result.error, `${missing} does not exist inside the container`)
})

test('checkRecordingsFolder: a file is not a folder', async () => {
  const root = await tempDir()
  const file = path.join(root, 'file.ts')
  await fs.writeFile(file, '')
  const result = await checkRecordingsFolder({ recordingsPath: file, mediaRoot: root })
  assert.equal(result.error, `${file} exists but is not a directory`)
})

test('checkRecordingsFolder: a relative path is rejected', async () => {
  const result = await checkRecordingsFolder({ recordingsPath: 'recordings', mediaRoot: '/tmp' })
  assert.equal(result.error, 'path must be absolute (start with /)')
})

test('checkRecordingsFolder: an unreadable media root leaves the hardlink check unknown', async () => {
  const root = await tempDir()
  const result = await checkRecordingsFolder({ recordingsPath: root, mediaRoot: path.join(root, 'nope') })
  assert.equal(result.hardlinks, null)
})

test('compareRecordingPaths: ignores a trailing slash', () => {
  assert.deepEqual(compareRecordingPaths({ configured: '/recordings', tvhStorage: '/recordings/' }), {
    tvhPath: '/recordings',
    configured: '/recordings',
    matches: true,
  })
})

test('compareRecordingPaths: reports a mismatch', () => {
  const result = compareRecordingPaths({ configured: '/recordings', tvhStorage: '/home/hts/recordings' })
  assert.equal(result.matches, false)
  assert.equal(result.tvhPath, '/home/hts/recordings')
})

test('compareRecordingPaths: an empty TVHeadend path never matches', () => {
  assert.equal(compareRecordingPaths({ configured: '', tvhStorage: '' }).matches, false)
})

test('checkMediaRoot: a writable folder passes and reports its owner', async () => {
  const root = await tempDir()
  const result = await checkMediaRoot(root)
  assert.equal(result.ok, true)
  assert.equal(result.path, root)
  assert.equal(result.ownerUid, process.getuid())
})

test('checkMediaRoot: a missing folder fails with a plain reason', async () => {
  const root = await tempDir()
  const missing = path.join(root, 'nope')
  assert.deepEqual(await checkMediaRoot(missing), {
    ok: false,
    error: `${missing} does not exist inside the container`,
  })
})

test('checkMediaRoot: a read-only folder is not writable', { skip: process.getuid() === 0 }, async () => {
  const root = await tempDir()
  await fs.chmod(root, 0o555)
  const result = await checkMediaRoot(root)
  await fs.chmod(root, 0o755)
  assert.equal(result.ok, false)
  assert.equal(result.error, `${root} is not writable by the container user`)
  assert.equal(result.ownerUid, process.getuid())
})

test('checkMediaRoot: a relative path is rejected', async () => {
  assert.equal((await checkMediaRoot('media')).error, 'path must be absolute (start with /)')
})
