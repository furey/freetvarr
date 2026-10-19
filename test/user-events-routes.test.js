import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import express from 'express'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-user-events-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')
const {
  BACKFILL_KEY,
  SERIES_BACKFILL_KEY,
  backfillUserEvents,
  flushUserEvents,
  mountUserEvents,
  observeUserEvents,
  playbackSessionHooks,
  pruneUserEvents,
  stopUserEvents,
} = await import('../src/user-events-log.js')
const { HISTORY_RETENTION_MS } = await import('../src/user-events.js')

const passThrough = (req, res, next) => next()
let appServer
let baseUrl

const call = async (method, url, body) => {
  const res = await fetch(`${baseUrl}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

const events = async () => {
  await new Promise((resolve) => setTimeout(resolve, 20))
  await flushUserEvents()
  return db('user_events').orderBy('id')
}

before(async () => {
  await db.migrate.latest()
  const app = express()
  app.use(express.json())
  app.use(observeUserEvents)
  mountUserEvents({ app, csrf: passThrough })
  app.post('/api/library/delete', (req, res) => res.json({ results: req.body.ids.map((recordingId) => ({ recordingId, ok: recordingId !== 'r3' })) }))
  app.delete('/api/watchlist/:id', async (req, res) => {
    await db('watchlist').where({ id: Number(req.params.id) }).delete()
    res.json({ ok: true })
  })
  app.post('/api/recordings/:id/position', (req, res) => res.json({ ok: true }))
  appServer = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => appServer.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${appServer.address().port}`
})

