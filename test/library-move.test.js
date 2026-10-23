import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import express from 'express'

const tmpDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-library-move-')))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')
const { mountLibraryRoutes } = await import('../src/library-routes.js')
const { getLibraryShows } = await import('../src/library.js')

const KIDS_ROOM = 'The Block - Kids Room and Re-Do Room Week'
const csrfCalls = []

let appServer
let baseUrl

const passThrough = (req, res, next) => next()
const countingCsrf = (req, res, next) => {
  csrfCalls.push(req.path)
  next()
}

const recording = (id, overrides = {}) => ({
  recording_id: id,
  title: 'The Block',
  status: 'done',
  season: 22,
  episode: 30,
  aired_at: Date.UTC(2026, 9, 1),
  ...overrides,
})

const move = async (body) => {
  const res = await fetch(`${baseUrl}/api/library/recordings/show`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

const overridesOf = async () => Object.fromEntries((await db('recordings').orderBy('recording_id').select('recording_id', 'show_title_override'))
  .map((row) => [row.recording_id, row.show_title_override]))

const showKeys = async () => (await getLibraryShows({
  loadSeries: async () => ({ series: [] }),
  loadRecordingNow: async () => [],
  loadFinishing: async () => [],
  loadMoviesRoot: async () => '',
  loadChoiceStamps: async () => new Map(),
})).shows.map((show) => `${show.key}:${show.counts.total}`).sort()

before(async () => {
  await db.migrate.latest()
  const app = express()
  app.use(express.json())
  mountLibraryRoutes({ app, csrf: countingCsrf, ruleLimiter: passThrough, watchedLimiter: passThrough, playbackSourceResolver: async () => async () => false, loadInProgressIds: async () => new Set(['dvr-live']) })
  appServer = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => appServer.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${appServer.address().port}`
})

beforeEach(async () => {
  csrfCalls.length = 0
  await db('recordings').del()
  await db('recordings').insert([
    recording('a', { episode: 37 }),
    recording('b', { title: KIDS_ROOM, episode: 36 }),
    recording('c', { title: KIDS_ROOM, episode: 35 }),
  ])
})

after(async () => {
  await db.destroy()
  await new Promise((resolve) => appServer.close(resolve))
  await fs.rm(tmpDir, { recursive: true, force: true })
})

test('POST /api/library/recordings/show moves recordings into a show and returns the old overrides', async () => {
  const { status, body } = await move({ ids: ['b', 'c'], title: ' The Block ' })
  assert.equal(status, 200)
  assert.deepEqual(body, { ok: true, title: 'The Block', previous: [{ id: 'b', title: null }, { id: 'c', title: null }] })
  assert.deepEqual(await overridesOf(), { a: null, b: 'The Block', c: 'The Block' })
  assert.deepEqual(await showKeys(), ['the-block:3'])
  assert.deepEqual(csrfCalls, ['/api/library/recordings/show'])
})

test('POST /api/library/recordings/show: undo with the old values puts the recordings back', async () => {
  await move({ ids: ['b'], title: 'Renovation Specials' })
  const { body } = await move({ ids: ['b', 'c'], title: 'The Block' })
  assert.deepEqual(body.previous, [{ id: 'b', title: 'Renovation Specials' }, { id: 'c', title: null }])
  await move({ ids: ['b'], title: 'Renovation Specials' })
  await move({ ids: ['c'], title: null })
  assert.deepEqual(await overridesOf(), { a: null, b: 'Renovation Specials', c: null })
  assert.deepEqual(await showKeys(), ['renovation-specials:1', 'the-block-kids-room-and-re-do-room-week:1', 'the-block:1'])
})

test('POST /api/library/recordings/show: a title that names the recording itself clears the override', async () => {
  await move({ ids: ['b'], title: 'The Block' })
  const { body } = await move({ ids: ['b'], title: 'the block - kids room and re-do room week' })
  assert.deepEqual(body.previous, [{ id: 'b', title: 'The Block' }])
  assert.deepEqual(await overridesOf(), { a: null, b: null, c: null })
})

test('POST /api/library/recordings/show: rejects bad ids and titles without changing anything', async () => {
  for (const bad of [{ ids: [], title: 'The Block' }, { ids: ['b'], title: '  ' }, { ids: ['b'] }, { ids: ['b'], title: 'x'.repeat(201) }, { ids: 'b', title: 'The Block' }]) {
    assert.equal((await move(bad)).status, 400)
  }
  const missing = await move({ ids: ['b', 'nope'], title: 'The Block' })
  assert.equal(missing.status, 404)
  assert.deepEqual(await overridesOf(), { a: null, b: null, c: null })
})

test('POST /api/library/recordings/show: skips a recording still in progress and moves the imported ones', async () => {
  const { status, body } = await move({ ids: ['b', 'dvr-live', 'c'], title: 'The Block' })
  assert.equal(status, 200)
  assert.deepEqual(body.previous, [{ id: 'b', title: null }, { id: 'c', title: null }])
  assert.deepEqual(await overridesOf(), { a: null, b: 'The Block', c: 'The Block' })
  assert.equal((await move({ ids: ['dvr-live'], title: 'The Block' })).status, 404)
})
