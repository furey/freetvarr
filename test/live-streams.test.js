import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  createLiveStreams,
  defaultLiveStreams,
  envStreamCapFrom,
  liveStreamLimit,
  storedStreamsFrom,
  benchmarkFrom,
} from '../src/live-streams.js'

const BENCHMARK = { encoder: 'vaapi', speed: 6.2, estimated: 4, measuredAt: 1, seconds: 10 }

test('envStreamCapFrom: only a set, positive LIVE_TV_MAX_SESSIONS caps the limit', () => {
  assert.equal(envStreamCapFrom(undefined), null)
  assert.equal(envStreamCapFrom(''), null)
  assert.equal(envStreamCapFrom('zero'), null)
  assert.equal(envStreamCapFrom('0'), null)
  assert.equal(envStreamCapFrom('3'), 3)
})

test('storedStreamsFrom: accepts 1 to 4 only', () => {
  assert.deepEqual([1, 2, '2', 3, 4, 5, 0, '', null].map(storedStreamsFrom), [1, 2, 2, 3, 4, null, null, null, null])
})

test('defaultLiveStreams: env wins, then the benchmark capped by tuners and the player, then the encoder', () => {
  assert.equal(defaultLiveStreams({ cap: 3, benchmark: BENCHMARK, tunerCount: 1, encoderKind: 'software' }), 3)
  assert.equal(defaultLiveStreams({ cap: null, benchmark: BENCHMARK, tunerCount: 4, encoderKind: 'vaapi' }), 4)
  assert.equal(defaultLiveStreams({ cap: null, benchmark: { ...BENCHMARK, estimated: 6 }, tunerCount: 8 }), 4)
  assert.equal(defaultLiveStreams({ cap: null, benchmark: BENCHMARK, tunerCount: 3, encoderKind: 'vaapi' }), 3)
  assert.equal(defaultLiveStreams({ cap: null, benchmark: BENCHMARK, tunerCount: 1, encoderKind: 'vaapi' }), 1)
  assert.equal(defaultLiveStreams({ cap: null, benchmark: { ...BENCHMARK, estimated: 1 }, tunerCount: null }), 1)
  assert.equal(defaultLiveStreams({ cap: null, benchmark: null, encoderKind: 'vaapi' }), 2)
  assert.equal(defaultLiveStreams({ cap: null, benchmark: null, encoderKind: 'software' }), 1)
})

test('liveStreamLimit: a stored choice beats the default but never the env cap', () => {
  const capped = liveStreamLimit({ stored: 2, cap: 1, benchmark: null, encoderKind: 'vaapi' })
  assert.equal(capped.max_live_streams, 1)
  assert.deepEqual(capped.choices, [1])
  const chosen = liveStreamLimit({ stored: 1, cap: null, benchmark: BENCHMARK, tunerCount: 2, encoderKind: 'vaapi' })
  assert.deepEqual(
    { max: chosen.max_live_streams, default: chosen.default, choices: chosen.choices, hw: chosen.hardware_transcode },
    { max: 1, default: 2, choices: [1, 2], hw: true },
  )
})

test('liveStreamLimit: choices run 1 to 4 and stop at the tuner count', () => {
  assert.deepEqual(liveStreamLimit({ stored: null, cap: null, benchmark: BENCHMARK, tunerCount: 4 }).choices, [1, 2, 3, 4])
  assert.deepEqual(liveStreamLimit({ stored: null, cap: null, benchmark: BENCHMARK, tunerCount: 3 }).choices, [1, 2, 3])
  assert.deepEqual(liveStreamLimit({ stored: null, cap: null, benchmark: null, tunerCount: null }).choices, [1, 2, 3, 4])
  const over = liveStreamLimit({ stored: 4, cap: null, benchmark: BENCHMARK, tunerCount: 2 })
  assert.deepEqual({ max: over.max_live_streams, choices: over.choices }, { max: 2, choices: [1, 2] })
})

test('benchmarkFrom: reads a saved result and ignores junk', () => {
  assert.deepEqual(benchmarkFrom(JSON.stringify(BENCHMARK)), BENCHMARK)
  assert.equal(benchmarkFrom('{'), null)
  assert.equal(benchmarkFrom(null), null)
})

const harness = ({ settings = {}, busy = false, encoder = { kind: 'vaapi' }, envValue, tunerCount = 2 } = {}) => {
  const store = { ...settings }
  let runs = 0
  const streams = createLiveStreams({
    envValue,
    encoderReady: Promise.resolve(encoder),
    getSetting: async (key) => store[key] ?? null,
    setSetting: async (key, value) => { store[key] = value },
    readTunerCount: async () => tunerCount,
    isBusy: () => busy,
    benchmark: async () => {
      runs += 1
      return { ...BENCHMARK, estimated: 1 }
    },
  })
  return { streams, store, runs: () => runs }
}

test('createLiveStreams: loads the saved choice and a benchmark for the same encoder', async () => {
  const h = harness({ settings: { live_benchmark: JSON.stringify(BENCHMARK) } })
  await h.streams.load()
  assert.equal(h.streams.current(), 2)
  assert.equal(h.streams.describe().benchmark.speed, 6.2)
  const other = harness({ settings: { live_benchmark: JSON.stringify(BENCHMARK) }, encoder: { kind: 'software' } })
  await other.streams.load()
  assert.equal(other.streams.describe().benchmark, null)
})

test('createLiveStreams: an empty LIVE_TV_MAX_SESSIONS from compose lets the benchmark pick the default', async () => {
  const settings = { live_benchmark: JSON.stringify(BENCHMARK) }
  const empty = harness({ settings, envValue: '', tunerCount: 4 })
  await empty.streams.load()
  assert.equal(empty.streams.current(), 4)
  assert.equal(empty.streams.describe().cap, null)
  const capped = harness({ settings, envValue: '2', tunerCount: 4 })
  await capped.streams.load()
  assert.equal(capped.streams.current(), 2)
  assert.deepEqual(capped.streams.describe().choices, [1, 2])
})

test('createLiveStreams: measuring saves the result and lowers the default', async () => {
  const h = harness()
  await h.streams.load()
  const outcome = await h.streams.measure()
  assert.equal(outcome.benchmark.estimated, 1)
  assert.equal(h.streams.current(), 1)
  assert.equal(JSON.parse(h.store.live_benchmark).estimated, 1)
  await h.streams.setStored(2)
  assert.equal(h.streams.current(), 2)
  assert.equal(h.store.max_live_streams, '2')
  await h.streams.setStored(null)
  assert.equal(h.streams.current(), 1)
})

test('createLiveStreams: skips the benchmark while a stream is running', async () => {
  const h = harness({ busy: true })
  await h.streams.load()
  assert.deepEqual(await h.streams.measure(), { skipped: 'busy' })
  assert.equal(h.runs(), 0)
})
