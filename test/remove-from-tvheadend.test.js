import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-remove-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { forgetPastAirings, listFinished, removeRecordings } = await import('../src/tvheadend.js')
const { startSync, getActiveSyncId, usePlaybackCheck } = await import('../src/sync.js')
const { db } = await import('../src/db.js')
const { activity } = await import('../src/activity.js')

const RECORDINGS_ROOT = path.join(tmpDir, 'recordings')
const MEDIA_ROOT = path.join(tmpDir, 'media')
const RETAIN_FOREVER = '2147483647'

const tvh = { finished: [], upcoming: [], removed: [], posts: [], failRemove: new Set(), plexStatus: 200 }

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
    if (url.pathname.startsWith('/library/sections/')) {
      res.writeHead(tvh.plexStatus)
      return res.end()
    }
    const form = req.method === 'POST' ? await readForm(req) : {}
    if (url.pathname === '/api/dvr/entry/remove' && tvh.failRemove.has(form.uuid)) {
      res.writeHead(500)
      return res.end()
    }
    if (req.method === 'POST') tvh.posts.push({ path: url.pathname, form })
    if (url.pathname === '/api/dvr/entry/grid_removed') tvh.removedReads++
    const page = (entries) => {
      const start = Number(url.searchParams.get('start') || 0)
      const limit = Number(url.searchParams.get('limit') || entries.length)
      return { entries: entries.slice(start, start + limit), total: entries.length }
    }
    const bodies = {
      '/api/dvr/entry/grid_finished': page(tvh.finished),
      '/api/dvr/entry/grid_upcoming': { entries: tvh.upcoming },
      '/api/dvr/entry/grid_removed': page(tvh.removed),
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
  await fs.mkdir(MEDIA_ROOT, { recursive: true })
})

after(async () => {
  await db.destroy()
  await new Promise((resolve) => server.close(resolve))
  await fs.rm(tmpDir, { recursive: true, force: true })
})

