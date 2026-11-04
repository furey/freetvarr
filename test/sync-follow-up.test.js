import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-follow-up-')))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { startSync, getActiveSyncId } = await import('../src/sync.js')
const { db } = await import('../src/db.js')

const RECORDINGS_ROOT = path.join(tmpDir, 'recordings')
const MEDIA_ROOT = path.join(tmpDir, 'tv')
const ONEOFF_ROOT = path.join(tmpDir, 'one-offs')
const tvh = { finished: [], finishedCalls: 0, duringRemoval: null }

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
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x')
    if (url.pathname === '/api/dvr/entry/grid_finished') {
      tvh.finishedCalls++
      if (tvh.finishedCalls === 2 && tvh.duringRemoval) await tvh.duringRemoval()
    }
    const bodies = { '/api/dvr/entry/grid_finished': { entries: tvh.finished, total: tvh.finished.length } }
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
    { key: 'import_unmatched', value: 'false' },
  ])
  await Promise.all([RECORDINGS_ROOT, MEDIA_ROOT, ONEOFF_ROOT].map((folder) => fs.mkdir(folder, { recursive: true })))
})

after(async () => {
  await db.destroy()
  await new Promise((resolve) => server.close(resolve))
  await fs.rm(tmpDir, { recursive: true, force: true })
})

const none = async () => ({ state: 'none', identity: null, candidates: [] })

const settled = async () => {
  for (let tries = 0; tries < 300; tries++) {
    await new Promise((resolve) => setTimeout(resolve, 10))
    if (getActiveSyncId() == null) {
      await new Promise((resolve) => setTimeout(resolve, 30))
      if (getActiveSyncId() == null) return
    }
  }
}

test('sync: an include sent while a sync runs imports the recording in a follow-up sync', async () => {
  await db('shows').insert({ show_pattern: 'Gardening Australia', dest_folder: 'Gardening Australia', origin: 'user', enabled: true, delete_after_import: true })
  tvh.finished.push(entry('a1'), entry('b1', { disp_title: 'Other Thing', episode_disp: '' }))
  await fs.writeFile(path.join(RECORDINGS_ROOT, 'a1.ts'), 'video')
  await fs.writeFile(path.join(RECORDINGS_ROOT, 'b1.ts'), 'video')
  let second
  tvh.duringRemoval = async () => {
    await db('recordings').where({ recording_id: 'b1' }).update({ library_choice: 'include', status: 'pending', error: null })
    second = await startSync({ trigger: 'manual:import', followUp: true })
  }
  await startSync({ trigger: 'manual', identityFor: none })
  await settled()
  assert.equal(second.alreadyRunning, true)
  const b = await db('recordings').where({ recording_id: 'b1' }).first()
  assert.equal(b.library_choice, 'include')
  assert.equal(b.status, 'done')
  const triggers = (await db('syncs').orderBy('id').select('summary_json')).map((row) => JSON.parse(row.summary_json).trigger)
  assert.deepEqual(triggers, ['manual', 'manual:import'])
})
