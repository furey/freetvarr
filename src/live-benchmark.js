import { spawn } from 'child_process'

import { pickStreams, videoCodecArgs } from './live-tv.js'
import { vaapiFilters } from './live-encoder.js'

export const BENCHMARK_SECONDS = 10
export const STREAM_HEADROOM = 1.5
export const MAX_ESTIMATED_STREAMS = 4

export const estimateStreams = (speed) => {
  if (!Number.isFinite(speed) || speed <= 0) return 1
  return Math.min(MAX_ESTIMATED_STREAMS, Math.max(1, Math.floor(speed / STREAM_HEADROOM)))
}

export const benchmarkArgs = ({ encoder, seconds = BENCHMARK_SECONDS }) => [
  '-hide_banner',
  '-loglevel', 'error',
  '-nostdin',
  ...(encoder.kind === 'vaapi' ? ['-init_hw_device', `vaapi=va:${encoder.device}`, '-filter_hw_device', 'va'] : []),
  '-f', 'lavfi',
  '-i', `testsrc2=size=1920x1080:rate=25:duration=${seconds},setfield=tff`,
  '-f', 'lavfi',
  '-i', `sine=frequency=440:sample_rate=48000:duration=${seconds}`,
  ...benchmarkVideoArgs(encoder),
  '-c:a', 'aac', '-ac', '2', '-b:a', '128k',
  '-f', 'null', '-',
]

export const benchmarkVideoArgs = (encoder) => {
  const plan = pickStreams({ streams: [BROADCAST_HD_VIDEO], encoder: { ...encoder, captions: false } })
  const [, filters, ...encoderArgs] = videoCodecArgs(plan)
  if (plan.videoMode === 'vaapi') return ['-vf', `format=nv12,hwupload,${vaapiFilters()}`, ...encoderArgs]
  return ['-vf', filters, ...encoderArgs]
}

export const benchmarkResult = ({ encoder, seconds, elapsedMs, now }) => {
  const speed = Math.round((seconds / (elapsedMs / 1000)) * 10) / 10
  return { encoder: encoder.kind, speed, estimated: estimateStreams(speed), measuredAt: now, seconds }
}

export const passThroughResult = ({ now }) => ({
  encoder: 'copy', speed: null, estimated: MAX_ESTIMATED_STREAMS, measuredAt: now, seconds: 0,
})

export const runLiveBenchmark = async ({
  encoder,
  seconds = BENCHMARK_SECONDS,
  run = runNiceFfmpeg,
  clock = () => performance.now(),
  now = Date.now,
}) => {
  if (encoder.kind === 'copy') return passThroughResult({ now: now() })
  const startedAt = clock()
  await run(benchmarkArgs({ encoder, seconds }))
  return benchmarkResult({ encoder, seconds, elapsedMs: clock() - startedAt, now: now() })
}

export const describeBenchmark = (benchmark) => {
  if (!benchmark) return null
  if (benchmark.encoder === 'copy') return 'Video passes through without transcoding'
  const kind = benchmark.encoder === 'vaapi' ? 'Hardware' : 'Software'
  return `${kind} transcoding measured at ${benchmark.speed}× real time, enough for ${benchmark.estimated} at once`
}

const runNiceFfmpeg = (args) => new Promise((resolve, reject) => {
  const child = spawn('nice', ['-n', String(NICENESS), 'ffmpeg', ...args], { stdio: ['ignore', 'ignore', 'pipe'] })
  const errors = []
  child.stderr.on('data', (chunk) => errors.push(String(chunk)))
  child.on('error', reject)
  child.on('exit', (code) => {
    if (code === 0) return resolve()
    reject(new Error(errors.join('').trim().split('\n').pop() || `ffmpeg exited (${code}).`))
  })
})

const NICENESS = 10
const BROADCAST_HD_VIDEO = { pid: 0x100, type: 'H264', language: '', audioType: null, height: 1080 }
