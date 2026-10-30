import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-recording-now-restart-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { getRecordingNow, onRecordingFinished } = await import('../src/recording-now.js')
const { db } = await import('../src/db.js')

const MIN = 60_000
const T0 = 1_790_760_660_000

const tvh = { down: true, finished: [], requests: [] }

const endedEntry = (uuid, { stopMs, sched = 'completed', status = 'Completed OK', errorcode = 0 }) => ({
  uuid,
  start: (stopMs - 60 * MIN) / 1000,
  stop: (stopMs - 5 * MIN) / 1000,
  start_real: (stopMs - 62 * MIN) / 1000,
  stop_real: stopMs / 1000,
  channel: 'ch-9',
  channelname: '9HD Sydney',
  disp_title: `Show ${uuid}`,
  sched_status: sched,
  status,
  errorcode,
})

let server

before(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    tvh.requests.push(url.pathname)
    if (tvh.down) {
      res.writeHead(500)
      res.end()
      return
    }
    const bodies = {
      '/api/dvr/entry/grid_upcoming': { entries: [] },
      '/api/dvr/entry/grid_finished': { entries: tvh.finished },
      '/api/dvr/entry/grid_failed': { entries: [] },
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

test('getRecordingNow: while TVHeadend is down, failures are cached with a growing backoff', async () => {
  tvh.requests = []
  await assert.rejects(getRecordingNow({ nowMs: T0 }))
  const firstAttempt = tvh.requests.length
  assert.ok(firstAttempt > 0)
  await assert.rejects(getRecordingNow({ nowMs: T0 + 4000 }))
  assert.equal(tvh.requests.length, firstAttempt)
  await assert.rejects(getRecordingNow({ nowMs: T0 + 5000 }))
  assert.ok(tvh.requests.length > firstAttempt)
  const secondAttempt = tvh.requests.length
  await assert.rejects(getRecordingNow({ nowMs: T0 + 5000 + 9000 }))
  assert.equal(tvh.requests.length, secondAttempt)
})

test('getRecordingNow: recordings that ended while the server was stopped announce once, unless imported or failed', async () => {
  const nowMs = T0 + 60 * MIN
  tvh.down = false
  tvh.finished = [
    endedEntry('waiting', { stopMs: nowMs - 10 * MIN }),
    endedEntry('imported', { stopMs: nowMs - 20 * MIN }),
    endedEntry('broken', { stopMs: nowMs - 30 * MIN, sched: 'completedError', status: 'No input', errorcode: 5 }),
  ]
  await db('recordings').insert({ recording_id: 'imported', title: 'Show imported', status: 'done' })
  const announced = []
  const stop = onRecordingFinished((recording) => announced.push(recording.uuid))
  await getRecordingNow({ nowMs })
  await getRecordingNow({ nowMs: nowMs + 10_000 })
  stop()
  assert.deepEqual(announced, ['waiting'])
})
