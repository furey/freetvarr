import assert from 'node:assert/strict'
import test from 'node:test'

import { PlexWatchError } from '../src/plex-watch-client.js'
import { BACKOFF_FIRST_MS, backoffMs, createPlexWatchSync, needsFullPass, outcomeText, tokenMarkOf } from '../src/plex-watch-sync.js'

const NOW = Date.parse('2026-10-30T10:00:00Z')
const SECTIONS = [{ id: '2', type: 'show' }, { id: '5', type: 'movie' }]

const row = (id, patch = {}) => ({
  recording_id: id,
  title: `Show ${id}`,
  file_path: `/media/TV/Show/Season 1/Show - ${id}.ts`,
  duration_s: 3600,
  watched_at: null,
  played_at: null,
  playback_position_s: null,
  ...patch,
})

const item = (id, patch = {}) => ({
  ratingKey: `k${id}`,
  viewCount: 0,
  viewOffset: 0,
  Media: [{ Part: [{ file: `/data/TV/Show/Season 1/Show - ${id}.ts` }] }],
  ...patch,
})

const harness = ({ rows = [], items = [], snapshots = [], status = {}, toggles = { fromPlex: true, toPlex: true }, config = { url: 'http://plex:32400', token: 'tok', sections: SECTIONS }, client = {} } = {}) => {
  const state = {
    rows: rows.map((r) => ({ ...r })),
    snapshots: new Map(snapshots.map((s) => [s.recording_id, { ...s }])),
    status: { ...status },
    toggles: { ...toggles },
    writes: [],
    listCalls: [],
    metadataCalls: [],
    jobs: [],
    pulls: [],
    nowMs: NOW,
  }
  const fakeClient = {
    listItems: async ({ section, viewedSinceS = null }) => {
      state.listCalls.push({ section: section.id, viewedSinceS })
      if (section.id !== '2') return []
      return viewedSinceS == null ? items : items.filter((entry) => (entry.lastViewedAt ?? 0) >= viewedSinceS)
    },
    metadata: async (keys) => {
      state.metadataCalls.push(keys)
      return items.filter((entry) => keys.includes(String(entry.ratingKey)))
    },
    write: async (action) => {
      state.writes.push(action)
      applyToPlex({ items, action })
    },
    ...client,
  }
  const job = { items: [], facts: [], outcome: null }
  const jobHandle = new Proxy({}, {
    get: (_, name) => (...args) => {
      if (name === 'item') job.items.push(args[0])
      if (name === 'fact') job.facts.push(args)
      if (name === 'outcome') job.outcome = args[0]
      return jobHandle
    },
  })
  const sync = createPlexWatchSync({
    loadConfig: async () => config,
    loadToggles: async () => ({ ...state.toggles }),
    loadRows: async () => state.rows.map((r) => ({ ...r })),
    loadSnapshots: async () => [...state.snapshots.values()].map((s) => ({ ...s })),
    saveSnapshots: async (list) => { for (const s of list) state.snapshots.set(s.recording_id, { ...s }) },
    pruneSnapshots: async (keep) => { for (const id of [...state.snapshots.keys()]) if (!keep.includes(id)) state.snapshots.delete(id) },
    applyPull: async ({ recordingId, patch }) => {
      state.pulls.push({ recordingId, patch })
      Object.assign(state.rows.find((r) => r.recording_id === recordingId), patch)
    },
    loadStatus: async () => ({ ...state.status }),
    saveStatus: async (next) => { state.status = { ...next } },
    track: async (options, fn) => {
      state.jobs.push(options)
      return fn(jobHandle)
    },
    createClient: () => fakeClient,
    now: () => state.nowMs,
    setTimer: (fn, ms) => ({ fn, ms }),
    clearTimer: () => {},
  })
  return { sync, state, job }
}

const applyToPlex = ({ items, action }) => {
  const target = items.find((entry) => String(entry.ratingKey) === action.ratingKey)
  if (!target) return
  if (action.action === 'scrobble') Object.assign(target, { viewCount: 1, viewOffset: 0 })
  if (action.action === 'unscrobble') Object.assign(target, { viewCount: 0, viewOffset: 0 })
  if (action.action === 'progress') target.viewOffset = action.seconds * 1000
}

test('first run copies Plex watches, sends Freetvarr watches once, and seeds every snapshot', async () => {
  const { sync, state } = harness({
    rows: [row('1'), row('2', { watched_at: '2026-10-29T10:00:00Z' }), row('3')],
    items: [item('1', { viewCount: 1, lastViewedAt: 1_793_000_000 }), item('2'), item('3')],
  })
  const result = await sync.run({ trigger: 'sync' })
  assert.equal(result.full, true)
  assert.deepEqual(state.pulls.map((p) => p.recordingId), ['1'])
  assert.deepEqual(state.writes, [{ ratingKey: 'k2', action: 'scrobble' }])
  assert.equal(state.snapshots.size, 3)
  assert.equal(state.status.matched, 3)
  assert.equal(state.status.unmatched, 0)
  assert.equal(state.status.lastFullAt, NOW)
})

