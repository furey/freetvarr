import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  createLiveStreams,
  defaultLiveStreams,
  envStreamCapFrom,
  liveStreamLimit,
  storedStreamsFrom,
  benchmarkFrom,
  betterBenchmark,
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
    pause: async () => {},
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

test('betterBenchmark: keeps more smooth streams, then the faster run', () => {
  const slow = { ...BENCHMARK, estimated: 0, speed: 1.1 }
  const fast = { ...BENCHMARK, estimated: 1, speed: 1.4 }
  assert.equal(betterBenchmark(slow, fast), fast)
  assert.equal(betterBenchmark(fast, slow), fast)
  assert.equal(betterBenchmark({ ...fast, speed: 1.3 }, fast), fast)
  assert.equal(betterBenchmark(fast, null), fast)
})

const twoRunHarness = ({ results, busyAfter = Infinity, encoder = { kind: 'vaapi' } }) => {
  const store = {}
  let runs = 0
  let pauses = 0
  const streams = createLiveStreams({
    encoderReady: Promise.resolve(encoder),
    getSetting: async (key) => store[key] ?? null,
    setSetting: async (key, value) => { store[key] = value },
    readTunerCount: async () => 2,
    isBusy: () => runs >= busyAfter,
    benchmark: async () => {
      const result = results[runs]
      runs += 1
      if (result instanceof Error) throw result
      return result
    },
    pause: async () => { pauses += 1 },
  })
  return { streams, store, runs: () => runs, pauses: () => pauses }
}

test('createLiveStreams: two runs keep the better result in the saved format', async () => {
  const slow = { ...BENCHMARK, estimated: 0, speed: 1.1 }
  const fast = { ...BENCHMARK, estimated: 1, speed: 1.4 }
  const h = twoRunHarness({ results: [slow, fast] })
  await h.streams.load()
  const outcome = await h.streams.measure({ runs: 2 })
  assert.deepEqual(outcome.benchmark, fast)
  assert.equal(h.pauses(), 1)
  assert.deepEqual(benchmarkFrom(h.store.live_benchmark), fast)
})

test('createLiveStreams: a failed or interrupted second run keeps the first', async () => {
  const first = { ...BENCHMARK, estimated: 1, speed: 1.3 }
  const failed = twoRunHarness({ results: [first, new Error('ffmpeg exited (1).')] })
  assert.deepEqual((await failed.streams.measure({ runs: 2 })).benchmark, first)
  const interrupted = twoRunHarness({ results: [first, BENCHMARK], busyAfter: 1 })
  assert.deepEqual((await interrupted.streams.measure({ runs: 2 })).benchmark, first)
  assert.equal(interrupted.runs(), 1)
})

test('createLiveStreams: pass-through video runs once', async () => {
  const copy = { encoder: 'copy', speed: null, estimated: 4, measuredAt: 1, seconds: 0, rounds: [] }
  const h = twoRunHarness({ results: [copy, copy], encoder: { kind: 'copy' } })
  await h.streams.measure({ runs: 2 })
  assert.equal(h.runs(), 1)
  assert.equal(h.pauses(), 0)
})

test('createLiveStreams: reports waiting, running, then nothing for the first measurement', async () => {
  let finish = null
  const streams = createLiveStreams({
    encoderReady: Promise.resolve({ kind: 'vaapi' }),
    getSetting: async (key) => (key === 'live_benchmark' ? JSON.stringify(BENCHMARK) : null),
    setSetting: async () => {},
    readTunerCount: async () => 2,
    benchmark: () => new Promise((resolve) => { finish = resolve }),
  })
  await streams.load()
  assert.equal(streams.describe().measuring, 'waiting')
  assert.equal(streams.describe().benchmark.speed, 6.2)
  assert.equal(streams.current(), 2)
  const run = streams.measure()
  await new Promise(setImmediate)
  assert.equal(streams.describe().measuring, 'running')
  finish({ ...BENCHMARK, estimated: 1 })
  await run
  assert.equal(streams.describe().measuring, null)
})

test('createLiveStreams: a failed measurement stops reporting measuring', async () => {
  const streams = createLiveStreams({
    encoderReady: Promise.resolve({ kind: 'vaapi' }),
    getSetting: async () => null,
    setSetting: async () => {},
    readTunerCount: async () => 2,
    benchmark: async () => { throw new Error('ffmpeg exited (1).') },
  })
  await assert.rejects(streams.measure())
  assert.equal(streams.describe().measuring, null)
})
