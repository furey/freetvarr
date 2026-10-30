import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import knexFactory from 'knex'

import { createActivity } from '../src/activity.js'
import { busyCountOf, cachedFor, mountActivityRoutes, recordingRowsOf } from '../src/activity-routes.js'
import { createJobRunStore } from '../src/activity-store.js'
import { up as createJobRuns } from '../migrations/0032_job_runs.js'

const serve = async (activity, extra = {}) => {
  const app = express()
  mountActivityRoutes({ app, activity, pushMs: 20, ...extra })
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  return { server, base: `http://127.0.0.1:${server.address().port}` }
}

test('GET /api/activity returns jobs, sessions, recordings, and server facts', async () => {
  const activity = createActivity()
  let release
  const running = activity.track({ kind: 'sync' }, () => new Promise((resolve) => { release = resolve }))
  const { server, base } = await serve(activity, {
    listSessions: () => [{ id: 'a', kind: 'live', label: '7 Sydney' }],
    loadRecordings: async () => [{ id: 'recording-x', title: 'News' }],
    loadServer: async () => ({ uptimeSeconds: 60 }),
  })
  try {
    const body = await (await fetch(`${base}/api/activity`)).json()
    assert.equal(body.running[0].kind, 'sync')
    assert.equal(body.runningCount, 1)
    assert.equal(body.sessions[0].label, '7 Sydney')
    assert.equal(body.recordings[0].title, 'News')
    assert.equal(body.server.uptimeSeconds, 60)
    const one = await (await fetch(`${base}/api/activity/${body.running[0].id}`)).json()
    assert.deepEqual(one.steps, [])
    assert.equal((await fetch(`${base}/api/activity/nope`)).status, 404)
    assert.deepEqual(await (await fetch(`${base}/api/activity/summary`)).json(), { running: 1 })
  } finally {
    release()
    await running
    server.close()
  }
})

test('GET /api/activity still answers when recordings or server facts fail', async () => {
  const { server, base } = await serve(createActivity(), {
    loadRecordings: async () => { throw new Error('TVHeadend down') },
    loadServer: async () => { throw new Error('no loop') },
  })
  try {
    const body = await (await fetch(`${base}/api/activity`)).json()
    assert.deepEqual(body.recordings, [])
    assert.deepEqual(body.server, {})
  } finally {
    server.close()
  }
})

test('the stream sends the jobs at once and again after a change', async () => {
  const activity = createActivity()
  const { server, base } = await serve(activity)
  const controller = new AbortController()
  try {
    const res = await fetch(`${base}/api/activity/stream`, { signal: controller.signal })
    assert.equal(res.headers.get('content-type'), 'text/event-stream')
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let text = ''
    const readEvents = async (count) => {
      while ((text.match(/event: jobs/g) || []).length < count) text += decoder.decode((await reader.read()).value)
    }
    await readEvents(1)
    await activity.track({ kind: 'prune' }, async () => {})
    await readEvents(2)
    const last = JSON.parse(text.trim().split('\n').at(-1).replace(/^data: /, ''))
    assert.equal(last.recent[0].kind, 'prune')
  } finally {
    controller.abort()
    server.close()
  }
})

test('busyCountOf leaves out quiet jobs', () => {
  assert.equal(busyCountOf([{ kind: 'sync' }, { kind: 'hero' }, { kind: 'import' }]), 2)
})

test('recordingRowsOf keeps the fields the activity view shows', () => {
  const [row] = recordingRowsOf({ active: [{ dvrUuid: 'u1', title: 'News', channelName: 'ABC', stop: 2, tuner: 'Tuner 1', signal: -40 }] })
  assert.equal(row.id, 'recording-u1')
  assert.equal(row.channelName, 'ABC')
  assert.equal(row.signal, undefined)
  assert.deepEqual(recordingRowsOf(null), [])
})

test('cachedFor shares one load inside its time to live', async () => {
  let at = 0
  let loads = 0
  const read = cachedFor({ load: async () => ++loads, ttlMs: 100, now: () => at })
  assert.deepEqual(await Promise.all([read(), read()]), [1, 1])
  at = 50
  assert.equal(await read(), 1)
  at = 200
  assert.equal(await read(), 2)
})

test('the job run store saves, loads, and prunes failed runs', async () => {
  const database = knexFactory({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true })
  await createJobRuns(database)
  const store = createJobRunStore({ database })
  const run = { id: 'health-1', kind: 'health', state: 'failed', error: 'down', finishedAt: 500, steps: [], facts: [], items: [], log: [] }
  await store.save(run)
  await store.save({ ...run, id: 'health-0', finishedAt: 10 })
  assert.equal(await store.prune({ before: 100 }), 1)
  const [loaded] = await store.load({ since: 0 })
  assert.equal(loaded.id, 'health-1')
  assert.equal(loaded.error, 'down')
  assert.equal(loaded.finishedAt, 500)
  await store.save({ ...run, id: 'guide-1', kind: 'guide', finishedAt: 600 }, { replaceKind: true })
  await store.save({ ...run, id: 'guide-2', kind: 'guide', finishedAt: 700 }, { replaceKind: true })
  assert.deepEqual((await store.load({ since: 0 })).map((row) => row.id), ['health-1', 'guide-2'])
  await database.destroy()
})