beforeEach(async () => {
  tvh.finished = []
  tvh.upcoming = []
  tvh.removed = []
  tvh.removedReads = 0
  forgetPastAirings()
  tvh.posts = []
  tvh.failRemove = new Set()
  tvh.plexStatus = 200
  usePlaybackCheck(() => false)
  await db('settings').whereIn('key', ['plex_url', 'plex_token', 'plex_tv_section_id']).delete()
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
  assert.deepEqual(result, { ok: true, removed: ['rec-1'], unknown: [], failed: [] })
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

test('sync: an import job names the show the library groups it under, with the episode as its subject', async () => {
  await fs.writeFile(path.join(RECORDINGS_ROOT, 'rec-7.ts'), 'mpeg-ts-ok')
  await db('recordings').insert({ recording_id: 'rec-7', title: 'The Block', show_title_override: 'The Block (AU)', status: 'failed' })
  tvh.finished = [finishedEntry('rec-7', { filesize: 10 })]
  await runSync()
  const run = activity.snapshot().recent.find((entry) => entry.kind === 'import' && entry.ref?.recordingId === 'rec-7')
  assert.equal(run.title, 'Import · The Block (AU)')
  assert.equal(run.subject.title, 'The Block (AU)')
  assert.equal(run.subject.season, 22)
  assert.equal(run.subject.episode, 35)
  assert.equal(run.subject.episodeTitle, 'Kids Room and Re-Do Room Week')
  assert.equal(run.subject.airedAt, 1_790_760_660_000)
  assert.equal(run.subject.film, false)
  assert.match(run.subject.file, /The Block - S22E35/)
})

test('sync: leaves TVHeadend alone when the import fails', async () => {
  tvh.finished = [finishedEntry('missing-file')]
  const summary = await runSync()
  assert.equal(summary.imported, 0)
  assert.equal(summary.delete, undefined)
  assert.deepEqual(tvh.posts, [])
})

const removeCalls = () => postedCalls().filter(([p]) => p === '/api/dvr/entry/remove').map(([, uuid]) => uuid)

const importable = async (uuid) => {
  await fs.writeFile(path.join(RECORDINGS_ROOT, `${uuid}.ts`), 'mpeg-ts-ok')
  return finishedEntry(uuid, { filesize: 10 })
}

test('removeRecordings: a failed removal does not stop the others, and is reported', async () => {
  tvh.finished = ['a', 'b', 'c'].map((uuid) => finishedEntry(uuid))
  tvh.failRemove = new Set(['b'])
  const result = await removeRecordings({ recordingIds: ['a', 'b', 'c'] })
  assert.deepEqual(result.removed, ['a', 'c'])
  assert.deepEqual(result.failed, ['b'])
})

test('removeRecordings: finds a recording past the first 5,000 finished entries', async () => {
  tvh.finished = Array.from({ length: 5001 }, (_, i) => finishedEntry(`rec-${i}`))
  const result = await removeRecordings({ recordingIds: ['rec-5000'] })
  assert.deepEqual(result.removed, ['rec-5000'])
  assert.deepEqual(removeCalls(), ['rec-5000'])
})

test('sync: a recording TVHeadend removed on its own is marked not in TVHeadend, but a missing file is not', async () => {
  await db('recordings').insert({ recording_id: 'gone', title: 'The Block', status: 'not_imported' })
  await db('recordings').insert({ recording_id: 'kept', title: 'The Block', status: 'not_imported' })
  await db('recordings').insert({ recording_id: 'unmounted', title: 'The Block', status: 'not_imported' })
  tvh.removed = [
    finishedEntry('gone', { status: 'Completed OK', fileremoved: 1 }),
    finishedEntry('unmounted', { status: 'File missing', fileremoved: 0 }),
  ]
  await runSync()
  const rows = Object.fromEntries((await db('recordings').select('recording_id', 'deleted_from_tvh_at')).map((r) => [r.recording_id, r.deleted_from_tvh_at]))
  assert.ok(rows.gone)
  assert.equal(rows.kept, null)
  assert.equal(rows.unmounted, null)
})

test('listFinished: reads every page of finished recordings, so the sync sees past 5,000', async () => {
  tvh.finished = Array.from({ length: 5001 }, (_, i) => finishedEntry(`rec-${i}`))
  const finished = await listFinished()
  assert.equal(finished.length, 5001)
  assert.equal(finished.at(-1).uuid, 'rec-5000')
})

test('sync: a removal that TVHeadend refused runs again in the next sync', async () => {
  tvh.finished = [await importable('rec-1')]
  tvh.failRemove = new Set(['rec-1'])
  const first = await runSync()
  assert.equal(first.imported, 1)
  const pending = await db('recordings').where({ recording_id: 'rec-1' }).first()
  assert.equal(pending.deleted_from_tvh_at, null)
  assert.ok(pending.tvh_remove_pending_at)
  tvh.failRemove = new Set()
  tvh.posts = []
  const second = await runSync()
  assert.deepEqual(second.delete.removed, ['rec-1'])
  const row = await db('recordings').where({ recording_id: 'rec-1' }).first()
  assert.ok(row.deleted_from_tvh_at)
  assert.equal(row.tvh_remove_pending_at, null)
})

test('sync: a remove skipped by the Plex guard runs in the next sync once Plex refreshes', async () => {
  await db('settings').insert([
    { key: 'plex_url', value: `http://127.0.0.1:${server.address().port}` },
    { key: 'plex_token', value: 'token' },
    { key: 'plex_tv_section_id', value: '7' },
  ])
  tvh.finished = [await importable('rec-1')]
  tvh.plexStatus = 500
  const first = await runSync()
  assert.equal(first.delete.skipped, true)
  assert.deepEqual(removeCalls(), [])
  tvh.plexStatus = 200
  const second = await runSync()
  assert.deepEqual(second.delete.removed, ['rec-1'])
  assert.deepEqual(removeCalls(), ['rec-1'])
})

test('sync: turning on Remove after import does not remove episodes imported earlier', async () => {
  await db('recordings').insert({ recording_id: 'earlier', title: 'The Block', status: 'done', show_id: 1 })
  tvh.finished = [finishedEntry('earlier')]
  const summary = await runSync()
  assert.equal(summary.delete, undefined)
  assert.deepEqual(removeCalls(), [])
})

test('sync: remove after import skips a recording with an active playback session, then removes it later', async () => {
  tvh.finished = [await importable('rec-1')]
  usePlaybackCheck((id) => id === 'rec-1')
  const first = await runSync()
  assert.equal(first.delete.skipped, true)
  assert.deepEqual(removeCalls(), [])
  usePlaybackCheck(() => false)
  const second = await runSync()
  assert.deepEqual(second.delete.removed, ['rec-1'])
})

test('sync: back-to-back syncs share one read of the removed recordings', async () => {
  tvh.removed = [finishedEntry('gone', { fileremoved: 1 })]
  await runSync()
  await runSync()
  assert.equal(tvh.removedReads, 1)
})
