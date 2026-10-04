import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-recording-now-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const {
  getRecordingNow,
  recordingPhase,
  inputForRecording,
  describeActiveRecording,
  describeJourney,
  isRecordingFailure,
  recordingOutcome,
} = await import('../src/recording-now.js')
const { normaliseInput } = await import('../src/tvheadend.js')
const { db } = await import('../src/db.js')

const MIN = 60_000
const T0 = 1_790_760_660_000

const LIVE_INPUT = {
  uuid: '92ddb38b557a16da7c1aa2a5da8b5709',
  input: 'HDHomeRun DVB-T Tuner #0 (169.254.98.164)',
  stream: '191.625MHz in Free-to-air',
  subs: 1,
  signal: 65535,
  signal_scale: 1,
  snr: 65535,
  snr_scale: 1,
  unc: 0,
  bps: 3632160,
  te: 0,
  cc: 0,
}

const LIVE_SUBSCRIPTION = {
  title: 'DVR: The Block',
  channelName: '9HD Sydney',
  service: 'HDHomeRun DVB-T Tuner #0 (169.254.98.164)/Free-to-air/191.625MHz/9HD Sydney',
  state: 'Running',
  errors: 0,
  bytesInPerSecond: 487296,
}

const recording = (overrides = {}) => ({
  uuid: 'rec-1',
  programId: 7928,
  name: 'The Block',
  episodeTitle: 'Kids Room and Re-Do Room Week',
  channelId: 'ch-9hd',
  channelName: '9HD Sydney',
  startDate: T0,
  endDate: T0 + 72 * MIN,
  startPadded: T0 - 2 * MIN,
  stopPadded: T0 + 82 * MIN,
  schedStatus: 'recording',
  statusText: 'Running',
  errorCode: 0,
  filesize: 238679160,
  errors: 0,
  dataErrors: 0,
  season: 22,
  episode: 35,
  image: 'https://www.fetchtv.com.au/v2/epg/program/9ac304780a6714b51397/image',
  ...overrides,
})

test('recordingPhase: pre-roll before the programme, post-roll after it', () => {
  const window = { start: T0, stop: T0 + 60 * MIN }
  assert.equal(recordingPhase({ ...window, nowMs: T0 - MIN }), 'pre-roll')
  assert.equal(recordingPhase({ ...window, nowMs: T0 }), 'programme')
  assert.equal(recordingPhase({ ...window, nowMs: T0 + 59 * MIN }), 'programme')
  assert.equal(recordingPhase({ ...window, nowMs: T0 + 60 * MIN }), 'post-roll')
})

test('normaliseInput: reads relative and decibel scales', () => {
  const relative = normaliseInput(LIVE_INPUT)
  assert.equal(relative.signal, 100)
  assert.equal(relative.signalUnit, '%')
  assert.equal(relative.snr, 100)
  const decibel = normaliseInput({ ...LIVE_INPUT, signal: -62500, signal_scale: 2, snr: 31200, snr_scale: 2 })
  assert.equal(decibel.signal, -62.5)
  assert.equal(decibel.signalUnit, 'dBm')
  assert.equal(decibel.snr, 31.2)
  assert.equal(decibel.snrUnit, 'dB')
  assert.equal(normaliseInput({ ...LIVE_INPUT, signal_scale: 0 }).signal, null)
})

test('inputForRecording: follows the subscription service to the tuner carrying the mux', () => {
  const inputs = [normaliseInput({ ...LIVE_INPUT, input: 'HDHomeRun DVB-T Tuner #1 (169.254.98.164)' }), normaliseInput(LIVE_INPUT)]
  const { subscription, input } = inputForRecording({ recording: recording(), inputs, subscriptions: [LIVE_SUBSCRIPTION] })
  assert.equal(subscription, LIVE_SUBSCRIPTION)
  assert.equal(input.input, 'HDHomeRun DVB-T Tuner #0 (169.254.98.164)')
  assert.deepEqual(inputForRecording({ recording: recording({ channelName: 'ABC TV' }), inputs, subscriptions: [LIVE_SUBSCRIPTION] }), { subscription: null, input: null })
})

