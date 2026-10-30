import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createLoopMonitor, requestLabelOf, stallLineOf } from '../src/event-loop-lag.js'

const fakeHistogram = () => ({
  max: 0,
  count: 0,
  mean: 0,
  percentile: () => 0,
  enable() {},
  disable() {},
  reset() { this.max = 0 },
})

const harness = (options = {}) => {
  const clock = { ms: 0, cpuMicros: 0 }
  const lines = []
  const windowHistogram = fakeHistogram()
  const monitor = createLoopMonitor({
    now: () => clock.ms,
    cpuUsage: (previous) => (previous
      ? { user: clock.cpuMicros - previous.user, system: 0 }
      : { user: clock.cpuMicros, system: 0 }),
    log: (line) => lines.push(line),
    setRepeat: () => ({}),
    clearRepeat: () => {},
    observeGc: () => () => {},
    histogram: fakeHistogram(),
    windowHistogram,
    ...options,
  })
  monitor.start()
  const tick = ({ wallMs = 500, cpuMs = 0, windowMaxMs = 0 } = {}) => {
    clock.ms += wallMs
    clock.cpuMicros += cpuMs * 1000
    windowHistogram.max = windowMaxMs * 1e6
    monitor.check()
  }
  return { clock, lines, monitor, tick }
}

test('a quiet loop logs nothing', () => {
  const { lines, tick, monitor } = harness()
  for (let i = 0; i < 40; i += 1) tick({ cpuMs: 5, windowMaxMs: 12 })
  assert.deepEqual(lines, [])
  assert.equal(monitor.stats().stalls, 0)
})

test('a timer drift over the threshold logs one line naming the job that ran', () => {
  const { clock, lines, tick, monitor } = harness()
  monitor.measureSync('hero-build', () => { clock.ms += 250 })
  tick({ wallMs: 500, cpuMs: 240 })
  assert.equal(lines.length, 1)
  assert.match(lines[0], /^\[loop\] stall 250 ms \| cpu 240 ms of 750 ms \| jobs hero-build=250ms/)
  assert.match(lines[0], /1 in window, 1 total$/)
})

test('a stall seen only by the delay histogram still counts', () => {
  const { lines, tick } = harness()
  tick({ windowMaxMs: 190, cpuMs: 10 })
  assert.equal(lines.length, 1)
  assert.match(lines[0], /stall 180 ms \| cpu 10 ms of 500 ms \| jobs none/)
})

test('one stall seen by drift and then by the histogram counts once', () => {
  const { monitor, tick } = harness()
  tick({ wallMs: 700 })
  tick({ windowMaxMs: 200 })
  assert.equal(monitor.stats().stalls, 1)
})

test('stalls inside the log window fold into the next line with a count', () => {
  const { lines, tick } = harness()
  tick({ wallMs: 650 })
  tick({ wallMs: 900 })
  tick({ wallMs: 700 })
  assert.equal(lines.length, 1)
  for (let i = 0; i < 20; i += 1) tick()
  assert.equal(lines.length, 2)
  assert.match(lines[1], /stall 400 ms .*2 in window, 3 total$/)
})

test('measureJob marks a job active until its promise settles', async () => {
  const { monitor } = harness()
  let finish
  const job = monitor.measureJob('guide-load', () => new Promise((resolve) => { finish = resolve }))
  assert.deepEqual(monitor.stats().active, ['guide-load'])
  finish('done')
  assert.equal(await job, 'done')
  assert.deepEqual(monitor.stats().active, [])
})

test('measureJob clears the active mark when the job throws', () => {
  const { monitor } = harness()
  assert.throws(() => monitor.measureJob('boom', () => { throw new Error('x') }))
  assert.deepEqual(monitor.stats().active, [])
})

test('stats keep per-label counts and the slowest run', () => {
  const { clock, monitor } = harness()
  monitor.measureSync('prune', () => { clock.ms += 30 })
  monitor.measureSync('prune', () => { clock.ms += 70 })
  const [prune] = monitor.stats().jobs
  assert.deepEqual(prune, { label: 'prune', runs: 2, totalMs: 100, maxMs: 70 })
})

test('stallLineOf lists garbage collection pauses and the jobs that ran', () => {
  const line = stallLineOf({
    stall: { ms: 300, cpuMs: 290, windowMs: 520, jobs: [], gc: [{ kind: 'major', ms: 220 }], during: ['sync'] },
    count: 1,
    total: 4,
  })
  assert.equal(line, '[loop] stall 300 ms | cpu 290 ms of 520 ms | jobs none | gc major=220ms | during sync | 1 in window, 4 total')
})

test('requestLabelOf keeps the first three path segments', () => {
  assert.equal(requestLabelOf({ method: 'GET', path: '/api/images/show/abc123/400' }), 'GET /api/images/show')
  assert.equal(requestLabelOf({ method: 'GET', path: '/api/guide' }), 'GET /api/guide')
})

test('a stall names an async job that finished inside the window', async () => {
  const { clock, lines, monitor, tick } = harness()
  await monitor.measureJob('hero-build', async () => { clock.ms += 300 })
  tick({ wallMs: 400, cpuMs: 290 })
  assert.match(lines[0], /stall 200 ms .*\| during hero-build \|/)
})
