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
  for (const key of ['media_root', 'oneoff_root', 'movies_root', 'recordings_root']) {
    for (const value of ['/', 'relative/x', path.join(tmpDir, 'missing'), path.join(tmpDir, 'file.txt'), '/etc', '/proc', '/app/src']) {
      const problem = await problemFor({ [key]: value })
      assert.equal(problem?.field, key, `${key}=${value}`)
      assert.ok(problem.error.startsWith(key))
    }
  }
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

test('rootSettingsProblem: checks the TVHeadend recordings path as a container path only', async () => {
  assert.equal(await problemFor({ tvh_recordings_path: '/tvh-recordings-not-on-this-machine' }), null)
  assert.equal((await problemFor({ tvh_recordings_path: '/' }))?.field, 'tvh_recordings_path')
  assert.equal((await problemFor({ tvh_recordings_path: 'recordings' }))?.field, 'tvh_recordings_path')
})
