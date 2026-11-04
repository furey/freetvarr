import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-settings-requests-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')
process.env.MOVIES_ROOT = '/data/media/movies'

const { db, getSetting, setSetting } = await import('../src/db.js')
const { getMoviesRoot, rebaseFilePaths } = await import('../src/sync.js')
const { RETENTION_DAYS_ERROR, saveMoviesRoot, settingsSaveRefusalOf, tvhTestRequestOf } = await import('../src/settings-requests.js')

const server = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8')

before(async () => {
  await db.migrate.latest()
})

beforeEach(async () => {
  await db('recordings').delete()
  await db('settings').delete()
})

after(async () => {
  await db.destroy()
})

test('saveMoviesRoot: an empty movies folder clears the setting, so MOVIES_ROOT applies again', async () => {
  await saveMoviesRoot('/films')
  assert.equal(await getMoviesRoot(), '/films')
  await saveMoviesRoot('  ')
  assert.equal(await getSetting('movies_root'), null)
  assert.equal(await getMoviesRoot(), '/data/media/movies')
  await saveMoviesRoot(undefined)
  assert.equal(await getSetting('movies_root'), null)
})

test('saveMoviesRoot: clearing the movies folder leaves the paths of films already filed there alone', async () => {
  const film = '/films/Dune (2021)/Dune (2021).ts'
  await saveMoviesRoot('/films')
  await rebaseFilePaths()
  await db('recordings').insert({ recording_id: 'dune', title: 'Dune', file_path: film, status: 'done' })
  await saveMoviesRoot('')
  await rebaseFilePaths()
  assert.equal((await db('recordings').where({ recording_id: 'dune' }).first()).file_path, film)
  assert.equal(await getMoviesRoot(), '/data/media/movies')
})

test('saveMoviesRoot: clearing with no MOVIES_ROOT, then setting MOVIES_ROOT and restarting, leaves film paths alone', async (t) => {
  const film = '/films/Dune (2021)/Dune (2021).ts'
  delete process.env.MOVIES_ROOT
  t.after(() => { process.env.MOVIES_ROOT = '/data/media/movies' })
  await saveMoviesRoot('/films')
  await rebaseFilePaths()
  await db('recordings').insert({ recording_id: 'dune', title: 'Dune', file_path: film, status: 'done' })
  await saveMoviesRoot('')
  await rebaseFilePaths()
  assert.equal(await getSetting('last_movies_root'), null)
  process.env.MOVIES_ROOT = '/data/media/movies'
  await rebaseFilePaths()
  assert.equal((await db('recordings').where({ recording_id: 'dune' }).first()).file_path, film)
})

test('saveMoviesRoot: changing to another movies folder still moves the stored paths with it', async () => {
  await saveMoviesRoot('/films')
  await rebaseFilePaths()
  await db('recordings').insert({ recording_id: 'dune', title: 'Dune', file_path: '/films/Dune/Dune.ts', status: 'done' })
  await saveMoviesRoot('/movies')
  await rebaseFilePaths()
  assert.equal((await db('recordings').where({ recording_id: 'dune' }).first()).file_path, '/movies/Dune/Dune.ts')
})

test('saveMoviesRoot: an install that already holds movies_root "" switches to MOVIES_ROOT on the next save', async () => {
  await setSetting('movies_root', '')
  assert.equal(await getMoviesRoot(), '')
  await saveMoviesRoot('')
  assert.equal(await getMoviesRoot(), '/data/media/movies')
})

test('settingsSaveRefusalOf: a blank or zero retention field is refused, a whole number passes', () => {
  assert.equal(settingsSaveRefusalOf({ ad_original_retention_days: '' }), RETENTION_DAYS_ERROR)
  assert.equal(settingsSaveRefusalOf({ ad_original_retention_days: '0' }), RETENTION_DAYS_ERROR)
  assert.equal(settingsSaveRefusalOf({ ad_original_retention_days: '2.5' }), RETENTION_DAYS_ERROR)
  assert.equal(settingsSaveRefusalOf({ ad_original_retention_days: '7', time_zone: 'Australia/Sydney' }), null)
  assert.equal(settingsSaveRefusalOf({ time_zone: 'Mars/Base' }), 'Unknown time zone "Mars/Base"')
  assert.equal(settingsSaveRefusalOf({}), null)
})

test('tvhTestRequestOf: the wizard test saves the address, a Settings test with persist false does not', () => {
  assert.deepEqual(tvhTestRequestOf({ tvh_url: ' http://tvh:9981 ', tvh_username: 'a', tvh_password: 'p' }), {
    url: 'http://tvh:9981',
    username: 'a',
    password: 'p',
    persist: true,
  })
  assert.equal(tvhTestRequestOf({ persist: false }).persist, false)
})

test('settings save: the refusal check runs before the first write', () => {
  const route = server.slice(server.indexOf("app.post('/api/settings'"), server.indexOf("app.post('/api/tvh-test'"))
  const refusal = route.indexOf('settingsSaveRefusalOf(')
  assert.ok(refusal > 0 && refusal < route.indexOf('setSetting('))
})
