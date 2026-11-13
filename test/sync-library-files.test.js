import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-sync-files-')))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { startSync, getActiveSyncId, recordingPicturesIdle } = await import('../src/sync.js')
const { db } = await import('../src/db.js')

const RECORDINGS_ROOT = path.join(tmpDir, 'recordings')
const MEDIA_ROOT = path.join(tmpDir, 'tv')
const ONEOFF_ROOT = path.join(tmpDir, 'one-offs')
const PLANNED = path.join(MEDIA_ROOT, 'Gardening Australia', 'Season 03', 'Gardening Australia - S03E04 - Ep.ts')
const PNG = Buffer.from('89504e470d0a1a0a', 'hex')

const tvh = { finished: [], posts: [], imageRequests: 0, imageFails: 0, hanging: [] }

const entry = (uuid, overrides = {}) => ({
  uuid,
  disp_title: 'Gardening Australia',
  disp_subtitle: 'Ep',
  episode_disp: 'Season 3.Episode 4',
  channel: 'ch-2',
  channelname: 'ABC TV',
  start: 1_792_744_200,
  stop: 1_792_747_800,
  sched_status: 'completed',
  status: 'Completed OK',
  genre: [],
  filename: `/recordings/${uuid}.ts`,
  filesize: 5,
  ...overrides,
})

let server

before(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    if (req.method === 'POST') tvh.posts.push(url.pathname)
    if (url.pathname === '/imagecache/hang') {
      tvh.hanging.push(res)
      return
    }
    if (url.pathname === '/imagecache/814112_default_program_image.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' })
      return res.end(PNG)
    }
    if (url.pathname.startsWith('/imagecache/')) {
      tvh.imageRequests += 1
      if (tvh.imageRequests <= tvh.imageFails) return req.socket.destroy()
      res.writeHead(200, { 'Content-Type': 'image/png' })
      return res.end(PNG)
    }
    const bodies = { '/api/dvr/entry/grid_finished': { entries: tvh.finished } }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(bodies[url.pathname] || { entries: [] }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  await db.migrate.latest()
  await db('settings').insert([
    { key: 'tvh_url', value: `http://127.0.0.1:${server.address().port}` },
    { key: 'recordings_root', value: RECORDINGS_ROOT },
    { key: 'tvh_recordings_path', value: '/recordings' },
    { key: 'media_root', value: MEDIA_ROOT },
    { key: 'oneoff_root', value: ONEOFF_ROOT },
  ])
})

after(async () => {
  await fs.chmod(MEDIA_ROOT, 0o755).catch(() => {})
  await db.destroy()
  await new Promise((resolve) => server.close(resolve))
  await fs.rm(tmpDir, { recursive: true, force: true })
})

beforeEach(async () => {
  Object.assign(tvh, { finished: [], posts: [], imageRequests: 0, imageFails: 0, hanging: [] })
  await db('recordings').delete()
  await db('shows').delete()
  await db('settings').where({ key: 'import_unmatched' }).delete()
  await fs.rm(MEDIA_ROOT, { recursive: true, force: true })
  await fs.rm(RECORDINGS_ROOT, { recursive: true, force: true })
  await Promise.all([RECORDINGS_ROOT, MEDIA_ROOT, ONEOFF_ROOT].map((folder) => fs.mkdir(folder, { recursive: true })))
})

const identityFor = async () => ({ state: 'none', identity: null, candidates: [] })

const runImports = async () => {
  const { syncId } = await startSync({ trigger: 'manual', identityFor })
  while (getActiveSyncId() === syncId) await new Promise((resolve) => setTimeout(resolve, 10))
  return JSON.parse((await db('syncs').where({ id: syncId }).first()).summary_json)
}

const runSync = async () => {
  const summary = await runImports()
  await recordingPicturesIdle()
  return summary
}

const record = async (uuid, overrides) => {
  tvh.finished.push(entry(uuid, overrides))
  await fs.writeFile(path.join(RECORDINGS_ROOT, `${uuid}.ts`), 'video')
}

const addShow = (fields = {}) =>
  db('shows').insert({ show_pattern: 'Gardening Australia', dest_folder: 'Gardening Australia', origin: 'user', enabled: true, ...fields })

const rowOf = (recordingId) => db('recordings').where({ recording_id: recordingId }).first()

const exists = (file) => fs.access(file).then(() => true, () => false)

test('sync: a TV import with a missing TV folder is skipped and makes no folder', async () => {
  await addShow()
  await record('g1')
  await fs.rm(MEDIA_ROOT, { recursive: true })
  await runSync()
  const row = await rowOf('g1')
  assert.equal(row.status, 'skipped')
  assert.equal(row.file_path, null)
  assert.match(row.error, /TV folder .* not found/)
  assert.equal(await exists(MEDIA_ROOT), false)
})

test('sync: an empty TV folder with imported rows in it skips the import and the removal', async () => {
  await addShow({ delete_after_import: true })
  await db('recordings').insert({ recording_id: 'old', title: 'Gardening Australia', status: 'done', file_path: path.join(MEDIA_ROOT, 'Gardening Australia', 'Season 03', 'old.ts') })
  await record('g1')
  await runSync()
  const row = await rowOf('g1')
  assert.equal(row.status, 'skipped')
  assert.match(row.error, /TV folder .* is empty/)
  assert.deepEqual(await fs.readdir(MEDIA_ROOT), [])
  assert.equal(tvh.posts.includes('/api/dvr/entry/remove'), false)
  assert.equal((await rowOf('old')).library_state, null)
})

