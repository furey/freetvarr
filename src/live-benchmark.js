import { spawn } from 'child_process'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import { hardwareDecodeArgs, pickStreams, videoCodecArgs } from './live-tv.js'

export const BENCHMARK_SECONDS = 8
export const SMOOTH_SPEED = 1.2
export const MAX_ESTIMATED_STREAMS = 4
export const SAMPLE_DIR = path.join(os.tmpdir(), 'freetvarr-live-benchmark')

export const sampleFileOf = ({ dir = SAMPLE_DIR, seconds = BENCHMARK_SECONDS }) =>
  path.join(dir, `broadcast-1080i-${seconds}s.ts`)

export const sampleArgs = ({ file, seconds = BENCHMARK_SECONDS }) => [
  '-hide_banner',
  '-loglevel', 'error',
  '-nostdin',
  '-y',
  '-f', 'lavfi',
  '-i', `testsrc2=size=1920x1080:rate=25:duration=${seconds}`,
  '-f', 'lavfi',
  '-i', `sine=frequency=440:sample_rate=48000:duration=${seconds}`,
  '-vf', 'setfield=tff',
  '-c:v', 'libx264',
  '-preset', 'ultrafast',
  '-flags', '+ildct+ilme',
  '-x264-params', 'tff=1',
  '-b:v', '8M', '-maxrate', '8M', '-bufsize', '4M',
  '-g', '25',
  '-pix_fmt', 'yuv420p',
  '-c:a', 'ac3', '-b:a', '384k',
  '-f', 'mpegts',
  file,
]

export const benchmarkArgs = ({ encoder, sample }) => {
  const plan = benchmarkPlan(encoder)
  return [
    '-hide_banner',
    '-loglevel', 'error',
    '-nostdin',
    ...hardwareDecodeArgs(plan),
    '-fflags', '+genpts+discardcorrupt',
    '-f', 'mpegts',
    '-i', sample,
    '-map', '0:v:0',
    '-map', '0:a:0',
    ...videoCodecArgs(plan),
    '-c:a', 'aac', '-ac', '2', '-b:a', '128k',
    '-f', 'null', '-',
  ]
}

export const benchmarkPlan = (encoder) =>
  pickStreams({ streams: [BROADCAST_HD_VIDEO], encoder: { ...encoder, captions: false } })

export const streamSpeed = ({ seconds, elapsedMs }) => Math.floor((seconds / (elapsedMs / 1000)) * 10) / 10

export const roundOf = ({ streams, seconds, results }) => {
  const speed = Math.min(...results.map(({ elapsedMs }) => streamSpeed({ seconds, elapsedMs })))
  const smooth = results.every((r) => r.finished) && speed >= SMOOTH_SPEED
  return { streams, speed, smooth }
}

export const estimateStreams = (rounds) => {
  const firstRough = rounds.findIndex((round) => !round.smooth)
  const smoothRounds = firstRough === -1 ? rounds : rounds.slice(0, firstRough)
  return smoothRounds.length ? smoothRounds[smoothRounds.length - 1].streams : 0
}

export const benchmarkResult = ({ encoder, seconds, rounds, now }) => {
  const estimated = estimateStreams(rounds)
  return {
    encoder: encoder.kind,
    speed: rounds[0]?.speed ?? null,
    estimated,
    measuredAt: now,
    seconds,
    rounds,
  }
}

export const passThroughResult = ({ now }) => ({
  encoder: 'copy', speed: null, estimated: MAX_ESTIMATED_STREAMS, measuredAt: now, seconds: 0, rounds: [],
})

export const runLiveBenchmark = async ({
  encoder,
  seconds = BENCHMARK_SECONDS,
  maxStreams = MAX_ESTIMATED_STREAMS,
  run = runNiceFfmpeg,
  prepareSample = ensureSample,
  now = Date.now,
}) => {
  if (encoder.kind === 'copy') return passThroughResult({ now: now() })
  const sample = await prepareSample({ seconds, run })
  const args = benchmarkArgs({ encoder, sample })
  const timeoutMs = Math.ceil((seconds / SMOOTH_SPEED) * 1000)
  const rounds = []
  for (let streams = 1; streams <= maxStreams; streams += 1) {
    const results = await Promise.all(Array.from({ length: streams }, () => run({ args, timeoutMs })))
    const round = roundOf({ streams, seconds, results })
    rounds.push(round)
    if (!round.smooth) break
  }
  return benchmarkResult({ encoder, seconds, rounds, now: now() })
}

export const describeBenchmark = (benchmark) => {
  if (!benchmark) return null
  if (benchmark.encoder === 'copy') return 'Video passes through without transcoding'
  const kind = benchmark.encoder === 'vaapi' ? 'Hardware' : 'Software'
  if (!benchmark.estimated) return `${kind} transcoding measured too slow for 1 smooth live stream`
  const smoothest = (benchmark.rounds || []).find((round) => round.streams === benchmark.estimated)
  const each = smoothest ? `, each at ${smoothest.speed}× real time or better` : ''
  return `${kind} transcoding measured smooth for ${streamsText(benchmark.estimated)} at once${each}`
}

export const ensureSample = async ({ seconds = BENCHMARK_SECONDS, dir = SAMPLE_DIR, run = runNiceFfmpeg } = {}) => {
  const file = sampleFileOf({ dir, seconds })
  if (await hasContent(file)) return file
  await fs.mkdir(dir, { recursive: true })
  const partial = `${file}.part.ts`
  const { finished } = await run({ args: sampleArgs({ file: partial, seconds }), timeoutMs: SAMPLE_TIMEOUT_MS })
  if (!finished) throw new Error('Making the test recording took too long.')
  await fs.rename(partial, file)
  return file
}

const streamsText = (n) => (n === 1 ? '1 live stream' : `${n} live streams`)

const hasContent = async (file) => {
  try {
    return (await fs.stat(file)).size > 0
  } catch {
    return false
  }
}

const runNiceFfmpeg = ({ args, timeoutMs }) => new Promise((resolve, reject) => {
  const startedAt = performance.now()
  const child = spawn('nice', ['-n', String(NICENESS), 'ffmpeg', ...args], { stdio: ['ignore', 'ignore', 'pipe'] })
  const errors = []
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    child.kill('SIGKILL')
  }, timeoutMs)
  child.stderr.on('data', (chunk) => errors.push(String(chunk)))
  child.on('error', (err) => {
    clearTimeout(timer)
    reject(err)
  })
  child.on('exit', (code) => {
    clearTimeout(timer)
    const elapsedMs = performance.now() - startedAt
    if (timedOut) return resolve({ finished: false, elapsedMs })
    if (code === 0) return resolve({ finished: true, elapsedMs })
    reject(new Error(errors.join('').trim().split('\n').pop() || `ffmpeg exited (${code}).`))
  })
})

const NICENESS = 10
const SAMPLE_TIMEOUT_MS = 60_000
const BROADCAST_HD_VIDEO = { pid: 0x100, type: 'H264', language: '', audioType: null, height: 1080 }