after(async () => {
  await stopUserEvents()
  await new Promise((resolve) => appServer.close(resolve))
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

beforeEach(async () => {
  await db('user_events').delete()
  await db('recordings').delete()
  await db('watchlist').delete()
  await db('settings').delete()
  await call('PUT', '/api/events/settings', { viewing_history_enabled: true })
})

test('feedback is validated and logged', async () => {
  assert.equal((await call('POST', '/api/events/feedback', { kind: 'nope', title: 'x' })).status, 400)
  const ok = await call('POST', '/api/events/feedback', {
    events: [{ kind: 'suggestion_shown', title: 'Hard Quiz', source: 'for_you' }, { kind: 'thumb_down', series_key: 'bluey' }],
  })
  assert.equal(ok.status, 202)
  assert.equal(ok.body.logged, 2)
  const rows = await events()
  assert.deepEqual(rows.map((r) => [r.kind, r.series_key, r.source]), [
    ['suggestion_shown', 'hard-quiz', 'for_you'],
    ['thumb_down', 'bluey', 'ui'],
  ])
})

test('turning viewing history off stops logging and the setting reads back', async () => {
  assert.equal((await call('PUT', '/api/events/settings', { viewing_history_enabled: 'no' })).status, 400)
  await call('PUT', '/api/events/settings', { viewing_history_enabled: false })
  const logged = await call('POST', '/api/events/feedback', { kind: 'thumb_up', title: 'Bluey' })
  assert.equal(logged.body.logged, 0)
  const settings = await call('GET', '/api/events/settings')
  assert.equal(settings.body.viewing_history_enabled, false)
  assert.equal(settings.body.event_count, 0)
})

test('clearing history deletes every event and stops the backfill from refilling it', async () => {
  await call('POST', '/api/events/feedback', { kind: 'thumb_up', title: 'Bluey' })
  await events()
  const cleared = await call('DELETE', '/api/events')
  assert.deepEqual(cleared.body, { ok: true, deleted: 1 })
  assert.equal((await db('user_events')).length, 0)
  assert.ok(await db('settings').where({ key: BACKFILL_KEY }).first())
  await db('recordings').insert({ recording_id: 'a', title: 'Bluey', watched_at: '2026-01-01T00:00:00.000Z', duration_s: 420 })
  assert.deepEqual(await backfillUserEvents({ loadAutorecs: async () => [] }), { core: 0, series: 0 })
})

test('library deletes and watchlist removals are logged from the route responses', async () => {
  await db('recordings').insert([
    { recording_id: 'r1', title: 'Bluey', watched_at: '2026-01-01T00:00:00.000Z', duration_s: 420 },
    { recording_id: 'r2', title: 'Hard Quiz', duration_s: 1800, playback_position_s: 60 },
    { recording_id: 'r3', title: 'Kept' },
  ])
  const [watchId] = await db('watchlist').insert({ title: 'Spicks', title_key: 'spicks', mode: 'record' })
  await call('POST', '/api/library/delete', { ids: ['r1', 'r2', 'r3'] })
  await call('DELETE', `/api/watchlist/${watchId}`)
  const rows = await events()
  assert.deepEqual(rows.map((r) => [r.kind, r.recording_id ?? r.title, r.meta_json]), [
    ['recording_deleted', 'r1', '{"watched":true}'],
    ['recording_deleted', 'r2', '{"watched":false}'],
    ['record_cancel', 'Spicks', '{"type":"record"}'],
  ])
})

test('position saves feed the playback tracker', async () => {
  await db('recordings').insert({ recording_id: 'p1', title: 'Bluey', duration_s: 420 })
  const hooks = playbackSessionHooks()
  hooks.onStart({ recordingId: 'p1', startedAt: Date.now(), offset: 0, duration: 420 })
  await call('POST', '/api/recordings/p1/position', { seconds: 10 })
  await call('POST', '/api/recordings/p1/position', { seconds: 11 })
  hooks.onEnd({ recordingId: 'p1', lastSeenAt: Date.now() }, { code: 'stopped' })
  await stopUserEvents()
  const rows = await events()
  assert.deepEqual(rows.map((r) => [r.kind, r.title, r.position_s, r.duration_s]), [
    ['watch_start', 'Bluey', 0, null],
    ['watch_end', 'Bluey', 11, 1],
  ])
})

test('backfill seeds from state once, and retries series until TVHeadend answers', async () => {
  await db('recordings').insert([
    { recording_id: 'a', title: 'Bluey', watched_at: '2026-01-01T00:00:00.000Z', duration_s: 420 },
    { recording_id: 'b', title: 'Quiz', playback_position_s: 300, played_at: '2026-01-02T00:00:00.000Z' },
    { recording_id: 'c', title: 'Unseen' },
  ])
  await db('watchlist').insert({ title: 'Spicks', title_key: 'spicks', mode: 'notify' })
  const failing = async () => { throw new Error('unreachable') }
  assert.deepEqual(await backfillUserEvents({ loadAutorecs: failing }), { core: 3, series: 0 })
  assert.equal(await db('settings').where({ key: SERIES_BACKFILL_KEY }).first(), undefined)
  const autorecs = async () => [{ name: 'Hard Quiz', channelId: 'ch1', enabled: true }]
  assert.deepEqual(await backfillUserEvents({ loadAutorecs: autorecs }), { core: 0, series: 1 })
  assert.deepEqual(await backfillUserEvents({ loadAutorecs: autorecs }), { core: 0, series: 0 })
  const rows = await db('user_events').orderBy('id')
  assert.deepEqual(rows.map((r) => [r.kind, r.title, JSON.parse(r.meta_json).backfill]), [
    ['watch_end', 'Bluey', true],
    ['watch_end', 'Quiz', true],
    ['record_request', 'Spicks', true],
    ['record_request', 'Hard Quiz', true],
  ])
})

test('pruning removes events older than two years', async () => {
  const nowMs = Date.now()
  await db('user_events').insert([
    { ts: nowMs - HISTORY_RETENTION_MS - 1, kind: 'thumb_up' },
    { ts: nowMs - 1000, kind: 'thumb_up' },
  ])
  assert.equal(await pruneUserEvents({ nowMs }), 1)
  assert.equal((await db('user_events')).length, 1)
})
