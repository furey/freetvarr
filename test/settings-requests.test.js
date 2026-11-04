import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-settings-requests-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')
process.env.MOVIES_ROOT = '/data/media/movies'

const { db, getSetting } = await import('../src/db.js')
const { getMoviesRoot } = await import('../src/sync.js')
const { RETENTION_DAYS_ERROR, saveMoviesRoot, settingsSaveRefusalOf, tvhTestRequestOf } = await import('../src/settings-requests.js')

const server = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8')
const settingsRoute = server.slice(server.indexOf("app.post('/api/settings'"), server.indexOf("app.post('/api/tvh-test'"))

before(async () => {
  await db.migrate.latest()
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

test('settingsSaveRefusalOf: a blank or zero retention field is refused, a whole number passes', () => {
  assert.equal(settingsSaveRefusalOf({ ad_original_retention_days: '' }), RETENTION_DAYS_ERROR)
  assert.equal(settingsSaveRefusalOf({ ad_original_retention_days: '0' }), RETENTION_DAYS_ERROR)
  assert.equal(settingsSaveRefusalOf({ ad_original_retention_days: '2.5' }), RETENTION_DAYS_ERROR)
  assert.equal(settingsSaveRefusalOf({ ad_original_retention_days: '7', time_zone: 'Australia/Sydney' }), null)
  assert.equal(settingsSaveRefusalOf({ time_zone: 'Mars/Base' }), 'Unknown time zone "Mars/Base"')
  assert.equal(settingsSaveRefusalOf({}), null)
})

test('settings save: the refusal check runs before the first write, and the movies folder goes through saveMoviesRoot', () => {
  const refusal = settingsRoute.indexOf('settingsSaveRefusalOf(body)')
  assert.ok(refusal > 0)
  assert.ok(refusal < settingsRoute.indexOf("writeString('tvh_url'"))
  assert.doesNotMatch(settingsRoute.slice(refusal), /must be a positive integer/)
  assert.match(settingsRoute, /await saveMoviesRoot\(body\.movies_root\)/)
  assert.doesNotMatch(settingsRoute, /writeString\('movies_root'/)
})

test('tvhTestRequestOf: the wizard test saves the address, a Settings test with persist false does not', () => {
  assert.deepEqual(tvhTestRequestOf({ tvh_url: ' http://tvh:9981 ', tvh_username: 'a', tvh_password: 'p' }), {
    url: 'http://tvh:9981',
    username: 'a',
    password: 'p',
    persist: true,
  })
  assert.equal(tvhTestRequestOf({ persist: false }).persist, false)
  assert.match(server, /testTvheadendConnection\(tvhTestRequestOf\(req\.body\)\)/)
})
