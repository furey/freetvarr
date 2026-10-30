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
const fake = { finished: [], active: [], posts: [], arr: [], sonarrFiles: [], sonarrDeleteStatus: 200 }

let fakeServer
let fakeUrl
let appServer
let baseUrl

const passThrough = (req, res, next) => next()

const answerSonarr = ({ req, res, url }) => {
  const route = url.pathname.replace('/sonarr', '')
  fake.arr.push(`${req.method} ${route}`)
  const reply = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  if (route === '/api/v3/series') return reply(200, [{ id: 3, path: '/tv/The Block' }, { id: 4, path: '/tv/Other Show' }])
  if (route === '/api/v3/episodefile') return reply(200, fake.sonarrFiles.filter((file) => String(file.seriesId) === url.searchParams.get('seriesId')))
  if (route === '/api/v3/episode') return reply(200, [{ id: 900, monitored: true }])
  if (route === '/api/v3/config/mediamanagement') return reply(200, { recycleBin: '' })
  if (req.method === 'PUT') return reply(202, {})
  if (req.method === 'DELETE') return reply(fake.sonarrDeleteStatus, {})
  return reply(404, {})
}

const SONARR_KEY = 'a'.repeat(32)

const connectSonarr = (url) => db('settings').insert([{ key: 'sonarr_url', value: url }, { key: 'sonarr_api_key', value: SONARR_KEY }])

before(async () => {
  fakeServer = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    if (url.pathname.startsWith('/sonarr/')) return answerSonarr({ req, res, url })
    if (req.method === 'POST' || url.pathname.endsWith('/refresh')) fake.posts.push(url.pathname)
    const bodies = {
      '/api/dvr/entry/grid_finished': { entries: fake.finished },
      '/api/dvr/entry/grid_upcoming': { entries: fake.active },
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(bodies[url.pathname] || {}))
  })
  await new Promise((resolve) => fakeServer.listen(0, '127.0.0.1', resolve))
  fakeUrl = `http://127.0.0.1:${fakeServer.address().port}`
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
  fake.arr = []
  fake.sonarrFiles = []
  fake.sonarrDeleteStatus = 200
  await db('settings').whereIn('key', ['sonarr_url', 'sonarr_api_key']).delete()
  await db('recordings').delete()
  await db('library_items').delete()
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
    items: [{
      recordingId: 'w1',
      title: 'The Block',
      episodeTitle: null,
      season: 22,
      episode: 1,
      bytes: 100,
      missing: false,
      recording: true,
      source: 'freetvarr',
      copies: [],
      canChoose: false,
      otherManager: null,
    }],
    recycleBin: { sonarr: null, radarr: null },
    unmonitor: true,
    sonarrSeries: [],
  })
  assert.deepEqual(fake.posts, [])
})

const plexOnlyFile = async ({ key = '77', episode = 1, bytes = 50 } = {}) => {
  const file = path.join(MEDIA_ROOT, 'Other Show', 'Season 01', `Other Show - S01E0${episode}.mkv`)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, 'x'.repeat(bytes))
  await db('library_items').insert({
    rating_key: key, part_id: `${key}0`, section_id: '7', kind: 'episode', show_title: 'Other Show', season: 1, episode, title: 'Pilot', file_path: file, size_bytes: bytes, seen_at: 1,
  })
  return file
}

test('delete: a Plex file no app manages is deleted from the disk, leaves the library, and refreshes its Plex library', async () => {
  const file = await plexOnlyFile()
  const preview = await post('/api/library/delete/preview', { recording_ids: ['plex-77'] })
  assert.equal(preview.status, 200)
  assert.equal(preview.body.count, 1)
  assert.deepEqual(preview.body.items[0].copies.map((copy) => [copy.route, copy.bytes, copy.hardlinked]), [['disk', 50, false]])
  const { status, body } = await post('/api/library/delete', { recording_ids: ['plex-77'], expected_count: 1 })
  assert.equal(status, 200)
  assert.equal(body.results[0].ok, true)
  assert.equal(body.bytesFreed, 50)
  await assert.rejects(fs.stat(file))
  assert.equal((await db('library_items').where({ rating_key: '77' })).length, 0)
  assert.ok(fake.posts.some((route) => route.endsWith('/library/sections/7/refresh')))
})

