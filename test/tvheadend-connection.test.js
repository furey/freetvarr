import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-tvh-connection-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db, getSetting, setSetting } = await import('../src/db.js')
const { resolveConnection, testConnection } = await import('../src/tvheadend.js')
const { saveTvheadendConnection } = await import('../src/connection-secrets.js')

const STORED_URL = 'http://127.0.0.1:1'
const SECRET = 'stored-secret'

const startTvheadend = async ({ needsLogin = false } = {}) => {
  const authorizations = []
  const server = http.createServer((req, res) => {
    authorizations.push(req.headers.authorization || '')
    if (needsLogin && decoded(req.headers.authorization || '') !== `freetvarr:${SECRET}`) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="tvheadend"' })
      return res.end()
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(req.url.startsWith('/api/serverinfo') ? { sw_version: '4.3', api_version: 19 } : { entries: [] }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { url: `http://127.0.0.1:${server.address().port}`, authorizations, close: () => { server.closeAllConnections(); server.close() } }
}

const decoded = (header) => Buffer.from(header.replace(/^Basic /, ''), 'base64').toString('utf8')

before(async () => {
  await db.migrate.latest()
})

beforeEach(async () => {
  await db('settings').delete()
  await setSetting('tvh_url', STORED_URL)
  await setSetting('tvh_username', 'freetvarr')
  await setSetting('tvh_password', SECRET)
})

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

test('resolveConnection: attaches the stored TVHeadend password only to its saved URL', async () => {
  assert.equal((await resolveConnection()).password, SECRET)
  assert.equal((await resolveConnection({ url: `${STORED_URL}/` })).password, SECRET)
  assert.equal((await resolveConnection({ url: 'http://127.0.0.1:2' })).password, '')
  assert.equal((await resolveConnection({ url: 'http://127.0.0.1:2', password: 'typed' })).password, 'typed')
})

test('testConnection: never signs a request to a new URL with the stored password', async (t) => {
  const tvh = await startTvheadend({ needsLogin: true })
  t.after(tvh.close)
  await assert.rejects(testConnection({ url: tvh.url, username: 'freetvarr', persist: false }), /Enter the TVHeadend password/)
  assert.ok(tvh.authorizations.every((header) => !decoded(header).includes(SECRET)))
})

test('testConnection: drops the stored TVHeadend password when a new URL passes without one', async () => {
  const tvh = await startTvheadend()
  const result = await testConnection({ url: tvh.url, username: 'freetvarr', persist: true })
  tvh.close()
  assert.deepEqual(result.cleared, ['tvh_password'])
  assert.equal(await getSetting('tvh_url'), tvh.url)
  assert.equal(await getSetting('tvh_password'), null)
})

test('testConnection: keeps the stored TVHeadend password for the same URL', async () => {
  const tvh = await startTvheadend()
  await setSetting('tvh_url', tvh.url)
  const result = await testConnection({ url: `${tvh.url}/`, username: 'freetvarr', persist: true })
  tvh.close()
  assert.equal(result.cleared, undefined)
  assert.equal(await getSetting('tvh_password'), SECRET)
})

test('settings save: drops the stored TVHeadend password when the URL changes without one', async () => {
  const cleared = await saveTvheadendConnection({ body: { tvh_url: 'http://192.0.2.5:9981', tvh_username: 'freetvarr' } })
  assert.deepEqual(cleared, ['tvh_password'])
  assert.equal(await getSetting('tvh_url'), 'http://192.0.2.5:9981')
  assert.equal(await getSetting('tvh_password'), null)
})

test('settings save: keeps a typed TVHeadend password with a new URL', async () => {
  const cleared = await saveTvheadendConnection({ body: { tvh_url: 'http://192.0.2.5:9981', tvh_password: 'new-secret' } })
  assert.deepEqual(cleared, [])
  assert.equal(await getSetting('tvh_password'), 'new-secret')
})

test('settings save: keeps the stored TVHeadend password when the URL keeps its origin', async () => {
  const cleared = await saveTvheadendConnection({ body: { tvh_url: `${STORED_URL}/`, tvh_username: 'freetvarr' } })
  assert.deepEqual(cleared, [])
  assert.equal(await getSetting('tvh_password'), SECRET)
})
