import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

import { listShowFolders, matchShowFolder } from '../src/folder-matcher.js'

// Real on-disk fixture under os.tmpdir() so we exercise the actual fs.readdir +
// Fuse.js path rather than mocking. Directory names mirror the disambiguated
// folder names the user already has in their Plex library.
let tmpRoot
const fixtures = [
  'Bluey (2018)',
  'Downton Abbey',
  'LOL - Last One Laughing UK',
  'MasterChef Australia',
  'The Amazing Race Australia Celebrity',
  'Married at First Sight',
  'a-file-not-a-dir.txt',
]

before(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'fetcharr-folder-matcher-'))
  for (const name of fixtures) {
    const full = path.join(tmpRoot, name)
    if (name.includes('.')) {
      await fs.writeFile(full, '')
    } else {
      await fs.mkdir(full)
    }
  }
})

after(async () => {
  if (tmpRoot) await fs.rm(tmpRoot, { recursive: true, force: true })
})

test('listShowFolders: returns only directories, not files', async () => {
  const folders = await listShowFolders(tmpRoot)
  assert.ok(folders.includes('Bluey (2018)'))
  assert.ok(folders.includes('MasterChef Australia'))
  assert.equal(
    folders.includes('a-file-not-a-dir.txt'),
    false,
    'plain files should be filtered out',
  )
})

test('listShowFolders: returns the full set with no duplicates', async () => {
  const folders = await listShowFolders(tmpRoot)
  const dirs = fixtures.filter((n) => !n.includes('.'))
  assert.equal(folders.length, dirs.length)
  assert.deepEqual([...folders].sort(), [...dirs].sort())
})

test('matchShowFolder: exact title finds the disambiguated folder', async () => {
  const m = await matchShowFolder('Bluey', { mediaRoot: tmpRoot })
  assert.equal(m.folder, 'Bluey (2018)')
  assert.ok(m.fullPath.endsWith('/Bluey (2018)'))
  assert.equal(typeof m.score, 'number')
})

test('matchShowFolder: longer title still matches the right folder', async () => {
  const m = await matchShowFolder('MasterChef Australia', { mediaRoot: tmpRoot })
  assert.equal(m.folder, 'MasterChef Australia')
})

test('matchShowFolder: acronym-style title matches LOL folder', async () => {
  // Fetch sometimes uses just "LOL" or the abbreviated form rather than the
  // full "Last One Laughing".
  const m = await matchShowFolder('LOL', { mediaRoot: tmpRoot, threshold: 0.6 })
  assert.equal(m?.folder, 'LOL - Last One Laughing UK')
})

test('matchShowFolder: returns null when nothing close enough exists', async () => {
  const m = await matchShowFolder(
    'Some Totally Different Show Name',
    { mediaRoot: tmpRoot, threshold: 0.2 },
  )
  assert.equal(m, null)
})

test('matchShowFolder: returns null when mediaRoot is empty', async () => {
  const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'fetcharr-empty-'))
  try {
    const m = await matchShowFolder('Anything', { mediaRoot: empty })
    assert.equal(m, null)
  } finally {
    await fs.rm(empty, { recursive: true, force: true })
  }
})
