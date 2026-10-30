import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-past-airings-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')
const { forgetPastAirings, getState, skipScheduledEntry } = await import('../src/tvheadend.js')

const PAGE = 5000
const tvh = { requests: [], finishedTotal: 1 }

const finished = (index) => ({ uuid: `f${index}`, disp_title: 'Hard Quiz', start: 1_790_000_000 + index, stop: 1_790_001_800 + index })

const finishedPage = (url) => {
  const start = Number(url.searchParams.get('start') || 0)
  const count = Math.max(0, Math.min(PAGE, tvh.finishedTotal - start))
  return { entries: Array.from({ length: count }, (_, at) => finished(start + at)), total: tvh.finishedTotal }
}

let server

before(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    tvh.requests.push(url.pathname)
    const bodies = {
      '/api/dvr/entry/grid_upcoming': () => ({ entries: [] }),
      '/api/dvr/autorec/grid': () => ({ entries: [{ uuid: 'a1', title: 'Hard Quiz', channel: 'abc', enabled: true }] }),
      '/api/dvr/entry/grid_finished': () => finishedPage(url),
      '/api/dvr/entry/grid_removed': () => ({ entries: [] }),
      '/api/dvr/entry/grid_failed': () => ({ entries: [] }),
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(bodies[url.pathname]?.() || {}))
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

const finishedGridCalls = () => tvh.requests.filter((p) => p === '/api/dvr/entry/grid_finished').length

test('getState: past airings load once, then again only after a write to TVHeadend', async () => {
  forgetPastAirings()
  tvh.requests = []
  assert.equal((await getState()).pastAirings.length, 1)
  await getState()
  assert.equal(finishedGridCalls(), 1)
  await skipScheduledEntry({ uuid: 'u1' })
  await getState()
  assert.equal(finishedGridCalls(), 2)
})

test('getState: past airings page past the first 5000 entries', async () => {
  forgetPastAirings()
  tvh.finishedTotal = PAGE + 3
  tvh.requests = []
  const { pastAirings } = await getState()
  assert.equal(pastAirings.length, PAGE + 3)
  assert.equal(finishedGridCalls(), 2)
  tvh.finishedTotal = 1
})
