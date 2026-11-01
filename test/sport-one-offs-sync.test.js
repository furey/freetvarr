import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-sport-')))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { startSync, getActiveSyncId } = await import('../src/sync.js')
const { db } = await import('../src/db.js')

const RECORDINGS_ROOT = path.join(tmpDir, 'recordings')
const MEDIA_ROOT = path.join(tmpDir, 'tv')
const ONEOFF_ROOT = path.join(tmpDir, 'one-offs')

const tvh = { finished: [] }

const game = (uuid, overrides = {}) => ({
  uuid,
  disp_title: 'AFLW',
  disp_subtitle: 'Rnd 12: GWS v Gold Coast',
  episode_disp: 'Season 26.Episode 125',
  channel: 'ch-7',
  channelname: '7 Sydney',
  start: 1_792_744_200,
  stop: 1_792_753_200,
  sched_status: 'completed',
  status: 'Completed OK',
  genre: [0x40],
  filename: `/recordings/${uuid}.ts`,
  filesize: 5,
  ...overrides,
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
  await Promise.all([RECORDINGS_ROOT, MEDIA_ROOT, ONEOFF_ROOT].map((folder) => fs.mkdir(folder, { recursive: true })))
})

after(async () => {
  await db.destroy()
  await new Promise((resolve) => server.close(resolve))
  await fs.rm(tmpDir, { recursive: true, force: true })
})

beforeEach(async () => {
  tvh.finished = []
  await db('recordings').delete()
  await db('shows').delete()
  await db('series_evidence').delete()
})

const runSync = async (identityFor) => {
  const { syncId } = await startSync({ trigger: 'manual', identityFor })
  while (getActiveSyncId() === syncId) await new Promise((resolve) => setTimeout(resolve, 10))
  return JSON.parse((await db('syncs').where({ id: syncId }).first()).summary_json)
}

const recordGame = async (uuid, overrides) => {
  tvh.finished.push(game(uuid, overrides))
  await fs.writeFile(path.join(RECORDINGS_ROOT, `${uuid}.ts`), 'video')
}

test('sync: a sport title with no database id is looked up first, filed in One-offs, and gets no title match', async () => {
  await recordGame('aflw-125')
  const asked = []
  const identityFor = async (request) => {
    asked.push({ title: request.title, wait: request.wait, shows: (await db('shows')).length })
    return { state: 'none', identity: null, candidates: [] }
  }
  const summary = await runSync(identityFor)
  assert.equal(summary.imported, 1)
  assert.deepEqual(asked, [{ title: 'AFLW', wait: 5000, shows: 0 }])
  const row = await db('recordings').where({ recording_id: 'aflw-125' }).first()
  assert.ok(row.file_path.startsWith(`${ONEOFF_ROOT}${path.sep}`))
  assert.equal(row.show_id, null)
  assert.equal((await db('shows')).length, 0)
  assert.equal((await db('series_evidence').where({ show_key: 'aflw' }).first()).database_ids, 'none')
})

test('sync: a sport title with a TVDB id is filed in TV under a new automatic title match', async () => {
  await recordGame('offsiders-1', { disp_title: 'Offsiders', disp_subtitle: '', episode_disp: 'Season 21.Episode 30' })
  const identityFor = async () => ({ state: 'matched', identity: { tvmazeId: '5', name: 'Offsiders', tvdbId: '80577', tmdbId: null }, candidates: [] })
  await runSync(identityFor)
  const row = await db('recordings').where({ recording_id: 'offsiders-1' }).first()
  assert.ok(row.file_path.startsWith(`${MEDIA_ROOT}${path.sep}`))
  const show = await db('shows').first()
  assert.equal(show.origin, 'auto')
  assert.equal((await db('series_evidence').where({ show_key: 'offsiders' }).first()).database_ids, 'found')
})

test('sync: a disabled automatic title match does not pull the next game back into TV', async () => {
  await db('shows').insert({ show_pattern: 'AFLW', dest_folder: 'AFLW', origin: 'auto', enabled: false })
  await db('series_evidence').insert({ show_key: 'aflw', facts_json: '{}', database_ids: 'none', database_ids_at: Date.now(), updated_at: Date.now() })
  await recordGame('aflw-126', { disp_subtitle: 'Rnd 12: Carlton v Essendon', episode_disp: 'Season 26.Episode 126' })
  let lookups = 0
  await runSync(async () => {
    lookups++
    return { state: 'none', identity: null, candidates: [] }
  })
  const row = await db('recordings').where({ recording_id: 'aflw-126' }).first()
  assert.ok(row.file_path.startsWith(`${ONEOFF_ROOT}${path.sep}`))
  assert.equal(lookups, 0)
  assert.equal((await db('shows').where({ enabled: true })).length, 0)
})

test('sync: a lookup that is still running keeps the old filing', async () => {
  await recordGame('aflw-127', { episode_disp: 'Season 26.Episode 127' })
  await runSync(async () => ({ state: 'pending', identity: null, candidates: [] }))
  const row = await db('recordings').where({ recording_id: 'aflw-127' }).first()
  assert.ok(row.file_path.startsWith(`${MEDIA_ROOT}${path.sep}`))
  assert.equal((await db('shows').first()).origin, 'auto')
})

test('sync: a no-id answer older than 30 days is asked again, and a new TVDB id files the game in TV', async () => {
  const longAgo = Date.now() - 31 * 24 * 60 * 60 * 1000
  await db('series_evidence').insert({ show_key: 'aflw', facts_json: '{}', database_ids: 'none', database_ids_at: longAgo, updated_at: longAgo })
  await recordGame('aflw-128', { episode_disp: 'Season 26.Episode 128' })
  await runSync(async () => ({ state: 'matched', identity: { tvmazeId: '9', name: 'AFLW', tvdbId: '412345', tmdbId: null }, candidates: [] }))
  const row = await db('recordings').where({ recording_id: 'aflw-128' }).first()
  assert.ok(row.file_path.startsWith(`${MEDIA_ROOT}${path.sep}`))
  const fact = await db('series_evidence').where({ show_key: 'aflw' }).first()
  assert.equal(fact.database_ids, 'found')
  assert.ok(Number(fact.database_ids_at) > longAgo)
})

test('sync: the women\'s World Cup gets its own folder beside the men\'s automatic title match', async () => {
  const [menId] = await db('shows').insert({ show_pattern: 'Rugby League World Cup 2026', dest_folder: 'Rugby League World Cup 2026', origin: 'auto' })
  await db('series_evidence').insert({ show_key: 'women-s-rugby-league-world-cup-2026', facts_json: '{}', database_ids: 'found', database_ids_at: Date.now(), updated_at: Date.now() })
  await recordGame('wrlwc-1', { disp_title: 'Women\'s Rugby League World Cup 2026', episode_disp: 'Season 26.Episode 3' })
  await runSync(async () => ({ state: 'none', identity: null, candidates: [] }))
  const row = await db('recordings').where({ recording_id: 'wrlwc-1' }).first()
  assert.notEqual(row.show_id, menId)
  assert.ok(row.file_path.includes(`${path.sep}Women's Rugby League World Cup 2026${path.sep}`))
})