test('describeActiveRecording: builds the live card without exposing the image URL', () => {
  const card = describeActiveRecording({
    recording: recording(),
    inputs: [normaliseInput(LIVE_INPUT)],
    subscriptions: [LIVE_SUBSCRIPTION],
    nowMs: T0 + 10 * MIN,
  })
  assert.equal(card.phase, 'programme')
  assert.equal(card.hasImage, true)
  assert.equal(card.bitsPerSecond, 487296 * 8)
  assert.equal(card.signal, 100)
  assert.equal(card.startPadded, T0 - 2 * MIN)
  assert.equal(card.stopPadded, T0 + 82 * MIN)
  assert.equal(card.failed, false)
  assert.ok(!JSON.stringify(card).includes('fetchtv'))
})

test('isRecordingFailure: an error state or error code fails the recording', () => {
  assert.equal(isRecordingFailure(recording()), false)
  assert.equal(isRecordingFailure(recording({ schedStatus: 'recordingError' })), true)
  assert.equal(isRecordingFailure(recording({ schedStatus: 'completedError' })), true)
  assert.equal(isRecordingFailure(recording({ schedStatus: 'completed', errorCode: 3 })), true)
  assert.equal(isRecordingFailure(recording({ schedStatus: 'completedWarning' })), false)
  assert.equal(isRecordingFailure(recording({ schedStatus: 'completedRerecord' })), false)
})

const ok = { failed: false, statusText: 'Completed OK' }
const show = { id: 1, show_pattern: 'The Block', ad_removal: 'cut' }
const states = (journey) => journey.steps.map((s) => `${s.key}:${s.state}`)

test('describeJourney: waits for the next sync once recorded', () => {
  const journey = describeJourney({ outcome: ok, show, adRemovalOn: true })
  assert.deepEqual(states(journey), ['recorded:done', 'importing:pending', 'ads:pending', 'plex:pending'])
  assert.equal(journey.steps[1].detail, 'Waiting for the next sync')
  assert.equal(journey.settled, false)
})

test('describeJourney: shows import and comskip progress in pipeline order', () => {
  const importing = describeJourney({
    outcome: ok, show, adRemovalOn: true,
    row: { status: 'importing' }, progress: { phase: 'importing', percent: 37 },
  })
  assert.deepEqual(states(importing), ['recorded:done', 'importing:active', 'ads:pending', 'plex:pending'])
  assert.equal(importing.steps[1].percent, 37)
  const scanning = describeJourney({
    outcome: ok, show, adRemovalOn: true, activeSyncId: 4,
    row: { status: 'done', ad_status: 'scanning' }, progress: { phase: 'scanning', percent: 42 },
  })
  assert.deepEqual(states(scanning), ['recorded:done', 'importing:done', 'ads:active', 'plex:pending'])
  assert.equal(scanning.steps[2].label, 'Cutting ads')
  assert.equal(scanning.steps[2].percent, 42)
})

test('describeJourney: settles in Plex once the importing sync refreshed it', () => {
  const refreshing = describeJourney({
    outcome: ok, show, adRemovalOn: true, activeSyncId: 4,
    row: { status: 'done', ad_status: 'cut' },
  })
  assert.deepEqual(states(refreshing), ['recorded:done', 'importing:done', 'ads:done', 'plex:active'])
  const inPlex = describeJourney({
    outcome: ok, show, adRemovalOn: true,
    row: { status: 'done', ad_status: 'cut' },
    importSync: { summary: { plex: { triggered: true } } },
  })
  assert.deepEqual(states(inPlex), ['recorded:done', 'importing:done', 'ads:done', 'plex:done'])
  assert.equal(inPlex.settled, true)
})

