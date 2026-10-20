import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import express from 'express'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-watchlist-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')
const { mountWatchlist } = await import('../src/watchlist.js')

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
  mountWatchlist({ app, csrf: passThrough })
  appServer = app.listen(0)
  await new Promise((resolve) => appServer.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${appServer.address().port}`
})

after(async () => {
  appServer.close()
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

test('POST /api/watchlist: a bare title is enough and matches by show key', async () => {
  const { status, body } = await call('POST', '/api/watchlist', { title: '  Bluey  ', mode: 'notify' })
  assert.equal(status, 201)
  assert.equal(body.item.title, 'Bluey')
  assert.equal(body.item.key, 'bluey')
  assert.equal(body.item.leadTime, null)
  assert.equal(body.item.lagTime, null)
})

test('POST /api/watchlist: stores padding for Record when it appears', async () => {
  const { status, body } = await call('POST', '/api/watchlist', { title: 'Utopia', mode: 'record', lead_time: 5, lag_time: 30 })
  assert.equal(status, 201)
  assert.equal(body.item.mode, 'record')
  assert.equal(body.item.leadTime, 5)
  assert.equal(body.item.lagTime, 30)
  const row = await db('watchlist').where({ title_key: 'utopia' }).first()
  assert.equal(row.lead_time, 5)
  assert.equal(row.lag_time, 30)
})

test('POST /api/watchlist: padding is dropped for notify and updated on a repeat', async () => {
  await call('POST', '/api/watchlist', { title: 'Gruen', mode: 'notify', lead_time: 5, lag_time: 30 })
  assert.equal((await db('watchlist').where({ title_key: 'gruen' }).first()).lead_time, null)
  const { status, body } = await call('POST', '/api/watchlist', { title: 'GRUEN', mode: 'record', lead_time: 1, lag_time: 60 })
  assert.equal(status, 200)
  assert.equal(body.item.leadTime, 1)
  assert.equal(body.item.lagTime, 60)
})

test('POST /api/watchlist: rejects padding outside 0 to 240 minutes and titles with no letters', async () => {
  const tooLong = await call('POST', '/api/watchlist', { title: 'Hard Quiz', mode: 'record', lead_time: 241 })
  assert.equal(tooLong.status, 400)
  assert.match(tooLong.body.error, /0 to 240/)
  const fraction = await call('POST', '/api/watchlist', { title: 'Hard Quiz', mode: 'record', lag_time: 2.5 })
  assert.equal(fraction.status, 400)
  const symbols = await call('POST', '/api/watchlist', { title: '??', mode: 'notify' })
  assert.equal(symbols.status, 400)
})
