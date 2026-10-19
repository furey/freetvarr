import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createWatchTracker } from '../src/watch-tracker.js'
import { createEventWriter } from '../src/user-event-writer.js'

const MIN = 60_000

const harness = ({ programmes = [], row = null } = {}) => {
  const logged = []
  const clock = { t: 0 }
  const tracker = createWatchTracker({
    log: (event) => logged.push(event),
    programmesFor: async () => programmes,
    recordingFor: async () => row,
    now: () => clock.t,
    graceMs: 50,
  })
  return { logged, clock, tracker }
}

test('a live session logs a start and one end per programme watched for a minute or more', async () => {
  const programmes = [
    { title: 'News', start: 0, end: 30 * MIN, program_id: 1 },
    { title: 'Quiz', start: 30 * MIN, end: 60 * MIN, program_id: 2 },
  ]
  const { logged, clock, tracker } = harness({ programmes })
  const session = { id: 's1', channelId: 'ch1', startedAt: 20 * MIN, lastSeenAt: 20 * MIN }
  await tracker.liveStarted(session)
  clock.t = 50 * MIN
  await tracker.liveEnded(session, { code: 'stopped' })
  assert.deepEqual(logged.map((e) => [e.kind, e.title, e.duration_s]), [
    ['watch_start', 'News', undefined],
    ['watch_end', 'News', 600],
    ['watch_end', 'Quiz', 1200],
  ])
  assert.equal(logged[0].position_s, 1200)
  assert.equal(logged[2].meta.reason, 'stopped')
})

test('an idle live session ends at the last time a viewer fetched the stream', async () => {
  const { logged, clock, tracker } = harness({ programmes: [{ title: 'Film', start: 0, end: 120 * MIN }] })
  const session = { id: 's1', channelId: 'ch1', startedAt: 0, lastSeenAt: 10 * MIN }
  clock.t = 11 * MIN
  await tracker.liveEnded(session, { code: 'idle' })
  assert.equal(logged[0].duration_s, 600)
})

test('recording playback joins seek restarts into one viewing and counts played seconds', async () => {
  const row = { recording_id: 'r1', title: 'Bluey', duration_s: 420, aired_at: 5, channel_id: 'ch1', watched_at: null }
  const { logged, clock, tracker } = harness({ row })
  await tracker.playStarted({ recordingId: 'r1', startedAt: 0, offset: 0, duration: 420 })
  clock.t = 10_000
  tracker.positionSaved({ recordingId: 'r1', seconds: 10 })
  clock.t = 40_000
  tracker.positionSaved({ recordingId: 'r1', seconds: 40 })
  tracker.playEnded({ recordingId: 'r1', lastSeenAt: 40_000 }, { code: 'stopped' })
  await tracker.playStarted({ recordingId: 'r1', startedAt: 41_000, offset: 300, duration: 420 })
  clock.t = 45_000
  tracker.positionSaved({ recordingId: 'r1', seconds: 300 })
  clock.t = 65_000
  tracker.positionSaved({ recordingId: 'r1', seconds: 320 })
  tracker.playEnded({ recordingId: 'r1', lastSeenAt: 65_000 }, { code: 'stopped' })
  await new Promise((resolve) => setTimeout(resolve, 80))
  await tracker.settle()
  assert.deepEqual(logged.map((e) => e.kind), ['watch_start', 'watch_end'])
  const end = logged[1]
  assert.equal(end.duration_s, 50)
  assert.equal(end.position_s, 320)
  assert.equal(end.title, 'Bluey')
  assert.equal(end.programme_len_s, 420)
  assert.equal(end.source, 'recording')
  assert.equal(end.ts, 65_000)
  assert.equal(tracker.openViewings(), 0)
})

test('playback without position saves falls back to wall time, and settle closes open viewings', async () => {
  const { logged, clock, tracker } = harness()
  await tracker.playStarted({ recordingId: 'dvr9', startedAt: 0, offset: 0, duration: null, inProgress: {} })
  clock.t = 90_000
  await tracker.settle()
  assert.deepEqual(logged.map((e) => [e.kind, e.source]), [['watch_start', 'in_progress'], ['watch_end', 'in_progress']])
  assert.equal(logged[1].duration_s, 90)
})

test('tracking failures are swallowed', async () => {
  const warnings = []
  const tracker = createWatchTracker({
    log: () => {},
    programmesFor: async () => { throw new Error('guide down') },
    warn: (message) => warnings.push(message),
  })
  await tracker.liveStarted({ id: 's', channelId: 'c', startedAt: 0 })
  assert.match(warnings[0], /guide down/)
})

test('the writer buffers, flushes in chunks, and drops rows when inserts fail', async () => {
  const inserted = []
  const warnings = []
  let failNext = false
  const writer = createEventWriter({
    insertRows: async (rows) => {
      if (failNext) {
        failNext = false
        throw new Error('locked')
      }
      inserted.push(rows.length)
    },
    now: () => 99,
    chunkSize: 2,
    warn: (message) => warnings.push(message),
  })
  for (let i = 0; i < 5; i += 1) writer.log({ kind: 'thumb_up', title: `t${i}` })
  assert.equal(writer.pending(), 5)
  assert.equal(await writer.flush(), 5)
  assert.deepEqual(inserted, [2, 2, 1])
  failNext = true
  writer.log({ kind: 'thumb_up', title: 'x' })
  await writer.flush()
  assert.match(warnings[0], /dropped 1 event/)
  writer.setEnabled(false)
  assert.equal(writer.log({ kind: 'thumb_up', title: 'y' }), false)
  assert.equal(writer.pending(), 0)
})

test('the writer keeps only the newest events when the buffer is full', async () => {
  const rows = []
  const writer = createEventWriter({ insertRows: async (chunk) => rows.push(...chunk), maxBuffered: 2 })
  writer.log({ kind: 'thumb_up', title: 'a' })
  writer.log({ kind: 'thumb_up', title: 'b' })
  writer.log({ kind: 'thumb_up', title: 'c' })
  await writer.stop()
  assert.deepEqual(rows.map((row) => row.title), ['b', 'c'])
})
