import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'

process.env.DB_PATH ??= path.join(os.tmpdir(), `freetvarr-for-you-cache-${process.pid}.db`)

const { createForYouCache, createForYouWorker, createSavedResultStore, forYouSignatureOf, guideVersionOf, snapshotStampsOf } = await import('../src/for-you-service.js')
const { buildForYouFromRequest } = await import('../src/for-you-worker.js')
const { buildForYou } = await import('../src/for-you.js')

const HOUR = 60 * 60 * 1000
const NOW = Date.UTC(2026, 9, 21, 2, 0)

const programme = (id, title, extra = {}) => ({
  program_id: id,
  channel_id: 'seven',
  title,
  synopsis: `${title} synopsis`,
  start: NOW + id * HOUR,
  end: NOW + (id + 1) * HOUR,
  series_no: 1,
  episode_no: id,
  ...extra,
})

const guideWith = (programmes, fetchedAt = NOW) => ({
  fetchedAt,
  channels: [{ id: 'seven', name: '7 Sydney' }],
  programsByChannel: { seven: programmes },
})

const stateWith = ({ fetchedAt = NOW, programIds = ['1'] } = {}) => ({
  fetchedAt,
  futureRecordings: programIds.map((programId) => ({ programId })),
  skippedProgramIds: [],
  seriesTags: [{ name: 'Hard Quiz', enabled: true }],
})

const partsWith = (over = {}) => ({
  guide: guideWith([programme(1, 'Hard Quiz'), programme(2, 'Landline')]),
  state: stateWith(),
  watchlist: [{ title: 'Muster Dogs', mode: 'record' }],
  events: { count: 4, lastId: 40 },
  recordings: { count: 2, watched: 1, position: 300 },
  categories: { count: 9 },
  embedderId: 'minilm',
  vectors: 3,
  pinned: ['seven'],
  tier: 'standard',
  ...over,
})

const signatureOf = (over = {}, nowMs = NOW) => forYouSignatureOf({ stamps: snapshotStampsOf(partsWith(over)).stamps, nowMs })

test('the For you signature ignores when the guide and recording state were fetched', () => {
  const programmes = [programme(1, 'Hard Quiz'), programme(2, 'Landline')]
  assert.equal(
    signatureOf({ guide: guideWith(programmes, NOW), state: stateWith({ fetchedAt: NOW }) }),
    signatureOf({ guide: guideWith(structuredClone(programmes), NOW + 45_000), state: stateWith({ fetchedAt: NOW + 45_000 }) }),
  )
})

test('the For you signature changes with guide content, schedules, rules, events, and the time bucket', () => {
  const base = signatureOf()
  assert.notEqual(signatureOf({ guide: guideWith([programme(1, 'Hard Quiz')]) }), base)
  assert.notEqual(signatureOf({ state: stateWith({ programIds: ['1', '2'] }) }), base)
  assert.notEqual(signatureOf({ watchlist: [{ title: 'Muster Dogs', mode: 'watch' }] }), base)
  assert.notEqual(signatureOf({ events: { count: 5, lastId: 41 } }), base)
  assert.notEqual(signatureOf({ recordings: { count: 2, watched: 2, position: 300 } }), base)
  assert.notEqual(signatureOf({ tier: 'basic' }), base)
  assert.equal(signatureOf({}, NOW + 60_000), base)
  assert.notEqual(signatureOf({}, NOW + 5 * 60_000), base)
})

test('snapshotStampsOf derives the scheduled programmes and rule keys the build uses', () => {
  const { scheduledProgramIds, ruleKeys } = snapshotStampsOf(partsWith())
  assert.deepEqual([...scheduledProgramIds], ['1'])
  assert.deepEqual([...ruleKeys].sort(), ['hard-quiz', 'muster-dogs'])
})

test('guideVersionOf hashes each guide once', () => {
  const guide = guideWith([programme(1, 'Hard Quiz')])
  const version = guideVersionOf(guide)
  guide.programsByChannel.seven.push(programme(2, 'Landline'))
  assert.equal(guideVersionOf(guide), version)
  assert.equal(guideVersionOf(null), null)
})

