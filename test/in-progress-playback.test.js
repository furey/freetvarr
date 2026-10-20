import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough, Readable } from 'stream'
import { getEventListeners } from 'events'

import { abortableSleep, feedGrowing, recordingChecker, recordingStartedAtOf, skipFirstBytes } from '../src/in-progress-playback.js'
import { playbackArgsFor, view } from '../src/playback.js'

const collect = (sink) => {
  const chunks = []
  sink.on('data', (c) => chunks.push(c))
  return () => Buffer.concat(chunks).toString()
}

test('feedGrowing: follows a growing file and ends once the recording has stopped', async () => {
  const file = ['abc', '', 'def', '', '', '']
  let recording = true
  const opened = []
  const sink = new PassThrough()
  const read = collect(sink)
  const ended = new Promise((resolve) => sink.on('end', resolve))
  const written = await feedGrowing({
    open: async ({ start }) => {
      opened.push(start)
      const next = file.shift() ?? ''
      if (next === 'def') recording = false
      return next ? Readable.from([Buffer.from(next)]) : null
    },
    sink,
    isRecording: async () => recording,
    signal: new AbortController().signal,
    sleep: async () => {},
  })
  await ended
  assert.equal(written, 6)
  assert.equal(read(), 'abcdef')
  assert.deepEqual(opened, [0, 3, 3, 6, 6])
})

test('feedGrowing: keeps waiting while the recording runs, and stops on abort', async () => {
  const controller = new AbortController()
  let polls = 0
  const sink = new PassThrough()
  const written = await feedGrowing({
    open: async () => null,
    sink,
    isRecording: async () => true,
    signal: controller.signal,
    sleep: async () => {
      polls += 1
      if (polls === 5) controller.abort()
    },
  })
  assert.equal(written, 0)
  assert.equal(sink.writableEnded, false)
})

test('abortableSleep: removes its abort listener after each wait', async () => {
  const controller = new AbortController()
  for (let i = 0; i < 20; i += 1) await abortableSleep(0, controller.signal)
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0)
})

test('abortableSleep: wakes early on abort', async () => {
  const controller = new AbortController()
  const started = Date.now()
  const sleeping = abortableSleep(60_000, controller.signal)
  controller.abort()
  await sleeping
  assert.ok(Date.now() - started < 1000)
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0)
})

test('recordingChecker: asks TVHeadend at most every 5 s and keeps the last answer on errors', async () => {
  let t = 0
  const answers = [{ schedStatus: 'recording' }, Promise.reject(new Error('down')), { schedStatus: 'completed' }]
  let calls = 0
  const check = recordingChecker({
    uuid: 'u',
    conn: {},
    now: () => t,
    load: async () => {
      calls += 1
      return answers.shift()
    },
  })
  assert.equal(await check(), true)
  t = 1000
  assert.equal(await check(), true)
  assert.equal(calls, 1)
  t = 6000
  assert.equal(await check(), true)
  t = 12000
  assert.equal(await check(), false)
})

test('skipFirstBytes: drops the bytes a server without ranges sends again', async () => {
  const out = Readable.from([Buffer.from('ab'), Buffer.from('cdef')]).pipe(skipFirstBytes(3))
  const chunks = []
  for await (const c of out) chunks.push(c)
  assert.equal(Buffer.concat(chunks).toString(), 'def')
})

test('recordingStartedAtOf: the time TVHeadend started the file, else the padded start', () => {
  assert.equal(recordingStartedAtOf({ recordingSince: 5, startPadded: 1 }), 5)
  assert.equal(recordingStartedAtOf({ recordingSince: null, startPadded: 1 }), 1)
})

test('playbackArgsFor: a piped session reads stdin and keeps the EVENT playlist', () => {
  const plan = { video: { index: 0 }, audio: { index: 1 }, teletext: null, videoMode: 'copy' }
  const args = playbackArgsFor({ plan, file: '/r/a.ts', dir: '/tmp/p', piped: true })
  assert.equal(args.includes('-nostdin'), false)
  assert.equal(args[args.indexOf('-i') + 1], 'pipe:0')
  assert.equal(args[args.indexOf('-hls_playlist_type') + 1], 'event')
})

test('view: an in-progress session reports its live edge', () => {
  const session = {
    id: 'a'.repeat(16),
    recordingId: 'dvr1',
    status: 'ready',
    offset: 0,
    duration: null,
    finished: false,
    plan: {},
    inProgress: { recordingStartedAt: 99 },
    growing: true,
    producedSeconds: 42,
  }
  assert.deepEqual(
    (({ inProgress, growing, recordingStartedAt, liveEdgeSeconds }) => ({ inProgress, growing, recordingStartedAt, liveEdgeSeconds }))(view(session)),
    { inProgress: true, growing: true, recordingStartedAt: 99, liveEdgeSeconds: 42 },
  )
  assert.equal('inProgress' in view({ ...session, inProgress: null }), false)
})
