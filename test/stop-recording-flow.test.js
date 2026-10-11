import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-stop-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { cancelRecording, disableSeriesTag } = await import('../src/tvheadend.js')
const { db } = await import('../src/db.js')

const MINUTE_S = 60
const NOW_S = 1_790_000_000
const NOW_MS = NOW_S * 1000
const RETAIN_FOREVER = 2147483647

const tvh = { upcoming: [], autorecs: [], posts: [] }

const recordingEntry = ({ uuid, recordedMinutes, autorec = '' }) => ({
  uuid,
  disp_title: 'Sunrise',
  channel: 'ch-7',
  broadcast: 900,
  start: NOW_S - 60 * MINUTE_S,
  start_real: NOW_S - 62 * MINUTE_S,
  create: NOW_S - recordedMinutes * MINUTE_S,
  stop: NOW_S + 60 * MINUTE_S,
  sched_status: 'recording',
  autorec,
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
      '/api/dvr/entry/grid_upcoming': { entries: tvh.upcoming },
      '/api/dvr/autorec/grid': { entries: tvh.autorecs },
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(bodies[url.pathname] || {}))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  await db.migrate.latest()
  await db('settings').insert({ key: 'tvh_url', value: `http://127.0.0.1:${server.address().port}` })
})

after(async () => {
  await db.destroy()
  await new Promise((resolve) => server.close(resolve))
  await fs.rm(tmpDir, { recursive: true, force: true })
})

beforeEach(() => {
  tvh.upcoming = []
  tvh.autorecs = []
  tvh.posts = []
})

test('cancelRecording: stops a recording of five minutes or more and keeps it', async () => {
  tvh.upcoming = [recordingEntry({ uuid: 'rec', recordedMinutes: 12, autorec: 'rule' })]
  const result = await cancelRecording({ programId: 900, nowMs: NOW_MS })
  assert.equal(result.kept, true)
  assert.equal(result.recordedMs, 12 * MINUTE_S * 1000)
  assert.deepEqual(postedCalls(), [['/api/dvr/entry/stop', 'rec']])
})

test('cancelRecording: deletes a short series episode but keeps its history entry', async () => {
  tvh.upcoming = [recordingEntry({ uuid: 'rec', recordedMinutes: 2, autorec: 'rule' })]
  const result = await cancelRecording({ programId: 900, nowMs: NOW_MS })
  assert.equal(result.kept, false)
  assert.deepEqual(postedCalls(), [
    ['/api/dvr/entry/stop', 'rec'],
    ['/api/idnode/save', { uuid: 'rec', retention: RETAIN_FOREVER }],
    ['/api/dvr/entry/prevrec/set', 'rec'],
    ['/api/dvr/entry/remove', 'rec'],
  ])
})

test('cancelRecording: deletes a short one-off outright', async () => {
  tvh.upcoming = [recordingEntry({ uuid: 'rec', recordedMinutes: 2 })]
  const result = await cancelRecording({ programId: 900, nowMs: NOW_MS })
  assert.equal(result.kept, false)
  assert.deepEqual(postedCalls(), [['/api/dvr/entry/stop', 'rec'], ['/api/dvr/entry/remove', 'rec']])
})

test('disableSeriesTag: deletes the rule first, then stops the episode on now', async () => {
  tvh.autorecs = [{ uuid: 'rule', title: 'Sunrise', channel: 'ch-7' }]
  tvh.upcoming = [
    recordingEntry({ uuid: 'rec', recordedMinutes: 2, autorec: 'rule' }),
    recordingEntry({ uuid: 'other', recordedMinutes: 2, autorec: 'other-rule' }),
  ]
  const result = await disableSeriesTag({ seriesLinkId: 'rule', stopRecordingNow: true, nowMs: NOW_MS })
  assert.equal(result.title, 'Sunrise')
  assert.deepEqual(result.stopped.map((s) => [s.uuid, s.kept]), [['rec', false]])
  assert.deepEqual(postedCalls(), [
    ['/api/idnode/delete', 'rule'],
    ['/api/dvr/entry/stop', 'rec'],
    ['/api/dvr/entry/remove', 'rec'],
  ])
})

test('disableSeriesTag: leaves the episode on now recording unless asked', async () => {
  tvh.autorecs = [{ uuid: 'rule', title: 'Sunrise', channel: 'ch-7' }]
  tvh.upcoming = [recordingEntry({ uuid: 'rec', recordedMinutes: 2, autorec: 'rule' })]
  const result = await disableSeriesTag({ seriesLinkId: 'rule', nowMs: NOW_MS })
  assert.deepEqual(result.stopped, [])
  assert.deepEqual(postedCalls(), [['/api/idnode/delete', 'rule']])
})