test('sync: an import whose copy fails leaves the row failed with the error', async () => {
  await addShow()
  await record('g1')
  await fs.chmod(MEDIA_ROOT, 0o555)
  try {
    const summary = await runSync()
    assert.equal(summary.failed, 1)
  } finally {
    await fs.chmod(MEDIA_ROOT, 0o755)
  }
  const row = await rowOf('g1')
  assert.equal(row.status, 'failed')
  assert.equal(row.file_path, null)
  assert.match(row.error, /EACCES|permission/i)
})

test('sync: a path whose only owner is a deleted row with no file is free', async () => {
  await addShow()
  const now = new Date().toISOString()
  await db('recordings').insert({ recording_id: 'old', title: 'Gardening Australia', status: 'done', file_path: PLANNED, library_deleted_at: now, deleted_from_tvh_at: now, purged_at: now })
  await record('g2')
  await runSync()
  assert.equal((await rowOf('g2')).file_path, PLANNED)
  assert.equal((await rowOf('old')).file_path, null)
})

test('sync: a partial row keeps its library file when the TVHeadend file goes missing', async () => {
  await addShow()
  await fs.mkdir(path.dirname(PLANNED), { recursive: true })
  await fs.writeFile(PLANNED, 'vid')
  await db('recordings').insert({ recording_id: 'g3', title: 'Gardening Australia', status: 'partial', file_path: PLANNED })
  tvh.finished.push(entry('g3'))
  await runSync()
  const row = await rowOf('g3')
  assert.equal(row.status, 'partial')
  assert.equal(row.file_path, PLANNED)
  assert.match(row.error, /file not found/)
})

test('sync: a same-size file left at the planned path by a reset is used, not copied again', async () => {
  await addShow()
  await fs.mkdir(path.dirname(PLANNED), { recursive: true })
  await fs.writeFile(PLANNED, 'video')
  await record('g4')
  await runSync()
  const row = await rowOf('g4')
  assert.equal(row.status, 'done')
  assert.equal(row.file_path, PLANNED)
})

test('sync: a held recording cleared from the log comes back on the next sync', async () => {
  await db('settings').insert({ key: 'import_unmatched', value: 'false' })
  await record('held-1', { disp_title: 'Peppa Pig' })
  await runSync()
  assert.equal((await rowOf('held-1')).status, 'not_imported')
  await db('recordings').where({ recording_id: 'held-1' }).update({ purged_at: new Date().toISOString(), log_cleared_at: new Date().toISOString() })
  await runSync()
  const row = await rowOf('held-1')
  assert.equal(row.purged_at, null)
  assert.equal(row.log_cleared_at, null)
})

test('sync: a recording picture that failed to download is tried again next sync', async () => {
  await db('settings').insert({ key: 'import_unmatched', value: 'false' })
  tvh.imageFails = 1
  await record('pic-1', { disp_title: 'Peppa Pig', image: 'imagecache/7' })
  await runSync()
  assert.equal((await rowOf('pic-1')).image_checked_at, null)
  tvh.finished[0].image = 'imagecache/8'
  await runSync()
  const row = await rowOf('pic-1')
  assert.equal(tvh.imageRequests, 2)
  assert.equal(row.image_path, 'recordings/pic-1')
  assert.notEqual(row.image_checked_at, null)
})

test('sync: a picture that keeps failing stops being tried after a few syncs', async () => {
  await db('settings').insert({ key: 'import_unmatched', value: 'false' })
  tvh.imageFails = 100
  await record('pic-2', { disp_title: 'Peppa Pig', image: 'imagecache/9-0' })
  for (let n = 1; n < 3; n += 1) {
    await runSync()
    tvh.finished[0].image = `imagecache/9-${n}`
  }
  assert.equal((await rowOf('pic-2')).image_checked_at, null)
  for (let n = 3; n < 6; n += 1) {
    await runSync()
    tvh.finished[0].image = `imagecache/9-${n}`
  }
  assert.equal(tvh.imageRequests, 3)
  const row = await rowOf('pic-2')
  assert.notEqual(row.image_checked_at, null)
  assert.equal(row.image_path, null)
})

test('sync: a try that only met the recent-failure wait is not counted', async () => {
  await db('settings').insert({ key: 'import_unmatched', value: 'false' })
  tvh.imageFails = 100
  await record('pic-3', { disp_title: 'Peppa Pig', image: 'imagecache/recent' })
  for (let n = 0; n < 5; n += 1) await runSync()
  assert.equal(tvh.imageRequests, 1)
  assert.equal((await rowOf('pic-3')).image_checked_at, null)
})

test('sync: a hanging picture host does not delay imports', async () => {
  await db('settings').insert({ key: 'import_unmatched', value: 'false' })
  await record('pic-4', { disp_title: 'Peppa Pig', image: 'imagecache/hang' })
  const startedAt = Date.now()
  await runImports()
  assert.ok(Date.now() - startedAt < 2000, `imports took ${Date.now() - startedAt} ms`)
  const row = await rowOf('pic-4')
  assert.equal(row.status, 'not_imported')
  assert.equal(row.image_checked_at, null)
  while (!tvh.hanging.length) await new Promise((resolve) => setTimeout(resolve, 10))
  tvh.hanging.forEach((res) => res.destroy())
  await recordingPicturesIdle()
})

test('sync: a stand-in recording picture is never saved', async () => {
  await db('settings').insert({ key: 'import_unmatched', value: 'false' })
  await record('d86a4bc0f607885abd1c30ae34174c68', { disp_title: 'Big Brother', image: 'imagecache/814112_default_program_image.png' })
  await runSync()
  const row = await rowOf('d86a4bc0f607885abd1c30ae34174c68')
  assert.notEqual(row.image_checked_at, null)
  assert.equal(row.image_path, null)
})
