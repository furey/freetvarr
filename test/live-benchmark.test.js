import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  benchmarkArgs,
  describeBenchmark,
  estimateStreams,
  runLiveBenchmark,
} from '../src/live-benchmark.js'

test('estimateStreams: keeps 50% headroom and stays within 1–4', () => {
  assert.deepEqual([0.5, 1.4, 2.9, 3, 6.2, 30, NaN].map(estimateStreams), [1, 1, 1, 2, 4, 4, 1])
})

test('benchmarkArgs: software uses the live libx264 settings on a 1080i test picture', () => {
  const args = benchmarkArgs({ encoder: { kind: 'software' }, seconds: 10 }).join(' ')
  assert.match(args, /testsrc2=size=1920x1080:rate=25:duration=10,setfield=tff/)
  assert.match(args, /-vf yadif=deint=interlaced,scale=-2:min\(ih\\,540\) -c:v libx264 -preset veryfast/)
  assert.match(args, /-f null -$/)
})

test('benchmarkArgs: VAAPI uploads the picture and uses the live VAAPI encoder', () => {
  const args = benchmarkArgs({ encoder: { kind: 'vaapi', device: '/dev/dri/renderD128', lowPower: true } }).join(' ')
  assert.match(args, /-init_hw_device vaapi=va:\/dev\/dri\/renderD128 -filter_hw_device va/)
  assert.match(args, /-vf format=nv12,hwupload,deinterlace_vaapi/)
  assert.match(args, /-c:v h264_vaapi -low_power 1/)
})

test('runLiveBenchmark: speed is seconds encoded over seconds taken', async () => {
  let t = 0
  const result = await runLiveBenchmark({
    encoder: { kind: 'vaapi', device: '/dev/dri/renderD128', lowPower: false },
    run: async () => { t += 1600 },
    clock: () => t,
    now: () => 42,
  })
  assert.deepEqual(result, { encoder: 'vaapi', speed: 6.3, estimated: 4, measuredAt: 42, seconds: 10 })
  assert.equal(describeBenchmark(result), 'Hardware transcoding measured at 6.3× real time, enough for 4 at once')
})

test('runLiveBenchmark: pass-through needs no test encode', async () => {
  const result = await runLiveBenchmark({ encoder: { kind: 'copy' }, run: async () => assert.fail('ran'), now: () => 1 })
  assert.equal(result.estimated, 4)
  assert.equal(describeBenchmark(result), 'Video passes through without transcoding')
})
