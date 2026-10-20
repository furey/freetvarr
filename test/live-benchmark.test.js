import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  benchmarkArgs,
  describeBenchmark,
  estimateStreams,
  roundOf,
  runLiveBenchmark,
  sampleArgs,
} from '../src/live-benchmark.js'

const VAAPI = { kind: 'vaapi', device: '/dev/dri/renderD128', lowPower: true }

test('sampleArgs: makes a broadcast-like 1080i H.264 transport stream with AC-3 audio', () => {
  const args = sampleArgs({ file: '/tmp/s.ts', seconds: 8 }).join(' ')
  assert.match(args, /testsrc2=size=1920x1080:rate=25:duration=8/)
  assert.match(args, /-c:v libx264 .*-flags \+ildct\+ilme -x264-params tff=1/)
  assert.match(args, /-c:a ac3 .*-f mpegts \/tmp\/s\.ts$/)
})

test('benchmarkArgs: software decodes the sample and uses the live libx264 settings', () => {
  const args = benchmarkArgs({ encoder: { kind: 'software' }, sample: '/tmp/s.ts' }).join(' ')
  assert.doesNotMatch(args, /hwaccel/)
  assert.match(args, /-f mpegts -i \/tmp\/s\.ts -map 0:v:0 -map 0:a:0/)
  assert.match(args, /-vf yadif=deint=interlaced,scale=-2:min\(ih\\,540\) -c:v libx264 -preset veryfast/)
  assert.match(args, /-f null -$/)
})

test('benchmarkArgs: VAAPI decodes in hardware like the live pipeline', () => {
  const args = benchmarkArgs({ encoder: VAAPI, sample: '/tmp/s.ts' }).join(' ')
  assert.match(args, /-hwaccel vaapi -hwaccel_device \/dev\/dri\/renderD128 -hwaccel_output_format vaapi/)
  assert.match(args, /-vf deinterlace_vaapi=auto=1,scale_vaapi/)
  assert.match(args, /-c:v h264_vaapi -low_power 1/)
  assert.doesNotMatch(args, /hwupload|lavfi/)
})

test('roundOf: the slowest stream decides, and a stream cut off by the deadline fails', () => {
  const done = (elapsedMs) => ({ finished: true, elapsedMs })
  assert.deepEqual(roundOf({ streams: 2, seconds: 8, results: [done(2900), done(3000)] }), { streams: 2, speed: 2.6, smooth: true })
  assert.equal(roundOf({ streams: 1, seconds: 8, results: [done(6700)] }).smooth, false)
  assert.equal(roundOf({ streams: 1, seconds: 8, results: [{ finished: false, elapsedMs: 6600 }] }).smooth, false)
})

test('estimateStreams: highest count before the first rough round, or 0', () => {
  const round = (streams, smooth) => ({ streams, speed: 2, smooth })
  assert.equal(estimateStreams([round(1, true), round(2, true), round(3, false)]), 2)
  assert.equal(estimateStreams([round(1, true), round(2, true), round(3, true), round(4, true)]), 4)
  assert.equal(estimateStreams([round(1, false)]), 0)
  assert.equal(estimateStreams([]), 0)
})

test('runLiveBenchmark: runs 1, 2, 3 streams in parallel and stops at the first rough round', async () => {
  const seen = []
  let active = 0
  let round = 0
  const elapsedFor = { 1: 2200, 2: 3000, 3: 7000 }
  const result = await runLiveBenchmark({
    encoder: VAAPI,
    seconds: 8,
    prepareSample: async () => '/tmp/s.ts',
    run: async ({ args, timeoutMs }) => {
      assert.ok(args.includes('/tmp/s.ts'))
      assert.equal(timeoutMs, 6667)
      if (active === 0) round += 1
      active += 1
      seen.push(active)
      const elapsedMs = elapsedFor[round]
      await new Promise((resolve) => setImmediate(resolve))
      active -= 1
      return { finished: elapsedMs < timeoutMs, elapsedMs }
    },
    now: () => 42,
  })
  assert.deepEqual(seen, [1, 1, 2, 1, 2, 3])
  assert.deepEqual(result, {
    encoder: 'vaapi',
    speed: 3.6,
    estimated: 2,
    measuredAt: 42,
    seconds: 8,
    rounds: [
      { streams: 1, speed: 3.6, smooth: true },
      { streams: 2, speed: 2.6, smooth: true },
      { streams: 3, speed: 1.1, smooth: false },
    ],
  })
  assert.equal(describeBenchmark(result), 'Hardware transcoding measured smooth for 2 live streams at once, each at 2.6× real time or better')
})

test('describeBenchmark: names a machine too slow for one stream', () => {
  assert.equal(
    describeBenchmark({ encoder: 'software', estimated: 0, rounds: [{ streams: 1, speed: 0.9, smooth: false }] }),
    'Software transcoding measured too slow for 1 smooth live stream',
  )
})

test('runLiveBenchmark: pass-through needs no test encode', async () => {
  const result = await runLiveBenchmark({ encoder: { kind: 'copy' }, run: async () => assert.fail('ran'), now: () => 1 })
  assert.equal(result.estimated, 4)
  assert.equal(describeBenchmark(result), 'Video passes through without transcoding')
})