test('describeJourney: leaves out the ads step when ad removal is off', () => {
  const journey = describeJourney({ outcome: ok, show, adRemovalOn: false, row: { status: 'done' }, importSync: { summary: { plex: { skipped: true, reason: 'plex not configured' } } } })
  assert.deepEqual(states(journey), ['recorded:done', 'importing:done', 'plex:skipped'])
  assert.equal(journey.settled, true)
})

test('describeJourney: a failed recording, a failed import, or no show rule settles at once', () => {
  const failed = describeJourney({ outcome: { failed: true, statusText: 'Time missed' }, show })
  assert.deepEqual(states(failed), ['recorded:failed'])
  assert.equal(failed.steps[0].detail, 'Time missed')
  assert.equal(failed.settled, true)
  const importFailed = describeJourney({ outcome: ok, show, row: { status: 'partial', error: 'short copy' } })
  assert.deepEqual(states(importFailed), ['recorded:done', 'importing:failed'])
  assert.equal(importFailed.steps[1].label, 'Import failed')
  assert.equal(importFailed.settled, true)
  const noRule = describeJourney({ outcome: ok, importUnmatched: false })
  assert.deepEqual(states(noRule), ['recorded:done', 'importing:skipped'])
  assert.equal(noRule.steps[1].label, 'Not imported')
  assert.match(noRule.steps[1].detail, /No show rule/)
  assert.equal(noRule.settled, true)
  const keptOut = describeJourney({ outcome: ok, show, libraryChoice: 'exclude' })
  assert.deepEqual(states(keptOut), ['recorded:done', 'importing:skipped'])
  assert.match(keptOut.steps[1].detail, /Add to library off/)
})

test('describeJourney: a one-off with no show rule waits for the sync by default', () => {
  const journey = describeJourney({ outcome: ok })
  assert.deepEqual(states(journey), ['recorded:done', 'importing:pending', 'plex:pending'])
  assert.equal(journey.settled, false)
})

let server
const tvh = { upcoming: [], loaded: {}, requests: [] }

const rawEntry = (uuid, { channel = '9HD Sydney', title = 'The Block', sched = 'recording', status = 'Running', errorcode = 0 } = {}) => ({
  uuid,
  start: T0 / 1000,
  stop: (T0 + 60 * MIN) / 1000,
  start_real: (T0 - 2 * MIN) / 1000,
  stop_real: (T0 + 70 * MIN) / 1000,
  channel: `ch-${uuid}`,
  channelname: channel,
  disp_title: title,
  broadcast: Number(uuid.replace(/\D/g, '')) || 1,
  sched_status: sched,
  status,
  errorcode,
  filesize: 1000,
  image: `https://img.example/${uuid}.jpg`,
})

before(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    tvh.requests.push(url.pathname)
    const bodies = {
      '/api/dvr/entry/grid_upcoming': { entries: tvh.upcoming },
      '/api/dvr/entry/grid_finished': { entries: [] },
      '/api/dvr/entry/grid_failed': { entries: [] },
      '/api/status/inputs': { entries: [LIVE_INPUT] },
      '/api/status/subscriptions': { entries: [{ ...LIVE_SUBSCRIPTION, channel: '9HD Sydney', in: 487296 }] },
      '/api/idnode/load': { entries: tvh.loaded[url.searchParams.get('uuid')] ? [tvh.loaded[url.searchParams.get('uuid')]] : [] },
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(bodies[url.pathname] || {}))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  await db.migrate.latest()
  await db('settings').insert({ key: 'tvh_url', value: `http://127.0.0.1:${server.address().port}` })
  await db('shows').insert({ id: 1, show_pattern: 'The Block', dest_folder: 'The Block', enabled: true })
})

after(async () => {
  await db.destroy()
  await new Promise((resolve) => server.close(resolve))
  await fs.rm(tmpDir, { recursive: true, force: true })
})

const poll = (nowMs) => getRecordingNow({ nowMs })