test('delete: a show scope includes its Plex episodes, and a missing file counts as done', async () => {
  const file = await plexOnlyFile({ key: '78', episode: 2 })
  await fs.rm(file)
  const preview = await post('/api/library/delete/preview', { show_key: 'other-show', scope: 'all' })
  assert.equal(preview.body.count, 1)
  assert.equal(preview.body.items[0].copies[0].missing, true)
  const { body } = await post('/api/library/delete', { show_key: 'other-show', scope: 'all', expected_count: 1 })
  assert.equal(body.results[0].ok, true)
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

test('delete: a recording Sonarr adopted is deleted through Sonarr, which stops monitoring it, and TVHeadend still removes it', async () => {
  await connectSonarr(`${fakeUrl}/sonarr`)
  await importedEpisode({ id: 's1', episode: 1 })
  fake.sonarrFiles = [{ id: 41, seriesId: 3, relativePath: 'Season 22/The Block S22E01.ts' }]
  const preview = await post('/api/library/delete/preview', { recording_ids: ['s1'] })
  assert.equal(preview.status, 200)
  assert.deepEqual(preview.body.items[0].copies.map((copy) => [copy.route, copy.recording, copy.bytes]), [['sonarr', true, 0]])
  assert.equal(preview.body.blocked, undefined)
  const { status, body } = await post('/api/library/delete', { recording_ids: ['s1'], expected_count: 1 })
  assert.equal(status, 200)
  assert.equal(body.results[0].ok, true)
  assert.deepEqual(body.results[0].copies.map((copy) => copy.route), ['sonarr'])
  assert.ok(fake.arr.includes('PUT /api/v3/episode/monitor'))
  assert.ok(fake.arr.includes('DELETE /api/v3/episodefile/41'))
  assert.equal(fake.posts.filter((p) => p === '/api/dvr/entry/remove').length, 1)
  assert.ok((await db('recordings').where({ recording_id: 's1' }).first()).purged_at)
})

test('delete: when Sonarr does not delete an adopted recording, Freetvarr keeps the recording and its file', async () => {
  await connectSonarr(`${fakeUrl}/sonarr`)
  const { filePath } = await importedEpisode({ id: 's2', episode: 1 })
  fake.sonarrFiles = [{ id: 42, seriesId: 3, relativePath: 'Season 22/The Block S22E01.ts' }]
  fake.sonarrDeleteStatus = 400
  const { status, body } = await post('/api/library/delete', { recording_ids: ['s2'], expected_count: 1 })
  assert.equal(status, 207)
  assert.equal(body.results[0].ok, false)
  assert.match(body.results[0].error, /Sonarr did not delete it/)
  await fs.access(filePath)
  assert.equal(fake.posts.filter((p) => p === '/api/dvr/entry/remove').length, 0)
  assert.equal((await db('recordings').where({ recording_id: 's2' }).first()).purged_at, null)
})

test('delete: a Plex file saved before Sonarr linked it is checked again and deleted through Sonarr, not from the disk', async () => {
  await connectSonarr(`${fakeUrl}/sonarr`)
  const file = await plexOnlyFile({ key: '80' })
  fake.sonarrFiles = [{ id: 51, seriesId: 4, relativePath: 'Season 01/Other Show - S01E01.mkv' }]
  const preview = await post('/api/library/delete/preview', { recording_ids: ['plex-80'] })
  assert.deepEqual(preview.body.items[0].copies.map((copy) => [copy.route, copy.manager]), [['sonarr', 'sonarr']])
  const { body } = await post('/api/library/delete', { recording_ids: ['plex-80'], expected_count: 1 })
  assert.equal(body.results[0].ok, true)
  assert.ok(fake.arr.includes('DELETE /api/v3/episodefile/51'))
  await fs.access(file)
})

test('delete: a Plex file Sonarr does not hold goes to the disk even when Sonarr is connected', async () => {
  await connectSonarr(`${fakeUrl}/sonarr`)
  const file = await plexOnlyFile({ key: '81' })
  const { body } = await post('/api/library/delete', { recording_ids: ['plex-81'], expected_count: 1 })
  assert.equal(body.results[0].ok, true)
  assert.deepEqual(body.results[0].copies.map((copy) => copy.route), ['disk'])
  await assert.rejects(fs.access(file))
})

test('delete: when Sonarr is connected but does not answer, the preview says so and the delete is refused', async () => {
  await connectSonarr('http://127.0.0.1:9/sonarr')
  const file = await plexOnlyFile({ key: '82' })
  const preview = await post('/api/library/delete/preview', { recording_ids: ['plex-82'] })
  assert.match(preview.body.blocked, /could not check whether Sonarr manages these files, so nothing was deleted/)
  const { status, body } = await post('/api/library/delete', { recording_ids: ['plex-82'], expected_count: 1 })
  assert.equal(status, 409)
  assert.match(body.error, /Try again when Sonarr answers/)
  await fs.access(file)
})
