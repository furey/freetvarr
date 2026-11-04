import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-cancel-series-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { cancelSeriesRules } = await import('../src/epg.js')
const { db, setSetting } = await import('../src/db.js')

const NOW_S = Math.floor(Date.now() / 1000)
const tvh = { autorecs: [], upcoming: [], posts: [], failStop: false }

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://tvh')
  let body = ''
  for await (const chunk of req) body += chunk
  if (req.method === 'POST') tvh.posts.push([pathname, new URLSearchParams(body).get('uuid')])
  res.setHeader('Content-Type', 'application/json')
  if (pathname === '/api/dvr/autorec/grid') return res.end(JSON.stringify({ entries: tvh.autorecs }))
  if (pathname === '/api/dvr/entry/grid_upcoming') return res.end(JSON.stringify({ entries: tvh.upcoming }))
  if (pathname === '/api/idnode/delete') {
    const uuid = new URLSearchParams(body).get('uuid')
    tvh.autorecs = tvh.autorecs.filter((a) => a.uuid !== uuid)
    return res.end('{}')
  }
  if (pathname === '/api/dvr/entry/stop' && tvh.failStop) {
    res.statusCode = 500
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
  tvh.autorecs = [
    { uuid: 'rule-a', title: '^The Chase( ?[:(-].*)?$', name: 'The Chase', channel: 'c1' },
    { uuid: 'rule-b', title: '^Hard Quiz( ?[:(-].*)?$', name: 'Hard Quiz', channel: 'c1' },
  ]
  tvh.upcoming = [{ uuid: 'on-now', autorec: 'rule-a', disp_title: 'The Chase', sched_status: 'recording', start: NOW_S - 600, stop: NOW_S + 1200, start_real: NOW_S - 720 }]
  tvh.posts = []
  tvh.failStop = false
})

after(async () => {
  server.close()
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

test('cancelSeriesRules: a stop that fails is reported, and the other rules still cancel', async () => {
  tvh.failStop = true
  const result = await cancelSeriesRules({ seriesLinkIds: ['c1|the chase', 'c1|hard quiz'], stopRecordingNow: true })
  assert.deepEqual(result.stopFailed, ['on-now'])
  assert.deepEqual(result.cancelled.map((c) => c.uuid), ['rule-a', 'rule-b'])
  assert.deepEqual(tvh.autorecs, [])
})

test('cancelSeriesRules: a retry after the rule is gone counts it as cancelled', async () => {
  tvh.autorecs = tvh.autorecs.filter((a) => a.uuid !== 'rule-a')
  const result = await cancelSeriesRules({ seriesLinkIds: ['c1|the chase', 'c1|hard quiz'] })
  assert.deepEqual(result.cancelled.map((c) => [c.seriesLinkId, Boolean(c.alreadyCancelled)]), [
    ['c1|the chase', true],
    ['c1|hard quiz', false],
  ])
  assert.deepEqual(tvh.autorecs, [])
})
