import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import express from 'express'

const tmpDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-tvh-routes-')))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')
const { mountRecordingTvhRoutes } = await import('../src/recording-tvh-routes.js')

const tvh = { finished: [], posts: [] }
const syncs = []

let tvhServer
let appServer
let baseUrl

const passThrough = (req, res, next) => next()

before(async () => {
  tvhServer = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    if (req.method === 'POST') tvh.posts.push(url.pathname)
    const bodies = { '/api/dvr/entry/grid_finished': { entries: tvh.finished, total: tvh.finished.length } }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(bodies[url.pathname] || { entries: [] }))
  })
  await new Promise((resolve) => tvhServer.listen(0, '127.0.0.1', resolve))
  await db.migrate.latest()
  await db('settings').insert({ key: 'tvh_url', value: `http://127.0.0.1:${tvhServer.address().port}` })
  const app = express()
  app.use(express.json())
  const startSync = async (options) => {
    syncs.push(options)
    return { syncId: 7, alreadyRunning: false }
  }
  mountRecordingTvhRoutes({ app, csrf: passThrough, limiter: passThrough, startSync })
  appServer = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => appServer.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${appServer.address().port}`
})

after(async () => {
  await db.destroy()
  await new Promise((resolve) => appServer.close(resolve))
  await new Promise((resolve) => tvhServer.close(resolve))
  await fs.rm(tmpDir, { recursive: true, force: true })
})

beforeEach(async () => {
  tvh.finished = []
  tvh.posts = []
  syncs.length = 0
  await db('recordings').delete()
})

const post = (route, body = {}) => fetch(`${baseUrl}${route}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

test('delete-from-tvh: a recording that is not imported gives 409 and TVHeadend is not called', async () => {
  await db('recordings').insert({ recording_id: 'r1', title: 'The Block', status: 'partial' })
  tvh.finished = [{ uuid: 'r1', disp_title: 'The Block' }]
  const res = await post('/api/recordings/r1/delete-from-tvh')
  assert.equal(res.status, 409)
  assert.deepEqual(tvh.posts, [])
  assert.equal((await db('recordings').first()).deleted_from_tvh_at, null)
})

test('delete-from-tvh: a recording TVHeadend no longer has is marked removed, not refused', async () => {
  await db('recordings').insert({ recording_id: 'r1', title: 'The Block', status: 'done', tvh_remove_pending_at: '2026-11-01T00:00:00.000Z' })
  const res = await post('/api/recordings/r1/delete-from-tvh')
  assert.equal(res.status, 200)
  const row = await db('recordings').first()
  assert.ok(row.deleted_from_tvh_at)
  assert.equal(row.tvh_remove_pending_at, null)
})

test('library include: a recording removed from TVHeadend gives 409 and keeps its status', async () => {
  await db('recordings').insert({ recording_id: 'r1', title: 'The Block', status: 'pending', deleted_from_tvh_at: '2026-10-01T00:00:00.000Z' })
  const res = await post('/api/recordings/r1/library', { choice: 'include' })
  assert.equal(res.status, 409)
  const row = await db('recordings').first()
  assert.equal(row.status, 'pending')
  assert.notEqual(row.library_choice, 'include')
  assert.deepEqual(syncs, [])
})

test('library include: asks for a follow-up sync when one is already running', async () => {
  await db('recordings').insert({ recording_id: 'r1', title: 'The Block', status: 'not_imported' })
  const res = await post('/api/recordings/r1/library', { choice: 'include' })
  assert.equal(res.status, 200)
  assert.deepEqual(syncs, [{ trigger: 'manual:import', followUp: true }])
})
