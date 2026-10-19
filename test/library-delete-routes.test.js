import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import express from 'express'

const tmpDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-delete-routes-')))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')
const { mountLibraryDeleteRoutes } = await import('../src/library-delete-routes.js')

const MEDIA_ROOT = path.join(tmpDir, 'media')
const RECORDINGS_ROOT = path.join(tmpDir, 'recordings')
const fake = { finished: [], active: [], posts: [] }

let fakeServer
let appServer
let baseUrl

const passThrough = (req, res, next) => next()

before(async () => {
  fakeServer = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    if (req.method === 'POST' || url.pathname.endsWith('/refresh')) fake.posts.push(url.pathname)
    const bodies = {
      '/api/dvr/entry/grid_finished': { entries: fake.finished },
      '/api/dvr/entry/grid_upcoming': { entries: fake.active },
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(bodies[url.pathname] || {}))
  })
  await new Promise((resolve) => fakeServer.listen(0, '127.0.0.1', resolve))
  const fakeUrl = `http://127.0.0.1:${fakeServer.address().port}`
  await db.migrate.latest()
  await db('settings').insert([
    { key: 'tvh_url', value: fakeUrl },
    { key: 'recordings_root', value: RECORDINGS_ROOT },
    { key: 'tvh_recordings_path', value: '/recordings' },
    { key: 'media_root', value: MEDIA_ROOT },
    { key: 'plex_url', value: fakeUrl },
    { key: 'plex_token', value: 'token' },
    { key: 'plex_tv_section_id', value: '7' },
  ])
  const app = express()
  app.use(express.json())
  mountLibraryDeleteRoutes({ app, csrf: passThrough, limiter: passThrough })
  appServer = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => appServer.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${appServer.address().port}`
})

after(async () => {
  await db.destroy()
  await new Promise((resolve) => fakeServer.close(resolve))
  await new Promise((resolve) => appServer.close(resolve))
  await fs.rm(tmpDir, { recursive: true, force: true })
})

beforeEach(async () => {
  fake.finished = []
  fake.active = []
  fake.posts = []
  await db('recordings').delete()
  await fs.rm(MEDIA_ROOT, { recursive: true, force: true })
  await fs.rm(RECORDINGS_ROOT, { recursive: true, force: true })
  await fs.mkdir(MEDIA_ROOT, { recursive: true })
  await fs.mkdir(RECORDINGS_ROOT, { recursive: true })
})

const post = async (route, body) => {
  const res = await fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

const importedEpisode = async ({ id, episode, watched = false }) => {
  const name = `The Block S22E${String(episode).padStart(2, '0')}.ts`
  const source = path.join(RECORDINGS_ROOT, `${id}.ts`)
  await fs.writeFile(source, 'x'.repeat(100))
  const filePath = path.join(MEDIA_ROOT, 'The Block', 'Season 22', name)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.link(source, filePath)
  await db('recordings').insert({
    recording_id: id,
    title: 'The Block',
    season: 22,
    episode,
    file_path: filePath,
    status: 'done',
    tvh_filename: `/recordings/${id}.ts`,
    watched_at: watched ? '2026-10-18T09:00:00.000Z' : null,
  })
  fake.finished.push({ uuid: id, disp_title: 'The Block', start: 1, stop: 2, sched_status: 'completed', filename: `/recordings/${id}.ts` })
  return { filePath, source }
}

test('preview: lists the watched episodes of a show with the space they free', async () => {
  await importedEpisode({ id: 'w1', episode: 1, watched: true })
  await importedEpisode({ id: 'u2', episode: 2 })
  const { status, body } = await post('/api/library/delete/preview', { show_key: 'the-block', scope: 'watched' })
  assert.equal(status, 200)
  assert.deepEqual(body, {
    count: 1,
    bytes: 100,
    missingCount: 0,
    items: [{ recordingId: 'w1', title: 'The Block', episodeTitle: null, season: 22, episode: 1, bytes: 100 }],
  })
  assert.deepEqual(fake.posts, [])
})

test('delete: removes library files and TVHeadend recordings, purges the rows and refreshes Plex once', async () => {
  const first = await importedEpisode({ id: 'a1', episode: 1 })
  await importedEpisode({ id: 'a2', episode: 2 })
  const { status, body } = await post('/api/library/delete', { show_key: 'the-block', scope: 'all', expected_count: 2 })
  assert.equal(status, 200)
  assert.deepEqual(body.results.map((r) => [r.recordingId, r.ok, r.library, r.tvh]), [
    ['a1', true, 'deleted', 'removed'],
    ['a2', true, 'deleted', 'removed'],
  ])
  assert.deepEqual(body.plex, { tv: { triggered: true, status: 200 } })
  assert.equal(fake.posts.filter((p) => p === '/library/sections/7/refresh').length, 1)
  assert.equal(fake.posts.filter((p) => p === '/api/dvr/entry/remove').length, 2)
  await assert.rejects(fs.access(first.filePath))
  await assert.rejects(fs.access(path.join(MEDIA_ROOT, 'The Block')))
  const rows = await db('recordings').orderBy('recording_id')
  for (const r of rows) {
    assert.ok(r.library_deleted_at)
    assert.ok(r.deleted_from_tvh_at)
    assert.ok(r.purged_at)
    assert.equal(r.library_choice, 'exclude')
  }
})

test('delete: a changed episode count is a conflict and deletes nothing', async () => {
  const { filePath } = await importedEpisode({ id: 'c1', episode: 1 })
  const { status, body } = await post('/api/library/delete', { recording_ids: ['c1'], expected_count: 2 })
  assert.equal(status, 409)
  assert.equal(body.count, 1)
  await fs.access(filePath)
})

test('delete: an episode being imported blocks the request', async () => {
  await importedEpisode({ id: 'i1', episode: 1 })
  await db('recordings').where({ recording_id: 'i1' }).update({ status: 'importing' })
  const { status, body } = await post('/api/library/delete', { recording_ids: ['i1'], expected_count: 1 })
  assert.equal(status, 409)
  assert.match(body.error, /still being imported/)
})

test('delete: a recording TVHeadend no longer has still succeeds; a still-recording one is refused with 207', async () => {
  await importedEpisode({ id: 'g1', episode: 1 })
  await importedEpisode({ id: 'live', episode: 2 })
  fake.finished = []
  fake.active = [{ uuid: 'live', disp_title: 'The Block', start: 1, stop: 2, sched_status: 'recording' }]
  const { status, body } = await post('/api/library/delete', { recording_ids: ['g1', 'live'], expected_count: 2 })
  assert.equal(status, 207)
  assert.deepEqual(body.results.map((r) => [r.recordingId, r.ok, r.library, r.tvh]), [
    ['g1', true, 'deleted', 'missing'],
    ['live', false, 'skipped', 'skipped'],
  ])
})

test('requests without ids or a valid scope, or without expected_count, are rejected', async () => {
  assert.equal((await post('/api/library/delete/preview', {})).status, 400)
  assert.equal((await post('/api/library/delete', { show_key: 'the-block', scope: 'all' })).status, 400)
})
