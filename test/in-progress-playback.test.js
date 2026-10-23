import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough, Readable } from 'stream'
import { getEventListeners } from 'events'

import { abortableSleep, feedGrowing, recordingChecker, recordingStartedAtOf, scheduledEndAtOf, skipFirstBytes } from '../src/in-progress-playback.js'
import { planForFile, playbackArgsFor, view } from '../src/playback.js'

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

test('scheduledEndAtOf: the padded scheduled stop, else the scheduled stop', () => {
  assert.equal(scheduledEndAtOf({ stopPadded: 9, stop: 8 }), 9)
  assert.equal(scheduledEndAtOf({ stop: 8 }), 8)
  assert.equal(scheduledEndAtOf({}), null)
})

test('playbackArgsFor: a DVB-T recording with EPG, H.264, AC-3, and teletext maps the AC-3 track and encodes AAC', () => {
  const probe = {
    streams: [
      { index: 0, codec_type: 'data', codec_name: 'epg' },
      { index: 1, codec_type: 'video', codec_name: 'h264', height: 1080 },
      { index: 2, codec_type: 'audio', codec_name: 'ac3', tags: { language: 'eng' }, disposition: { visual_impaired: 0 } },
      { index: 3, codec_type: 'subtitle', codec_name: 'dvb_teletext', tags: { language: 'eng' } },
    ],
  }
  const plan = planForFile({ probe, encoder: { captions: false } })
  const args = playbackArgsFor({ plan, file: null, dir: '/tmp/p', piped: true })
  const maps = args.flatMap((arg, i) => (arg === '-map' ? [args[i + 1]] : []))
  assert.deepEqual(maps, ['0:1', '0:2'])
  assert.deepEqual(args.slice(args.indexOf('-c:a'), args.indexOf('-c:a') + 6), ['-c:a', 'aac', '-ac', '2', '-b:a', '128k'])
  assert.equal(args.includes('-an'), false)
  assert.equal(args[args.indexOf('-var_stream_map') + 1], 'v:0,a:0')
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
    inProgress: { recordingStartedAt: 99, scheduledEndAt: 199 },
    growing: true,
    producedSeconds: 42,
  }
  assert.deepEqual(
    (({ inProgress, growing, recordingStartedAt, scheduledEndAt, liveEdgeSeconds }) => ({ inProgress, growing, recordingStartedAt, scheduledEndAt, liveEdgeSeconds }))(view(session)),
    { inProgress: true, growing: true, recordingStartedAt: 99, scheduledEndAt: 199, liveEdgeSeconds: 42 },
  )
  assert.equal('inProgress' in view({ ...session, inProgress: null }), false)
})
