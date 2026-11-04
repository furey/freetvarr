import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-recordings-root-')))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { startSync, getActiveSyncId } = await import('../src/sync.js')
const { db } = await import('../src/db.js')

const RECORDINGS_ROOT = path.join(tmpDir, 'recordings')
const MEDIA_ROOT = path.join(tmpDir, 'tv')
const ONEOFF_ROOT = path.join(tmpDir, 'one-offs')
const OUTSIDE = path.join(tmpDir, 'outside')

const tvh = { finished: [] }

const recording = (uuid, filename) => ({
  uuid,
  disp_title: 'Gardening Australia',
  disp_subtitle: '',
  episode_disp: '',
  channel: 'ch-2',
  channelname: 'ABC',
  start: 1_792_744_200,
  stop: 1_792_747_800,
  sched_status: 'completed',
  status: 'Completed OK',
  genre: [],
  filename,
  filesize: 5,
})

let server

before(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
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
  await Promise.all([RECORDINGS_ROOT, MEDIA_ROOT, ONEOFF_ROOT, OUTSIDE].map((folder) => fs.mkdir(folder, { recursive: true })))
})

after(async () => {
  await db.destroy()
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
  await fs.rm(tmpDir, { recursive: true, force: true })
})

beforeEach(async () => {
  tvh.finished = []
  await db('recordings').delete()
})

const runSync = async () => {
  const identityFor = async () => ({ state: 'none', identity: null, candidates: [] })
  const { syncId } = await startSync({ trigger: 'manual', identityFor })
  while (getActiveSyncId() === syncId) await new Promise((resolve) => setTimeout(resolve, 10))
  return JSON.parse((await db('syncs').where({ id: syncId }).first()).summary_json)
}

const filesUnder = async (root) => (await fs.readdir(root, { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile())

test('sync: imports only files whose real path stays inside the recordings folder', async () => {
  await fs.writeFile(path.join(OUTSIDE, 'other.ts'), 'video')
  await fs.symlink(path.join(OUTSIDE, 'other.ts'), path.join(RECORDINGS_ROOT, 'linked.ts'))
  tvh.finished.push(recording('linked-1', '/recordings/linked.ts'))
  const summary = await runSync()
  assert.equal(summary.imported, 0)
  const row = await db('recordings').where({ recording_id: 'linked-1' }).first()
  assert.equal(row.status, 'skipped')
  assert.match(row.error, /outside the recordings folder/)
  assert.deepEqual(await filesUnder(MEDIA_ROOT), [])
  assert.deepEqual(await filesUnder(ONEOFF_ROOT), [])
})

test('sync: still imports a normal recording inside the recordings folder', async () => {
  await fs.writeFile(path.join(RECORDINGS_ROOT, 'normal.ts'), 'video')
  tvh.finished.push(recording('normal-1', '/recordings/normal.ts'))
  const summary = await runSync()
  assert.equal(summary.imported, 1)
})
