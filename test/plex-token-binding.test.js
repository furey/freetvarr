import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import axios from 'axios'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-plex-token-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db, getSetting, setSetting } = await import('../src/db.js')
const {
  detectPlexTokenFromPreferences,
  listPlexSections,
  notifyPlexSectionRefresh,
  plexTokenBindsTo,
  storedPlexToken,
  storedPlexTokenFor,
} = await import('../src/plex.js')
const { savePlexConnection } = await import('../src/connection-secrets.js')
const { detectedPlexTokenState } = await import('../src/web/setup-folders.js')

const TOKEN = 'plex-token-fixture'
const STORED_URL = 'http://192.0.2.20:32400'
const interfaces = { eth0: [{ address: '192.168.1.10', family: 'IPv4', internal: false }] }

const originalGet = axios.get
let calls = []

before(async () => {
  await db.migrate.latest()
})

beforeEach(async () => {
  await db('settings').delete()
  await setSetting('plex_url', STORED_URL)
  await setSetting('plex_token', TOKEN)
  await setSetting('plex_tv_section_id', '1')
  calls = []
  axios.get = async (url, config = {}) => {
    calls.push({ url, params: config.params || {} })
    return { status: 200, data: { MediaContainer: { Directory: [] } } }
  }
})

after(async () => {
  axios.get = originalGet
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

test('plexTokenBindsTo: an unscoped token binds to its saved Plex URL only', () => {
  assert.equal(plexTokenBindsTo({ url: `${STORED_URL}/`, storedUrl: STORED_URL, scope: null, interfaces }), true)
  assert.equal(plexTokenBindsTo({ url: 'http://192.0.2.99:32400', storedUrl: STORED_URL, scope: null, interfaces }), false)
})

test('plexTokenBindsTo: a this-machine token binds to loopback and local interface addresses only', () => {
  const bindsTo = (url) => plexTokenBindsTo({ url, storedUrl: STORED_URL, scope: 'this-machine', interfaces })
  assert.equal(bindsTo('http://127.0.0.1:32400'), true)
  assert.equal(bindsTo('http://host.docker.internal:32400'), true)
  assert.equal(bindsTo('http://192.168.1.10:32400'), true)
  assert.equal(bindsTo('http://192.168.1.11:32400'), false)
  assert.equal(bindsTo(STORED_URL), false)
})

test('storedPlexTokenFor: gives the stored Plex token only for its bound URL', async () => {
  assert.equal(await storedPlexTokenFor(STORED_URL), TOKEN)
  assert.equal(await storedPlexTokenFor('http://192.0.2.99:32400'), null)
})

test('storedPlexToken: reports no usable token for a detected token while the saved Plex URL is on another machine', async () => {
  await setSetting('plex_token_scope', 'this-machine')
  assert.equal(await storedPlexToken(), null)
  await setSetting('plex_url', 'http://127.0.0.1:32400')
  assert.equal(await storedPlexToken(), TOKEN)
})

test('settings read: plex_token_set comes from the bound Plex token', async () => {
  const source = await fs.readFile(new URL('../src/server.js', import.meta.url), 'utf8')
  const settingsRead = source.slice(source.indexOf("app.get('/api/settings'"), source.indexOf("app.post('/api/settings'"))
  assert.ok(settingsRead.includes('storedPlexToken()'))
  assert.ok(!settingsRead.includes("getSetting('plex_token')"))
})

test('listPlexSections: sends no stored Plex token to a URL it is not bound to', async () => {
  await assert.rejects(listPlexSections({ url: 'http://192.0.2.99:32400' }), /Paste the Plex token for this server/)
  assert.ok(calls.every((call) => call.params['X-Plex-Token'] !== TOKEN))
  await listPlexSections({ url: STORED_URL })
  assert.equal(calls.at(-1).params['X-Plex-Token'], TOKEN)
})

test('listPlexSections: uses a typed Plex token as sent', async () => {
  await listPlexSections({ url: 'http://192.0.2.99:32400', token: 'typed' })
  assert.equal(calls.at(-1).params['X-Plex-Token'], 'typed')
})

test('notifyPlexSectionRefresh: sends no stored Plex token to a URL it is not bound to', async () => {
  const result = await notifyPlexSectionRefresh({ url: 'http://192.0.2.99:32400' })
  assert.equal(result.skipped, true)
  assert.equal(calls.length, 0)
})

test('detectPlexTokenFromPreferences: reports that a token is set without returning it', async () => {
  const prefsPath = path.join(tmpDir, 'Preferences.xml')
  await fs.writeFile(prefsPath, `<?xml version="1.0"?><Preferences PlexOnlineToken="${TOKEN}-detected" />`)
  await setSetting('plex_prefs_path', prefsPath)
  const result = await detectPlexTokenFromPreferences()
  assert.equal(result.ok, true)
  assert.equal(result.plex_token_set, true)
  assert.equal('token' in result, false)
  assert.ok(!JSON.stringify(result).includes(`${TOKEN}-detected`))
  assert.equal(await getSetting('plex_token'), `${TOKEN}-detected`)
  assert.equal(await getSetting('plex_token_scope'), 'this-machine')
})

test('detectPlexTokenFromPreferences: reads only a file named Preferences.xml', async () => {
  await setSetting('plex_prefs_path', '/etc/hosts')
  const refused = await detectPlexTokenFromPreferences()
  assert.equal(refused.ok, false)
  assert.match(refused.reason, /is not a Plex Preferences\.xml file/)
  assert.equal(await getSetting('plex_token'), TOKEN)
  await setSetting('plex_prefs_path', path.join(tmpDir, 'missing', 'plex-preferences.xml'))
  assert.match((await detectPlexTokenFromPreferences()).reason, /^Preferences\.xml not found at /)
})

test('detectedPlexTokenState: marks the token as stored and leaves the token field empty', () => {
  assert.deepEqual(detectedPlexTokenState({ ok: true, source: 'preferences.xml', plex_token_set: true }), {
    plexTokenSet: true,
    plexToken: '',
  })
  assert.deepEqual(detectedPlexTokenState({ ok: false }), { plexTokenSet: false, plexToken: '' })
})

test('settings save: drops the stored Plex token when the URL moves to another machine', async () => {
  const cleared = await savePlexConnection({ body: { plex_url: 'http://192.0.2.99:32400' }, interfaces })
  assert.deepEqual(cleared, ['plex_token'])
  assert.equal(await getSetting('plex_token'), null)
  assert.equal(await getSetting('plex_url'), 'http://192.0.2.99:32400')
})

test('settings save: binds a this-machine Plex token to a local URL', async () => {
  await setSetting('plex_token_scope', 'this-machine')
  const cleared = await savePlexConnection({ body: { plex_url: 'http://192.168.1.10:32400' }, interfaces })
  assert.deepEqual(cleared, [])
  assert.equal(await getSetting('plex_token'), TOKEN)
  assert.equal(await getSetting('plex_token_scope'), null)
  assert.equal(await storedPlexTokenFor('http://192.168.1.10:32400'), TOKEN)
})

test('settings save: keeps an unscoped Plex token when the URL moves between two addresses on this machine', async () => {
  await setSetting('plex_url', 'http://127.0.0.1:32400')
  const cleared = await savePlexConnection({ body: { plex_url: 'http://192.168.1.10:32400' }, interfaces })
  assert.deepEqual(cleared, [])
  assert.equal(await storedPlexTokenFor('http://192.168.1.10:32400'), TOKEN)
})

test('settings save: keeps the stored Plex token when the URL keeps its origin', async () => {
  const cleared = await savePlexConnection({ body: { plex_url: `${STORED_URL}/` }, interfaces })
  assert.deepEqual(cleared, [])
  assert.equal(await getSetting('plex_token'), TOKEN)
})

test('settings save: a typed Plex token replaces the stored one and clears the scope', async () => {
  await setSetting('plex_token_scope', 'this-machine')
  const cleared = await savePlexConnection({ body: { plex_url: 'http://192.0.2.99:32400', plex_token: 'typed' }, interfaces })
  assert.deepEqual(cleared, [])
  assert.equal(await getSetting('plex_token'), 'typed')
  assert.equal(await getSetting('plex_token_scope'), null)
})
