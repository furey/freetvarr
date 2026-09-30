import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-remove-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { removeRecordings } = await import('../src/tvheadend.js')
const { startSync, getActiveSyncId } = await import('../src/sync.js')
const { db } = await import('../src/db.js')

const RECORDINGS_ROOT = path.join(tmpDir, 'recordings')
const MEDIA_ROOT = path.join(tmpDir, 'media')
const RETAIN_FOREVER = '2147483647'

const tvh = { finished: [], upcoming: [], posts: [] }

const finishedEntry = (uuid, overrides = {}) => ({
  uuid,
  disp_title: 'The Block',
  disp_subtitle: 'Kids Room and Re-Do Room Week',
  episode_disp: 'Season 22.Episode 35',
  channel: 'ch-9hd',
  start: 1_790_760_660,
  stop: 1_790_765_000,
  sched_status: 'completed',
  status: 'Completed OK',
  filename: `/recordings/${uuid}.ts`,
  filesize: 11,
  ...overrides,
})

const upcomingEntry = (uuid, overrides = {}) => ({
  uuid,
  disp_title: 'The Block',
  start: 1_790_847_060,
  stop: 1_790_851_000,
  sched_status: 'scheduled',
  parent: '',
  ...overrides,
})

const readForm = (req) => new Promise((resolve) => {
  let body = ''
  req.on('data', (chunk) => { body += chunk })
  req.on('end', () => resolve(Object.fromEntries(new URLSearchParams(body))))
})

const postedCalls = () => tvh.posts.map(({ path: p, form }) => {
  const node = form.node ? JSON.parse(form.node) : null
  return node ? [p, node] : [p, form.uuid]
})

let server

before(async () => {
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x')
    if (req.method === 'POST') tvh.posts.push({ path: url.pathname, form: await readForm(req) })
    const bodies = {
      '/api/dvr/entry/grid_finished': { entries: tvh.finished },
      '/api/dvr/entry/grid_upcoming': { entries: tvh.upcoming },
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(bodies[url.pathname] || {}))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  await db.migrate.latest()
  await db('settings').insert([
    { key: 'tvh_url', value: `http://127.0.0.1:${server.address().port}` },
    { key: 'recordings_root', value: RECORDINGS_ROOT },
    { key: 'tvh_recordings_path', value: '/recordings' },
    { key: 'media_root', value: MEDIA_ROOT },
  ])
  await db('shows').insert({
    id: 1, show_pattern: 'The Block', dest_folder: 'The Block', enabled: true, delete_after_import: true,
  })
  await fs.mkdir(RECORDINGS_ROOT, { recursive: true })
})

after(async () => {
  await db.destroy()
  await new Promise((resolve) => server.close(resolve))
  await fs.rm(tmpDir, { recursive: true, force: true })
})

beforeEach(async () => {
  tvh.finished = []
  tvh.upcoming = []
  tvh.posts = []
  await db('recordings').delete()
  await db('syncs').delete()
})

const runSync = async () => {
  const { syncId } = await startSync({ trigger: 'manual' })
  while (getActiveSyncId() === syncId) await new Promise((resolve) => setTimeout(resolve, 10))
  const row = await db('syncs').where({ id: syncId }).first()
  return JSON.parse(row.summary_json)
}

test('removeRecordings: keeps the entry forever, marks it previously recorded, then removes the file', async () => {
  tvh.finished = [finishedEntry('rec-1')]
  tvh.upcoming = [upcomingEntry('next-week')]
  const result = await removeRecordings({ recordingIds: ['rec-1'] })
  assert.deepEqual(result, { ok: true, removed: ['rec-1'], unknown: [] })
  assert.deepEqual(postedCalls(), [
    ['/api/idnode/save', { uuid: 'rec-1', retention: Number(RETAIN_FOREVER) }],
    ['/api/dvr/entry/prevrec/set', 'rec-1'],
    ['/api/dvr/entry/remove', 'rec-1'],
  ])
})

test('removeRecordings: deletes the re-record child before touching its parent', async () => {
  tvh.finished = [finishedEntry('rec-1', { sched_status: 'completedRerecord', child: 'rerecord-1' })]
  tvh.upcoming = [
    upcomingEntry('rerecord-1', { parent: 'rec-1' }),
    upcomingEntry('other-child', { parent: 'rec-9' }),
    upcomingEntry('next-week'),
  ]
  await removeRecordings({ recordingIds: ['rec-1'] })
  assert.deepEqual(postedCalls(), [
    ['/api/idnode/delete', 'rerecord-1'],
    ['/api/idnode/save', { uuid: 'rec-1', retention: Number(RETAIN_FOREVER) }],
    ['/api/dvr/entry/prevrec/set', 'rec-1'],
    ['/api/dvr/entry/remove', 'rec-1'],
  ])
})

test('removeRecordings: refuses entries that are not finished recordings', async () => {
  tvh.upcoming = [upcomingEntry('rec-1')]
  await assert.rejects(removeRecordings({ recordingIds: ['rec-1'] }), { code: 'not-found' })
  assert.deepEqual(tvh.posts, [])
})

test('sync: removes an imported recording from TVHeadend', async () => {
  await fs.writeFile(path.join(RECORDINGS_ROOT, 'rec-1.ts'), 'mpeg-ts-ok')
  tvh.finished = [finishedEntry('rec-1', { filesize: 10 })]
  const summary = await runSync()
  assert.equal(summary.imported, 1)
  assert.deepEqual(summary.delete.removed, ['rec-1'])
  assert.deepEqual(postedCalls().map(([p]) => p), [
    '/api/idnode/save',
    '/api/dvr/entry/prevrec/set',
    '/api/dvr/entry/remove',
  ])
  const row = await db('recordings').where({ recording_id: 'rec-1' }).first()
  assert.ok(row.deleted_from_tvh_at)
})

test('sync: leaves TVHeadend alone when the import fails', async () => {
  tvh.finished = [finishedEntry('missing-file')]
  const summary = await runSync()
  assert.equal(summary.imported, 0)
  assert.equal(summary.delete, undefined)
  assert.deepEqual(tvh.posts, [])
})
