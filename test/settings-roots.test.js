import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { rootSettingsProblem } from '../src/path-check.js'

let tmpDir
let configDir
let goodRoot
let current

const LABELS = {
  media_root: 'Media root',
  oneoff_root: 'One-off folder',
  movies_root: 'Movies folder',
  recordings_root: 'Recordings folder (as Freetvarr sees it)',
}

before(async () => {
  tmpDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-roots-')))
  configDir = path.join(tmpDir, 'config')
  goodRoot = path.join(tmpDir, 'media')
  await fs.mkdir(configDir)
  await fs.mkdir(goodRoot)
  await fs.writeFile(path.join(tmpDir, 'file.txt'), 'x')
  current = {
    media_root: '/data/media/tv',
    oneoff_root: '/data/media/one-offs',
    movies_root: '',
    recordings_root: '/recordings',
    tvh_recordings_path: '/recordings',
  }
})

after(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

const problemFor = (body) => rootSettingsProblem({ body, current, configDir })

test('rootSettingsProblem: refuses a local root that is /, relative, missing, a file, or a system folder', async () => {
  for (const [key, label] of Object.entries(LABELS)) {
    for (const value of ['/', 'relative/x', path.join(tmpDir, 'missing'), path.join(tmpDir, 'file.txt'), '/etc', '/proc', '/app/src']) {
      const problem = await problemFor({ [key]: value })
      assert.equal(problem?.field, key, `${key}=${value}`)
      assert.ok(problem.error.startsWith(`${label} `), problem.error)
    }
  }
})

test('rootSettingsProblem: names each problem with the Settings label and plain words', async () => {
  const errorFor = async (value) => (await problemFor({ media_root: value })).error
  assert.equal(await errorFor('relative/x'), 'Media root must be a full path that starts with /.')
  assert.equal(await errorFor('/proc'), 'Media root cannot be /proc, a system folder.')
  assert.equal(await errorFor(configDir), 'Media root cannot be the Freetvarr config folder, a folder inside it, or a folder that holds it.')
  assert.equal(await errorFor(path.join(tmpDir, 'missing')), `Media root ${path.join(tmpDir, 'missing')} does not exist inside the Freetvarr container.`)
  assert.equal(await errorFor(path.join(tmpDir, 'file.txt')), `Media root ${path.join(tmpDir, 'file.txt')} is not a folder.`)
})

test('rootSettingsProblem: refuses the config folder, a folder inside it, and a parent of it', async () => {
  for (const value of [configDir, path.join(configDir, 'sub'), tmpDir]) {
    const problem = await problemFor({ media_root: value })
    assert.equal(problem?.field, 'media_root', value)
  }
})

test('rootSettingsProblem: accepts an existing folder, an unchanged value, and a blank value', async () => {
  assert.equal(await problemFor({ media_root: goodRoot }), null)
  assert.equal(await problemFor({ media_root: '/data/media/tv', recordings_root: '/recordings' }), null)
  assert.equal(await problemFor({ movies_root: '' }), null)
})

test('settings save: checks root paths before the nested-folder check, so a bad path gets the path message', async () => {
  const source = await fs.readFile(new URL('../src/server.js', import.meta.url), 'utf8')
  const route = source.slice(source.indexOf("app.post('/api/settings'"), source.indexOf("app.post('/api/tvh-test'"))
  const pathCheck = route.indexOf('rootSettingsProblem(')
  const nestedCheck = route.indexOf('libraryRootsSaveError(')
  assert.ok(pathCheck > 0 && nestedCheck > 0)
  assert.ok(pathCheck < nestedCheck)
})

test('rootSettingsProblem: checks the TVHeadend recordings path as a container path only', async () => {
  assert.equal(await problemFor({ tvh_recordings_path: '/tvh-recordings-not-on-this-machine' }), null)
  assert.deepEqual(await problemFor({ tvh_recordings_path: '/' }), {
    field: 'tvh_recordings_path',
    error: 'Recordings folder (as TVHeadend sees it) cannot be /.',
  })
  assert.deepEqual(await problemFor({ tvh_recordings_path: 'recordings' }), {
    field: 'tvh_recordings_path',
    error: 'Recordings folder (as TVHeadend sees it) must be a full path that starts with /.',
  })
})