test('a second run with nothing new changes nothing', async () => {
  const { sync, state } = harness({ rows: [row('1', { watched_at: '2026-10-29T10:00:00Z' })], items: [item('1')] })
  await sync.run({ trigger: 'manual' })
  state.writes.length = 0
  const again = await sync.run({ trigger: 'manual' })
  assert.equal(again.pulled, 0)
  assert.equal(again.pushed, 0)
})

test('a quick run reads only recently viewed items plus Freetvarr changes by rating key', async () => {
  const snapshots = [
    { recording_id: '1', rating_key: 'k1', plex_watched: false, plex_offset_s: 0, ft_watched: false, ft_position_s: 0 },
    { recording_id: '2', rating_key: 'k2', plex_watched: false, plex_offset_s: 0, ft_watched: false, ft_position_s: 0 },
  ]
  const { sync, state } = harness({
    rows: [row('1'), row('2', { watched_at: '2026-10-30T09:59:00Z' })],
    items: [item('1', { viewCount: 1, lastViewedAt: Math.floor(NOW / 1000) - 600 }), item('2')],
    snapshots,
    status: { lastRunAt: NOW - 30 * 60_000, lastFullAt: NOW - 60 * 60_000 },
  })
  const result = await sync.run({ trigger: 'sync' })
  assert.equal(result.full, false)
  assert.equal(state.listCalls[0].viewedSinceS, Math.floor((NOW - 32 * 60_000) / 1000))
  assert.deepEqual(state.metadataCalls, [['k2']])
  assert.deepEqual(state.pulls.map((p) => p.recordingId), ['1'])
  assert.deepEqual(state.writes, [{ ratingKey: 'k2', action: 'scrobble' }])
})

test('a full pass runs daily, on demand, and hourly while recordings have no Plex match', () => {
  const rows = [row('1')]
  const known = new Map([['1', {}]])
  assert.equal(needsFullPass({ status: {}, rows, snapshotById: known, nowMs: NOW }), true)
  assert.equal(needsFullPass({ status: { lastRunAt: NOW, lastFullAt: NOW - 23 * 3600_000 }, rows, snapshotById: known, nowMs: NOW }), false)
  assert.equal(needsFullPass({ status: { lastRunAt: NOW, lastFullAt: NOW - 24 * 3600_000 }, rows, snapshotById: known, nowMs: NOW }), true)
  assert.equal(needsFullPass({ status: { lastRunAt: NOW, lastFullAt: NOW - 30 * 60_000 }, rows, snapshotById: new Map(), nowMs: NOW }), false)
  assert.equal(needsFullPass({ status: { lastRunAt: NOW, lastFullAt: NOW - 61 * 60_000 }, rows, snapshotById: new Map(), nowMs: NOW }), true)
})

test('pushes go at most four at a time and stop when Back to Plex is turned off mid-run', async () => {
  const rows = Array.from({ length: 10 }, (_, i) => row(String(i), { watched_at: '2026-10-30T09:00:00Z' }))
  let active = 0
  let peak = 0
  const holder = {}
  const { sync, state } = harness({
    rows,
    items: rows.map((r) => item(r.recording_id)),
    client: {
      write: async (action) => {
        active += 1
        peak = Math.max(peak, active)
        await new Promise((resolve) => setImmediate(resolve))
        active -= 1
        holder.state.writes.push(action)
        if (holder.state.writes.length === 4) holder.state.toggles.toPlex = false
      },
    },
  })
  holder.state = state
  await sync.run({ trigger: 'manual' })
  assert.equal(peak, 4)
  assert.equal(state.writes.length, 4)
  const unsent = state.snapshots.get('9')
  assert.equal(unsent.plex_watched, false)
  assert.equal(unsent.ft_watched, true)
})

test('a failed push is retried on the next run', async () => {
  let fail = true
  const { sync, state } = harness({
    rows: [row('1', { watched_at: '2026-10-30T09:00:00Z' })],
    items: [item('1')],
    snapshots: [{ recording_id: '1', rating_key: 'k1', plex_watched: false, plex_offset_s: 0, ft_watched: false, ft_position_s: 0 }],
    client: {
      write: async (action) => {
        if (fail) throw new PlexWatchError('Plex HTTP 500', { status: 500 })
        state.writes.push(action)
      },
    },
  })
  const first = await sync.run({ trigger: 'manual' })
  assert.equal(first.failed, 1)
  fail = false
  await sync.run({ trigger: 'manual' })
  assert.deepEqual(state.writes, [{ ratingKey: 'k1', action: 'scrobble' }])
})

test('Plex unreachable backs off automatic runs, and Sync now ignores the backoff', async () => {
  let down = true
  const { sync, state } = harness({
    rows: [row('1')],
    items: [item('1')],
    client: {
      listItems: async () => {
        if (down) throw new PlexWatchError('Plex did not answer: ECONNREFUSED')
        return [item('1')]
      },
    },
  })
  await assert.rejects(sync.run({ trigger: 'sync' }), /ECONNREFUSED/)
  assert.equal(state.status.failures, 1)
  assert.equal(state.status.nextAttemptAt, NOW + BACKOFF_FIRST_MS)
  assert.deepEqual(await sync.run({ trigger: 'sync' }), { skipped: 'backing-off' })
  down = false
  const manual = await sync.run({ trigger: 'manual' })
  assert.equal(manual.matched, 1)
  assert.equal(state.status.failures, 0)
  assert.equal(state.status.error, null)
})