const deferred = () => {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

const cacheWith = () => {
  const state = { stamps: { version: 1 }, computes: [] }
  const cache = createForYouCache({
    loadSnapshot: async () => ({ stamps: { ...state.stamps } }),
    compute: ({ snapshot }) => {
      const pending = deferred()
      state.computes.push({ version: snapshot.stamps.version, ...pending })
      return pending.promise
    },
    onRefreshError: () => {},
  })
  return { cache, state }
}

const settle = () => new Promise((resolve) => setImmediate(resolve))

test('the first For you request waits for the build and later hits reuse it', async () => {
  const { cache, state } = cacheWith()
  const first = cache.get({ nowMs: NOW })
  const second = cache.get({ nowMs: NOW })
  await settle()
  assert.equal(state.computes.length, 1)
  state.computes[0].resolve({ id: 'v1' })
  assert.deepEqual(await first, { id: 'v1' })
  assert.deepEqual(await second, { id: 'v1' })
  assert.deepEqual(await cache.get({ nowMs: NOW }), { id: 'v1' })
  assert.equal(state.computes.length, 1)
})

test('a changed signature serves the last result at once and rebuilds once in the background', async () => {
  const { cache, state } = cacheWith()
  const first = cache.get({ nowMs: NOW })
  await settle()
  state.computes[0].resolve({ id: 'v1' })
  await first
  state.stamps = { version: 2 }
  const during = await Promise.all([cache.get({ nowMs: NOW }), cache.get({ nowMs: NOW }), cache.get({ nowMs: NOW })])
  assert.deepEqual(during, [{ id: 'v1' }, { id: 'v1' }, { id: 'v1' }])
  assert.equal(state.computes.length, 2)
  state.computes[1].resolve({ id: 'v2' })
  await settle()
  assert.deepEqual(await cache.get({ nowMs: NOW }), { id: 'v2' })
  assert.equal(state.computes.length, 2)
})

test('forgetting the cache makes the next request wait and drops a build already running', async () => {
  const { cache, state } = cacheWith()
  const first = cache.get({ nowMs: NOW })
  await settle()
  state.computes[0].resolve({ id: 'v1' })
  await first
  state.stamps = { version: 2 }
  await cache.get({ nowMs: NOW })
  cache.forget()
  const waiting = cache.get({ nowMs: NOW })
  await settle()
  assert.equal(state.computes.length, 3)
  state.computes[1].resolve({ id: 'old' })
  state.computes[2].resolve({ id: 'v2' })
  assert.deepEqual(await waiting, { id: 'v2' })
  assert.deepEqual(await cache.get({ nowMs: NOW }), { id: 'v2' })
})

const SHOWS = ['Hard Quiz', 'Landline', 'Muster Dogs', 'Gardening Australia', 'Gruen', 'Back Roads']

const watchEvent = ({ id, title, daysAgo }) => ({
  id,
  ts: NOW - daysAgo * 24 * HOUR,
  kind: 'watch_end',
  title,
  series_key: null,
  channel_id: 'seven',
  programme_start: NOW - daysAgo * 24 * HOUR,
  recording_id: null,
  duration_s: 3600,
  position_s: 3600,
  programme_len_s: 3600,
  source: 'live',
  meta_json: null,
})

const requestWith = ({ guideVersion = 'g1', history = [] } = {}) => ({
  guideVersion,
  vectorsKey: 'none|0',
  inputs: {
    nowMs: NOW,
    limit: 20,
    history: history.map((entry) => JSON.stringify(entry)),
    events: SHOWS.flatMap((title, at) => [1, 2].map((episode) => watchEvent({ id: at * 10 + episode, title, daysAgo: episode + 1 }))),
    recordings: [],
    scheduledProgramIds: new Set(['2']),
    ruleKeys: new Set(),
    genresByKey: new Map(),
    pinnedChannelIds: ['seven'],
    tier: 'basic',
  },
})

test('the For you worker builds the same result as an inline build', async () => {
  const guide = { programmes: [...SHOWS, 'Hard Quiz', 'Landline'].map((title, at) => programme(at + 1, title)), channels: [{ id: 'seven', name: '7 Sydney' }] }
  const history = [programme(-30, 'Landline', { start: NOW - 30 * HOUR, end: NOW - 29 * HOUR })]
  const request = requestWith({ history })
  const worker = createForYouWorker()
  try {
    const first = await worker.build({ guide, vectorsByHash: null, request })
    const again = await worker.build({ guide: null, vectorsByHash: null, request })
    const inline = buildForYou({ ...request.inputs, history, programmes: guide.programmes, channels: guide.channels })
    const { explanations, ...rest } = inline
    assert.ok(rest.sections.some((section) => section.items.length))
    assert.ok(explanations.size)
    assert.deepEqual(first.result, rest)
    assert.deepEqual(again.result, rest)
    assert.deepEqual(new Map(JSON.parse(first.explanationsJson)), explanations)
    assert.deepEqual(buildForYouFromRequest({ guide, vectorsByHash: null, request }), first)
  } finally {
    await worker.close()
  }
})

test('after a restart the saved result answers at once while a fresh build runs', async () => {
  const saved = { sections: [{ key: 'movies', items: [{ title: 'Heat' }] }] }
  let release
  const building = new Promise((resolve) => { release = resolve })
  const writes = []
  const cache = createForYouCache({
    loadSnapshot: async () => ({ stamps: { guide: 'v2' } }),
    compute: () => building,
    store: { load: async () => saved, save: async (result) => writes.push(result) },
  })
  assert.equal(await cache.get({ nowMs: 0 }), saved)
  release({ sections: [] })
  await building
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(await cache.get({ nowMs: 0 }), { sections: [] })
  assert.equal(writes.length, 1)
})

test('the saved result store keeps explanations and drops a result older than a day', async () => {
  const rows = new Map()
  let clock = 1000
  const store = createSavedResultStore({
    read: async (key) => rows.get(key),
    write: async (key, value) => { rows.set(key, value) },
    now: () => clock,
    maxAgeMs: 500,
  })
  const result = Object.defineProperty({ sections: [] }, 'explanations', { get: () => new Map([['1', { why: 'Drama' }]]) })
  await store.save(result)
  assert.deepEqual((await store.load()).explanations.get('1'), { why: 'Drama' })
  clock = 2000
  assert.equal(await store.load(), null)
})

test('warm builds once in the background when nothing is cached yet', async () => {
  let builds = 0
  let release
  const building = new Promise((resolve) => { release = resolve })
  const cache = createForYouCache({
    loadSnapshot: async () => ({ stamps: { guide: 'v1' } }),
    compute: () => { builds += 1; return building },
  })
  const first = cache.warm({ nowMs: 0 })
  const second = cache.warm({ nowMs: 0 })
  release({ sections: ['warm'] })
  await Promise.all([first, second])
  assert.equal(builds, 1)
  assert.deepEqual(await cache.get({ nowMs: 0 }), { sections: ['warm'] })
  assert.equal(builds, 1)
})

test('warm does nothing when a result is cached or saved', async () => {
  let builds = 0
  const compute = async () => { builds += 1; return { sections: [] } }
  const loadSnapshot = async () => ({ stamps: { guide: 'v1' } })
  const built = createForYouCache({ loadSnapshot, compute })
  await built.get({ nowMs: 0 })
  assert.equal(await built.warm({ nowMs: 0 }), null)
  const restored = createForYouCache({ loadSnapshot, compute, store: { load: async () => ({ sections: [] }), save: async () => {} } })
  assert.equal(await restored.warm({ nowMs: 0 }), null)
  assert.equal(builds, 1)
})

test('warm reports a failed build without throwing', async () => {
  const errors = []
  const cache = createForYouCache({
    loadSnapshot: async () => { throw new Error('no guide') },
    compute: async () => ({ sections: [] }),
    onRefreshError: (err) => errors.push(err.message),
  })
  await cache.warm({ nowMs: 0 })
  assert.deepEqual(errors, ['no guide'])
})
