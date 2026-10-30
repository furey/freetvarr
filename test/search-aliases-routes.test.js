import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import express from 'express'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-nicknames-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')
const { mountSearchRoutes, showKeyFrom } = await import('../src/search-aliases.js')

const passThrough = (req, res, next) => next()
let appServer
let baseUrl

const call = async (method, url, body) => {
  const res = await fetch(`${baseUrl}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

before(async () => {
  await db.migrate.latest()
  const app = express()
  app.use(express.json())
  mountSearchRoutes({ app, csrf: passThrough })
  appServer = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => appServer.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${appServer.address().port}`
})

after(async () => {
  appServer.close()
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

test('showKeyFrom accepts show keys and rejects anything else', () => {
  assert.equal(showKeyFrom('spicks-and-specks'), 'spicks-and-specks')
  assert.equal(showKeyFrom('Spicks and Specks'), null)
  assert.equal(showKeyFrom('-gruen'), null)
  assert.equal(showKeyFrom('a'.repeat(201)), null)
  assert.equal(showKeyFrom(''), null)
})

test('nickname routes refuse a key that is not a show key', async () => {
  const added = await call('POST', `/api/show-nicknames/${encodeURIComponent('../Not A Key')}`, { name: 'MKR' })
  assert.equal(added.status, 400)
  assert.equal((await call('GET', '/api/show-nicknames/Bad%20Key')).status, 400)
  assert.equal((await call('DELETE', '/api/show-nicknames/Bad%20Key/1')).status, 400)
  assert.equal(Number((await db('show_nicknames').count({ count: 'id' }).first()).count), 0)
})

test('nickname routes save a name for a show key', async () => {
  const added = await call('POST', '/api/show-nicknames/my-kitchen-rules', { name: 'MKR' })
  assert.equal(added.status, 201)
  assert.deepEqual(added.body.nicknames.map((row) => row.name), ['MKR'])
})

test('nickname routes stop adding names once the table is full', async () => {
  await db('show_nicknames').delete()
  const rows = Array.from({ length: 2000 }, (_, index) => ({
    show_key: `show-${index}`,
    name: `name ${index}`,
    name_key: `name ${index}`,
    created_at: Date.now(),
  }))
  for (let i = 0; i < rows.length; i += 200) await db('show_nicknames').insert(rows.slice(i, i + 200))
  const added = await call('POST', '/api/show-nicknames/gruen', { name: 'The Gruen Transfer' })
  assert.equal(added.status, 400)
  assert.equal(Number((await db('show_nicknames').count({ count: 'id' }).first()).count), 2000)
})