test('backoff doubles from 5 minutes up to 2 hours', () => {
  assert.equal(backoffMs(1), 5 * 60_000)
  assert.equal(backoffMs(2), 10 * 60_000)
  assert.equal(backoffMs(10), 2 * 3600_000)
})

test('a rejected token stops automatic runs until the token changes', async () => {
  const config = { url: 'http://plex:32400', token: 'old', sections: SECTIONS }
  const { sync, state } = harness({
    config,
    rows: [row('1')],
    client: { listItems: async () => { throw new PlexWatchError('Plex rejected the token', { kind: 'token', status: 401 }) } },
  })
  await assert.rejects(sync.run({ trigger: 'sync' }), /rejected/)
  assert.equal(state.status.errorKind, 'token')
  assert.equal(state.status.tokenMark, tokenMarkOf('old'))
  state.nowMs = NOW + 10 * 3600_000
  assert.deepEqual(await sync.run({ trigger: 'sync' }), { skipped: 'token-rejected' })
  config.token = 'new'
  await assert.rejects(sync.run({ trigger: 'sync' }), /rejected/)
})

test('a rejected token during pushes stops the run', async () => {
  const { sync } = harness({
    rows: [row('1', { watched_at: '2026-10-30T09:00:00Z' })],
    items: [item('1')],
    client: { write: async () => { throw new PlexWatchError('Plex rejected the token', { kind: 'token', status: 401 }) } },
  })
  await assert.rejects(sync.run({ trigger: 'manual' }), /rejected/)
})

test('Plex not set up: nothing runs and no job appears', async () => {
  const { sync, state } = harness({ config: null })
  assert.deepEqual(await sync.run({ trigger: 'sync' }), { skipped: 'not-configured' })
  assert.equal(state.jobs.length, 0)
  assert.equal(state.status.configured, false)
})

test('runs never overlap: a trigger during a run waits, then runs once more', async () => {
  let release
  const gate = new Promise((resolve) => { release = resolve })
  let calls = 0
  const { sync } = harness({
    rows: [row('1')],
    client: {
      listItems: async () => {
        calls += 1
        if (calls === 1) await gate
        return [item('1')]
      },
    },
  })
  const first = sync.run({ trigger: 'sync' })
  const second = sync.run({ trigger: 'watch-change' })
  const third = sync.run({ trigger: 'library-open' })
  assert.equal(sync.isRunning(), true)
  release()
  await Promise.all([first, second, third])
  assert.ok(calls <= 4)
  assert.equal(sync.isRunning(), false)
})

test('deleted recordings lose their snapshot and nothing is sent to Plex', async () => {
  const { sync, state } = harness({
    rows: [row('1')],
    items: [item('1'), item('2', { viewCount: 1 })],
    snapshots: [{ recording_id: '2', rating_key: 'k2', plex_watched: true, plex_offset_s: 0, ft_watched: true, ft_position_s: 0 }],
  })
  await sync.run({ trigger: 'manual' })
  assert.equal(state.snapshots.has('2'), false)
  assert.deepEqual(state.writes, [])
})

test('a recording Plex has not scanned yet is skipped and keeps its snapshot', async () => {
  const { sync, state } = harness({
    rows: [row('1', { watched_at: '2026-10-29T10:00:00Z', file_path: '/media/TV/Moved/Season 1/Moved - 1.ts' })],
    items: [],
    snapshots: [{ recording_id: '1', rating_key: 'k1', plex_watched: true, plex_offset_s: 0, ft_watched: true, ft_position_s: 0 }],
  })
  const result = await sync.run({ trigger: 'manual' })
  assert.equal(result.unmatched, 1)
  assert.equal(state.snapshots.get('1').rating_key, 'k1')
  assert.deepEqual(state.writes, [])
  assert.deepEqual(state.pulls, [])
})

test('watch changes and opening Recordings ask for a run without waiting on Plex', () => {
  const timers = []
  const sync = createPlexWatchSync({
    loadConfig: async () => null,
    loadStatus: async () => ({}),
    saveStatus: async () => {},
    now: () => NOW,
    setTimer: (fn, ms) => {
      timers.push(ms)
      return { fn, ms }
    },
    clearTimer: () => {},
  })
  sync.noteWatchChange()
  sync.libraryOpened()
  sync.libraryOpened()
  assert.deepEqual(timers, [10_000, 0])
})

test('the outcome line counts both directions', () => {
  assert.equal(outcomeText({ pulled: 3, pushed: 1 }), '3 from Plex · 1 to Plex')
  assert.equal(outcomeText({ pulled: 0, pushed: 0 }), 'No changes')
  assert.equal(outcomeText({ pulled: 0, pushed: 2, failed: 1 }), '2 to Plex · 1 not sent')
})
