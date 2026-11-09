import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import knexFactory from 'knex'

import { createActivity } from '../src/activity.js'
import { busyCountOf, cachedFor, mountActivityRoutes, recordingRowsOf, streamTopicsOf } from '../src/activity-routes.js'
import { createArtFeed } from '../src/art-feed.js'
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

const openStream = async ({ base, query }) => {
  const controller = new AbortController()
  const res = await fetch(`${base}/api/activity/stream?${query}`, { signal: controller.signal })
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  const events = (name) => text.split('\n\n')
    .filter((block) => block.startsWith(`event: ${name}\n`))
    .map((block) => JSON.parse(block.split('\n')[1].replace(/^data: /, '')))
  const waitFor = async (name, count) => {
    while (events(name).length < count) text += decoder.decode((await reader.read()).value)
    return events(name)
  }
  return { events, waitFor, close: () => controller.abort() }
}

test('streamTopicsOf: jobs by default, and only known topics', () => {
  assert.deepEqual([...streamTopicsOf(undefined)], ['jobs'])
  assert.deepEqual([...streamTopicsOf('art,jobs,nope')], ['art', 'jobs'])
  assert.deepEqual([...streamTopicsOf('art')], ['art'])
})

test('the art topic sends a cursor at once, then batches resolved pictures with no jobs events', async () => {
  const artFeed = createArtFeed({ bootId: 'b00t' })
  const { server, base } = await serve(createActivity(), { artFeed, artPushMs: 60 })
  const stream = await openStream({ base, query: 'topics=art' })
  try {
    const [first] = await stream.waitFor('art', 1)
    assert.deepEqual(first, { cursor: 'b00t.0', reset: false, stamps: [] })
    artFeed.publish({ key: 'bluey', kind: 'poster', stamp: null })
    artFeed.publish({ key: 'bluey', kind: 'poster', stamp: 's2' })
    artFeed.publish({ key: 'heat', kind: 'background', stamp: null })
    const [, batch] = await stream.waitFor('art', 2)
    assert.deepEqual(batch, {
      cursor: 'b00t.3',
      reset: false,
      stamps: [{ key: 'bluey', kind: 'poster', stamp: 's2' }, { key: 'heat', kind: 'background', stamp: null }],
    })
    assert.equal(stream.events('jobs').length, 0)
  } finally {
    stream.close()
    server.close()
  }
})

test('a reconnect with since gets what it missed; an unknown or too old cursor gets a reset', async () => {
  const artFeed = createArtFeed({ bootId: 'b00t', size: 2 })
  const { server, base } = await serve(createActivity(), { artFeed, artPushMs: 20 })
  artFeed.publish({ key: 'a', kind: 'poster', stamp: null })
  artFeed.publish({ key: 'b', kind: 'poster', stamp: null })
  artFeed.publish({ key: 'c', kind: 'background', stamp: 'x' })
  try {
    const missed = await openStream({ base, query: 'topics=art,jobs&since=b00t.1' })
    const [catchUp] = await missed.waitFor('art', 1)
    missed.close()
    assert.deepEqual(catchUp, {
      cursor: 'b00t.3',
      reset: false,
      stamps: [{ key: 'b', kind: 'poster', stamp: null }, { key: 'c', kind: 'background', stamp: 'x' }],
    })
    assert.equal((await missed.waitFor('jobs', 1)).length, 1)
    for (const since of ['b00t.0', 'other.3', 'b00t.9', 'junk']) {
      const stream = await openStream({ base, query: `topics=art&since=${since}` })
      const [first] = await stream.waitFor('art', 1)
      stream.close()
      assert.deepEqual(first, { cursor: 'b00t.3', reset: true, stamps: [] }, since)
    }
  } finally {
    server.close()
  }
})
