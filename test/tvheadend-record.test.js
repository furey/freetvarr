import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-record-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { scheduleRecording } = await import('../src/tvheadend.js')
const { recordProgram } = await import('../src/epg.js')
const { db, setSetting } = await import('../src/db.js')

const tvh = { upcoming: [], saves: [], creates: [], failSave: false }

const upcomingEntry = (overrides) => ({
  uuid: 'entry-1',
  broadcast: 4242,
  disp_title: 'The Chase',
  channel: 'c1',
  start: 1_794_385_800,
  stop: 1_794_389_400,
  sched_status: 'scheduled',
  enabled: true,
  start_extra: 5,
  stop_extra: 30,
  ...overrides,
})

const readBody = async (req) => {
  let body = ''
  for await (const chunk of req) body += chunk
  return new URLSearchParams(body)
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://tvh')
  const form = await readBody(req)
  res.setHeader('Content-Type', 'application/json')
  if (pathname === '/api/dvr/entry/grid_upcoming') return res.end(JSON.stringify({ entries: tvh.upcoming }))
  if (pathname === '/api/dvr/config/grid') return res.end(JSON.stringify({ entries: [{ uuid: 'cfg', name: '' }] }))
  if (pathname === '/api/dvr/entry/create_by_event') {
    tvh.creates.push(Object.fromEntries(form))
    return res.end(JSON.stringify({ uuid: ['created-1'] }))
  }
  if (pathname === '/api/idnode/save') {
    if (tvh.failSave) {
      res.statusCode = 500
      return res.end('{}')
    }
    tvh.saves.push(JSON.parse(form.get('node')))
    return res.end('{}')
  }
  res.end('{}')
})

before(async () => {
  await db.migrate.latest()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  await setSetting('tvh_url', `http://127.0.0.1:${server.address().port}`)
})

beforeEach(() => {
  tvh.upcoming = []
  tvh.saves = []
  tvh.creates = []
  tvh.failSave = false
})

after(async () => {
  server.close()
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

test('scheduleRecording: re-enabling a skipped series episode keeps its padding', async () => {
  tvh.upcoming = [upcomingEntry({ enabled: false })]
  const result = await scheduleRecording({ programId: 4242 })
  assert.equal(result.uuid, 'entry-1')
  assert.deepEqual(tvh.saves, [{ uuid: 'entry-1', enabled: true }])
  assert.deepEqual(tvh.creates, [])
})

test('scheduleRecording: re-enabling sends the padding the caller gave', async () => {
  tvh.upcoming = [upcomingEntry({ enabled: false })]
  await scheduleRecording({ programId: 4242, leadTime: 3, lagTime: 15 })
  assert.deepEqual(tvh.saves, [{ uuid: 'entry-1', enabled: true, start_extra: 3, stop_extra: 15 }])
})

test('scheduleRecording: a new recording gets the default padding', async () => {
  await scheduleRecording({ programId: 4242 })
  assert.equal(tvh.creates.length, 1)
  assert.deepEqual(tvh.saves, [{ uuid: 'created-1', start_extra: 2, stop_extra: 10 }])
})

test('scheduleRecording: a failed padding save still reports the recording as scheduled', async () => {
  tvh.failSave = true
  const result = await scheduleRecording({ programId: 4242 })
  assert.deepEqual(result, { ok: true, uuid: 'created-1', programId: 4242, paddingSaved: false })
})

test('scheduleRecording: an entry that is already scheduled is reused, with no second timer', async () => {
  tvh.upcoming = [upcomingEntry({ uuid: 'entry-2' })]
  const result = await scheduleRecording({ programId: 4242, leadTime: 4, lagTime: 20 })
  assert.equal(result.uuid, 'entry-2')
  assert.deepEqual(tvh.creates, [])
  assert.deepEqual(tvh.saves, [{ uuid: 'entry-2', start_extra: 4, stop_extra: 20 }])
})

test('recordProgram: a failed record still clears the recording state cache', async () => {
  const { getRecordingState } = await import('../src/epg.js')
  tvh.upcoming = [upcomingEntry({ enabled: false })]
  assert.deepEqual((await getRecordingState({ fresh: true })).futureRecordings, [])
  tvh.failSave = true
  await assert.rejects(recordProgram({ programId: 4242 }))
  tvh.failSave = false
  tvh.upcoming = [upcomingEntry({ uuid: 'entry-3' })]
  const state = await getRecordingState()
  assert.deepEqual(state.futureRecordings.map((r) => r.uuid), ['entry-3'])
})
