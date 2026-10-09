import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'

import { listEvents } from '../src/tvheadend.js'

const PAGE_SIZE = 2000
const EVENT_COUNT = 9500
const T0 = 1_700_000_000

let server
let conn
let listing
let requestedOffsets
let openRequests
let peakOpenRequests

const eventAt = (index) => ({
  eventId: index,
  channelUuid: 'ch-abc',
  title: `Programme ${index}`,
  start: T0 + index * 60,
  stop: T0 + (index + 1) * 60,
})

const gridPage = ({ offset, limit, withTotalCount }) => ({
  entries: Array.from({ length: Math.max(0, Math.min(limit, EVENT_COUNT - offset)) }, (_, i) => eventAt(offset + i)),
  ...(withTotalCount ? { totalCount: EVENT_COUNT } : {}),
})

const answerAfterDelay = async (res, body) => {
  openRequests += 1
  peakOpenRequests = Math.max(peakOpenRequests, openRequests)
  await new Promise((resolve) => setTimeout(resolve, 10))
  openRequests -= 1
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

before(async () => {
  server = http.createServer((req, res) => {
    const params = new URL(req.url, 'http://x').searchParams
    const offset = Number(params.get('start'))
    requestedOffsets.push(offset)
    answerAfterDelay(res, gridPage({ offset, limit: Number(params.get('limit')), ...listing }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  conn = { url: `http://127.0.0.1:${server.address().port}`, username: '', password: '' }
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
})

beforeEach(() => {
  listing = { withTotalCount: true }
  requestedOffsets = []
  openRequests = 0
  peakOpenRequests = 0
})

test('listEvents reads the pages after the first in parallel and keeps their order', async () => {
  const events = await listEvents({ startMs: 0, endMs: Infinity, conn })
  assert.equal(events.length, EVENT_COUNT)
  assert.deepEqual(events.map((e) => e.program_id), Array.from({ length: EVENT_COUNT }, (_, i) => i))
  assert.deepEqual(requestedOffsets.sort((a, b) => a - b), [0, 2000, 4000, 6000, 8000])
  assert.equal(peakOpenRequests, 4)
})

test('listEvents stops at the first event past the window', async () => {
  const endMs = (T0 + 2500 * 60) * 1000
  const events = await listEvents({ startMs: 0, endMs, conn })
  assert.equal(events.length, 2500)
  assert.equal(events.at(-1).program_id, 2499)
})

test('listEvents skips events that end before the window', async () => {
  const startMs = (T0 + 7000 * 60) * 1000
  const events = await listEvents({ startMs, endMs: Infinity, conn })
  assert.equal(events[0].program_id, 7000)
  assert.equal(events.length, EVENT_COUNT - 7000)
})

test('listEvents reads every page when TVHeadend sends no total count', async () => {
  listing = { withTotalCount: false }
  const events = await listEvents({ startMs: 0, endMs: Infinity, conn })
  assert.equal(events.length, EVENT_COUNT)
  assert.equal(events.at(-1).program_id, EVENT_COUNT - 1)
})

test('listEvents reads one page when the listing fits on it', async () => {
  const endMs = (T0 + PAGE_SIZE / 2 * 60) * 1000
  await listEvents({ startMs: 0, endMs, conn })
  assert.deepEqual(requestedOffsets, [0])
})