test('getRecordingNow: nothing recording costs one TVHeadend call per poll', async () => {
  tvh.requests = []
  const idle = await poll(T0)
  assert.deepEqual(idle.active, [])
  assert.deepEqual(idle.journeys, [])
  tvh.requests = []
  await poll(T0 + 10_000)
  assert.deepEqual(tvh.requests, ['/api/dvr/entry/grid_upcoming'])
})

test('getRecordingNow: one, then four concurrent recordings', async () => {
  tvh.upcoming = [rawEntry('r1'), { ...rawEntry('s9'), sched_status: 'scheduled' }]
  const one = await poll(T0 + 20_000)
  assert.equal(one.active.length, 1)
  assert.equal(one.active[0].signal, 100)
  assert.equal(one.active[0].bitsPerSecond, 487296 * 8)
  const cached = await poll(T0 + 21_000)
  assert.equal(cached, one)
  tvh.upcoming = ['r1', 'r2', 'r3', 'r4'].map((uuid) => rawEntry(uuid, { channel: `Channel ${uuid}` }))
  tvh.upcoming[0] = rawEntry('r1')
  tvh.upcoming[3] = rawEntry('r4', { sched: 'recordingError', status: 'No input detected', errorcode: 5 })
  const four = await poll(T0 + 30_000)
  assert.equal(four.active.length, 4)
  assert.equal(four.active[3].failed, true)
  assert.equal(four.active[3].statusText, 'No input detected')
})

test('getRecordingNow: ended recordings become journeys, failures turn red, and settled ones expire', async () => {
  tvh.upcoming = [rawEntry('r2', { channel: 'Channel r2' })]
  tvh.loaded = {
    r1: rawEntry('r1', { sched: 'completed', status: 'Completed OK' }),
    r3: rawEntry('r3', { sched: 'completedError', status: 'Time missed', errorcode: 1 }),
    r4: rawEntry('r4', { sched: 'completedError', status: 'No input detected', errorcode: 5 }),
  }
  const endedAt = T0 + 80 * MIN
  const ended = await poll(endedAt)
  assert.equal(ended.active.length, 1)
  const byId = Object.fromEntries(ended.journeys.map((j) => [j.uuid, j]))
  assert.deepEqual(byId.r1.steps.map((s) => s.state), ['done', 'pending', 'pending'])
  assert.equal(byId.r3.failed, true)
  assert.equal(byId.r3.statusText, 'Time missed')
  assert.ok(!JSON.stringify(ended).includes('img.example'))

  await db('recordings').insert({ recording_id: 'r1', show_id: 1, title: 'The Block', status: 'done', imported_at: '2026-09-30 11:00:00' })
  await db('syncs').insert({ status: 'ok', finished_at: '2026-09-30 11:01:00', summary_json: JSON.stringify({ plex: { triggered: true } }) })
  const inPlex = await poll(endedAt + 5 * MIN)
  const r1 = inPlex.journeys.find((j) => j.uuid === 'r1')
  assert.deepEqual(r1.steps.map((s) => s.state), ['done', 'done', 'done'])
  assert.equal(r1.settled, true)

  const later = await poll(endedAt + 16 * MIN)
  assert.equal(later.journeys.find((j) => j.uuid === 'r1'), undefined)
  assert.equal(later.journeys.find((j) => j.uuid === 'r3'), undefined)

  tvh.upcoming = []
  tvh.loaded.r2 = rawEntry('r2', { sched: 'completed', status: 'Completed OK' })
  const done = await poll(endedAt + 17 * MIN)
  assert.equal(done.active.length, 0)
  assert.deepEqual(done.journeys.map((j) => j.uuid), ['r2'])
})

test('describeJourney: a recording marked for re-record still imports, with a warning on Recorded', () => {
  const outcome = recordingOutcome(recording({ schedStatus: 'completedRerecord', dataErrors: 20 }))
  const { steps } = describeJourney({ outcome })
  assert.equal(outcome.failed, false)
  assert.equal(steps[0].state, 'warn')
  assert.match(steps[0].detail, /20 data errors/)
  assert.equal(steps[1].key, 'importing')
})
