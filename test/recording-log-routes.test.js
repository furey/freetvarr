import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import express from 'express'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-log-routes-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')
const { clearableRows, mountRecordingLogRoutes, whereInLog } = await import('../src/recording-log-routes.js')
const { isLibraryMember } = await import('../src/library.js')

const passThrough = (req, res, next) => next()
const REMOVED_AT = '2026-10-12T11:03:00.000Z'
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

const recording = (overrides) => ({
  title: 'My Kitchen Rules',
  season: 16,
  episode: 6,
  status: 'done',
  file_path: '/media/tv/My Kitchen Rules/Season 16/My Kitchen Rules - S16E06.ts',
  deleted_from_tvh_at: REMOVED_AT,
  ...overrides,
})

const rowOf = (id) => db('recordings').where({ recording_id: id }).first()

before(async () => {
  await db.migrate.latest()
  const app = express()
  app.use(express.json())
  mountRecordingLogRoutes({ app, csrf: passThrough })
  appServer = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => appServer.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${appServer.address().port}`
})

beforeEach(async () => {
  await db('recordings').delete()
  await db('recordings').insert([
    recording({ recording_id: 'imported' }),
    recording({ recording_id: 'failed', status: 'failed', file_path: null }),
    recording({ recording_id: 'on-tvh', deleted_from_tvh_at: null }),
  ])
})

after(async () => {
  appServer.close()
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

test('DELETE /api/recordings: clears imported rows from the log and leaves them in the library', async () => {
  const { status, body } = await call('DELETE', '/api/recordings?deleted=true')
  assert.equal(status, 200)
  assert.deepEqual(body.ids.sort(), ['failed', 'imported'])
  const imported = await rowOf('imported')
  assert.ok(imported.log_cleared_at)
  assert.equal(imported.purged_at, null)
  assert.equal(isLibraryMember(imported), true)
  const failed = await rowOf('failed')
  assert.ok(failed.purged_at)
  assert.equal(failed.log_cleared_at, null)
  assert.equal((await rowOf('on-tvh')).log_cleared_at, null)
  assert.deepEqual(await clearableRows().pluck('recording_id'), [])
  assert.deepEqual(await whereInLog(db('recordings')).pluck('recording_id'), ['on-tvh'])
})

test('DELETE /api/recordings/:id: clears one imported row from the log and keeps it in the library', async () => {
  const { status } = await call('DELETE', '/api/recordings/imported')
  assert.equal(status, 200)
  const row = await rowOf('imported')
  assert.ok(row.log_cleared_at)
  assert.equal(isLibraryMember(row), true)
  assert.equal((await call('DELETE', '/api/recordings/on-tvh')).status, 409)
})

test('POST /api/recordings/restore: Undo puts cleared rows back in the log', async () => {
  const { body } = await call('DELETE', '/api/recordings?deleted=true')
  const restored = await call('POST', '/api/recordings/restore', { ids: body.ids })
  assert.equal(restored.body.restored, 2)
  for (const id of ['imported', 'failed']) {
    const row = await rowOf(id)
    assert.equal(row.log_cleared_at, null)
    assert.equal(row.purged_at, null)
  }
})
