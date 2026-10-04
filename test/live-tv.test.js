import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'

import {
  pickStreams,
  ffmpegArgsFor,
  tunerVerdict,
  stallReason,
  createLiveSessions,
  LIVE_FILE_PATTERN,
  withoutCutInSegment,
  hasSegments,
  liveSegmentCount,
  liveBufferMinutesFrom,
} from '../src/live-tv.js'

const ABC_SD = [
  { pid: 512, type: 'MPEG2VIDEO', language: '', audioType: null, height: 576 },
  { pid: 650, type: 'MPEG2AUDIO', language: 'eng', audioType: 0, height: null },
  { pid: 750, type: 'MPEG2AUDIO', language: 'aus', audioType: 3, height: null },
  { pid: 576, type: 'TELETEXT', language: '', audioType: null, height: null },
]

const SBS_HD = [
  { pid: 102, type: 'H264', language: '', audioType: null, height: null },
  { pid: 43, type: 'TELETEXT', language: '', audioType: null, height: null },
  { pid: 104, type: 'AAC-LATM', language: 'aus', audioType: 3, height: null },
  { pid: 103, type: 'MPEG2AUDIO', language: 'eng', audioType: 0, height: null },
]

const TEN_HD = [
  { pid: 511, type: 'H264', language: '', audioType: null, height: 1080 },
  { pid: 649, type: 'AC3', language: 'eng', audioType: 0, height: null },
]

test('pickStreams: skips the audio description track', () => {
  assert.equal(pickStreams({ streams: ABC_SD }).audio.pid, 650)
  assert.equal(pickStreams({ streams: SBS_HD }).audio.pid, 103)
})

test('pickStreams: prefers the default language among main audio tracks', () => {
  const streams = [
    { pid: 700, type: 'MPEG2AUDIO', language: 'ita', audioType: 0 },
    { pid: 701, type: 'MPEG2AUDIO', language: 'eng', audioType: 0 },
    { pid: 800, type: 'H264', language: '', audioType: null, height: 720 },
  ]
  assert.equal(pickStreams({ streams, languages: ['eng'] }).audio.pid, 701)
  assert.equal(pickStreams({ streams }).audio.pid, 700)
})

test('pickStreams: an AC-3-only channel still gets its audio track', () => {
  const plan = pickStreams({ streams: TEN_HD })
  assert.equal(plan.audio.type, 'AC3')
  assert.ok(ffmpegArgsFor({ plan, dir: '/tmp/x' }).join(' ').includes('-c:a aac -ac 2 -b:a 128k'))
})

test('pickStreams: H.264 video is copied', () => {
  const plan = pickStreams({ streams: SBS_HD })
  assert.equal(plan.videoMode, 'copy')
  assert.equal(plan.video.pid, 102)
})

test('pickStreams: MPEG-2 SD is transcoded, deinterlaced, and capped at 576', () => {
  const plan = pickStreams({ streams: ABC_SD })
  assert.deepEqual(
    { mode: plan.videoMode, cap: plan.heightCap, deinterlace: plan.deinterlace },
    { mode: 'transcode', cap: 576, deinterlace: true },
  )
})

test('pickStreams: MPEG-2 with an unknown height counts as SD', () => {
  const streams = [{ pid: 512, type: 'MPEG2VIDEO', language: '', audioType: null, height: null }]
  assert.equal(pickStreams({ streams }).heightCap, 576)
})

test('pickStreams: HD HEVC is transcoded and capped at 540 without deinterlacing', () => {
  const streams = [{ pid: 600, type: 'HEVC', language: '', audioType: null, height: 1080 }]
  const plan = pickStreams({ streams })
  assert.deepEqual(
    { mode: plan.videoMode, cap: plan.heightCap, deinterlace: plan.deinterlace },
    { mode: 'transcode', cap: 540, deinterlace: false },
  )
})

test('pickStreams: a radio service has no video', () => {
  const streams = [{ pid: 650, type: 'MPEG2AUDIO', language: 'eng', audioType: 0 }]
  assert.equal(pickStreams({ streams }).video, null)
})

test('ffmpegArgsFor: exact arguments for a copied H.264 channel', () => {
  const plan = pickStreams({ streams: SBS_HD })
  assert.deepEqual(ffmpegArgsFor({ plan, dir: '/tmp/live/abc' }), [
    '-hide_banner', '-loglevel', 'error', '-fflags', '+genpts+discardcorrupt',
    '-f', 'mpegts', '-i', 'pipe:0',
    '-map', '0:i:0x66', '-map', '0:i:0x67',
    '-c:v', 'copy',
    '-c:a', 'aac', '-ac', '2', '-b:a', '128k',
    '-f', 'hls', '-hls_time', '2', '-hls_list_size', '6',
    '-hls_flags', 'delete_segments+independent_segments+omit_endlist+temp_file',
    '-hls_segment_filename', '/tmp/live/abc/seg%d.ts',
    '/tmp/live/abc/index.m3u8',
  ])
})

test('ffmpegArgsFor: exact arguments for a transcoded MPEG-2 SD channel', () => {
  const plan = pickStreams({ streams: ABC_SD })
  assert.deepEqual(ffmpegArgsFor({ plan, dir: '/tmp/live/abc' }), [
    '-hide_banner', '-loglevel', 'error', '-fflags', '+genpts+discardcorrupt',
    '-f', 'mpegts', '-i', 'pipe:0',
    '-map', '0:i:0x200', '-map', '0:i:0x28a',
    '-vf', 'yadif=deint=interlaced,scale=-2:min(ih\\,576)',
    '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-crf', '23',
    '-g', '50', '-sc_threshold', '0', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-ac', '2', '-b:a', '128k',
    '-f', 'hls', '-hls_time', '2', '-hls_list_size', '6',
    '-hls_flags', 'delete_segments+independent_segments+omit_endlist+temp_file',
    '-hls_segment_filename', '/tmp/live/abc/seg%d.ts',
    '/tmp/live/abc/index.m3u8',
  ])
})

test('ffmpegArgsFor: never carries a URL or credentials', () => {
  const plan = pickStreams({ streams: TEN_HD })
  const args = ffmpegArgsFor({ plan, dir: '/tmp/live/abc' }).join(' ')
  assert.doesNotMatch(args, /https?:|@|password|Authorization/i)
})

const MIN = 60_000
const NOW = 1_000_000_000_000
const inputsWith = (...muxes) => muxes.map((mux, i) => ({ input: `Tuner #${i}`, mux, holders: mux ? [`DVR: show ${i}`] : [] }))

test('tunerVerdict: shares a tuner already on the channel mux', () => {
  const verdict = tunerVerdict({ channelMux: 'A', inputs: inputsWith('A', 'B'), tunerCount: 2, now: NOW })
  assert.equal(verdict.ok, true)
  assert.equal(verdict.via, 'shared')
})

test('tunerVerdict: takes an idle tuner', () => {
  const verdict = tunerVerdict({ channelMux: 'C', inputs: inputsWith('A', null), tunerCount: 2, now: NOW })
  assert.equal(verdict.via, 'idle')
})

test('tunerVerdict: refuses when every tuner holds another mux, and names the holders', () => {
  const verdict = tunerVerdict({ channelMux: 'C', inputs: inputsWith('A', 'B'), tunerCount: 2, now: NOW })
  assert.equal(verdict.ok, false)
  assert.equal(verdict.code, 'no-tuner')
  assert.deepEqual(verdict.holders.map((h) => h.holders[0]), ['DVR: show 0', 'DVR: show 1'])
})

test('tunerVerdict: flags a recording inside the window that needs the tuner', () => {
  const verdict = tunerVerdict({
    channelMux: 'C',
    inputs: inputsWith('A', null),
    tunerCount: 2,
    recordings: [
      { name: 'Running', mux: 'A', start: NOW - 10 * MIN, end: NOW + 50 * MIN, running: true },
      { name: 'The Block', mux: 'B', start: NOW + 20 * MIN, end: NOW + 90 * MIN, running: false },
    ],
    now: NOW,
  })
  assert.equal(verdict.ok, true)
  assert.deepEqual(verdict.conflict, { title: 'The Block', startsAt: NOW + 20 * MIN })
})

test('tunerVerdict: ignores a recording outside the window', () => {
  const verdict = tunerVerdict({
    channelMux: 'C',
    inputs: inputsWith('A', null),
    tunerCount: 2,
    recordings: [
      { name: 'Running', mux: 'A', start: NOW - 10 * MIN, end: NOW + 120 * MIN, running: true },
      { name: 'Later', mux: 'B', start: NOW + 61 * MIN, end: NOW + 90 * MIN, running: false },
    ],
    now: NOW,
  })
  assert.equal(verdict.conflict, null)
})

test('tunerVerdict: a recording on the same mux is no conflict', () => {
  const verdict = tunerVerdict({
    channelMux: 'C',
    inputs: inputsWith('A', null),
    tunerCount: 2,
    recordings: [
      { name: 'Running', mux: 'A', start: NOW - 10 * MIN, end: NOW + 50 * MIN, running: true },
      { name: 'Same mux', mux: 'C', start: NOW + 5 * MIN, end: NOW + 30 * MIN, running: false },
    ],
    now: NOW,
  })
  assert.equal(verdict.conflict, null)
})

test('stallReason: a recording that started after the stream preempted it', () => {
  const reason = stallReason({
    userAgent: 'Freetvarr-live/abc',
    sessionStartedAt: NOW,
    subscriptions: [
      { title: 'DVR: Old show', client: '', startedAt: NOW - MIN },
      { title: 'DVR: The Block', client: '', startedAt: NOW + MIN },
    ],
  })
  assert.deepEqual(reason, { code: 'preempted', recording: 'The Block' })
})

test('stallReason: the stream is still subscribed but gets no data', () => {
  const reason = stallReason({
    userAgent: 'Freetvarr-live/abc',
    sessionStartedAt: NOW,
    subscriptions: [{ title: 'SBS ONE', client: 'Freetvarr-live/abc', state: 'Bad', startedAt: NOW }],
  })
  assert.deepEqual(reason, { code: 'no-input', detail: 'Bad' })
})

test('stallReason: the subscription is gone', () => {
  assert.deepEqual(stallReason({ userAgent: 'Freetvarr-live/abc', subscriptions: [] }), { code: 'gone' })
})

test('LIVE_FILE_PATTERN: accepts the playlist and segments only', () => {
  for (const ok of ['index.m3u8', 'seg0.ts', 'seg123.ts']) assert.match(ok, LIVE_FILE_PATTERN)
  for (const bad of ['../index.m3u8', '..%2Fseg1.ts', 'seg1.ts/..', 'seg.ts', 'index.m3u8.tmp', 'seg1.ts.tmp', '/etc/passwd', 'seg-1.ts', '']) {
    assert.doesNotMatch(bad, LIVE_FILE_PATTERN)
  }
})

const PLAN = pickStreams({ streams: SBS_HD })

const fakeHarness = ({ exitOnTerm = true, killGraceMs = 5_000, bufferMinutes } = {}) => {
  const events = []
  const spawnArgs = []
  let clock = NOW
  let ids = 0
  const children = []
  const upstreams = []
  const sessions = createLiveSessions({
    now: () => clock,
    newId: () => `${String(++ids).padStart(16, '0')}`,
    rootDir: '/tmp/fake-live',
    makeDir: async () => {},
    removeDir: async (dir) => { events.push(`rm ${dir}`) },
    readText: async () => null,
    killGraceMs,
    bufferMinutes,
    spawnProcess: (command, args) => {
      spawnArgs.push(args)
      const child = new EventEmitter()
      child.stdin = new PassThrough()
      child.stderr = new PassThrough()
      child.kill = (signal) => {
        events.push(signal)
        if (signal === 'SIGKILL' || exitOnTerm) setImmediate(() => child.emit('exit', null, signal))
      }
      children.push(child)
      return child
    },
    openUpstream: async ({ signal }) => {
      signal.addEventListener('abort', () => events.push('abort'))
      const upstream = new PassThrough()
      upstreams.push(upstream)
      return upstream
    },
    describeStall: async () => ({ code: 'gone' }),
  })
  return { sessions, events, spawnArgs, children, upstreams, advance: (ms) => { clock += ms } }
}

test('sessions: teardown aborts upstream, then stops ffmpeg, then removes the folder', async () => {
  const h = fakeHarness()
  const { session } = await h.sessions.start({ channelId: 'c1', plan: PLAN })
  await h.sessions.leave(session.id)
  assert.deepEqual(h.events, ['abort', 'SIGTERM', `rm /tmp/fake-live/${session.id}`])
})

test('sessions: ffmpeg that ignores SIGTERM is killed after the grace period', async () => {
  const h = fakeHarness({ exitOnTerm: false, killGraceMs: 20 })
  const { session } = await h.sessions.start({ channelId: 'c1', plan: PLAN })
  await h.sessions.leave(session.id)
  assert.deepEqual(h.events, ['abort', 'SIGTERM', 'SIGKILL', `rm /tmp/fake-live/${session.id}`])
})

test('sessions: viewers share one session per channel', async () => {
  const h = fakeHarness()
  const first = await h.sessions.start({ channelId: 'c1', plan: PLAN })
  const second = await h.sessions.start({ channelId: 'c1', plan: PLAN })
  assert.equal(second.shared, true)
  assert.equal(second.session.id, first.session.id)
  await h.sessions.leave(first.session.id)
  assert.equal(h.sessions.activeCount(), 1)
  await h.sessions.leave(first.session.id)
  assert.equal(h.sessions.activeCount(), 0)
})

test('sessions: refuses a channel past the session limit', async () => {
  const h = fakeHarness()
  await h.sessions.start({ channelId: 'c1', plan: PLAN })
  await h.sessions.start({ channelId: 'c2', plan: PLAN })
  await assert.rejects(h.sessions.start({ channelId: 'c3', plan: PLAN }), { code: 'max-sessions' })
  await h.sessions.stopAll()
})

test('sessions: the reaper ends a session nobody has fetched from for 20 s', async () => {
  const h = fakeHarness()
  const { session } = await h.sessions.start({ channelId: 'c1', plan: PLAN })
  await new Promise((resolve) => setImmediate(resolve))
  h.advance(15_000)
  h.upstreams[0].write(Buffer.from('ts'))
  h.sessions.touch(session.id)
  h.advance(15_000)
  h.upstreams[0].write(Buffer.from('ts'))
  await h.sessions.tick()
  assert.equal(h.sessions.activeCount(), 1)
  h.advance(6_000)
  h.upstreams[0].write(Buffer.from('ts'))
  await h.sessions.tick()
  assert.equal(h.sessions.activeCount(), 0)
  assert.deepEqual((await h.sessions.statusForChannel('c1')).reason, { code: 'idle' })
})

test('sessions: the watchdog ends a session with no upstream bytes for 10 s', async () => {
  const h = fakeHarness()
  const { session } = await h.sessions.start({ channelId: 'c1', plan: PLAN })
  await new Promise((resolve) => setImmediate(resolve))
  h.advance(11_000)
  h.sessions.touch(session.id)
  await h.sessions.tick()
  assert.equal(h.sessions.activeCount(), 0)
  assert.deepEqual((await h.sessions.statusForChannel('c1')).reason, { code: 'gone' })
})

test('sessions: ffmpeg failure reports its first error line', async () => {
  const h = fakeHarness()
  await h.sessions.start({ channelId: 'c1', plan: PLAN })
  h.children[0].stderr.write('Stream map matches no streams.\nsecond line\n')
  await new Promise((resolve) => setImmediate(resolve))
  h.children[0].emit('exit', 1, null)
  await new Promise((resolve) => setImmediate(resolve))
  const status = await h.sessions.statusForChannel('c1')
  assert.deepEqual(status.reason, { code: 'ffmpeg', detail: 'Stream map matches no streams.' })
})

test('sessions: fileFor rejects bad names and unknown sessions', async () => {
  const h = fakeHarness()
  const { session } = await h.sessions.start({ channelId: 'c1', plan: PLAN })
  assert.equal(h.sessions.fileFor(session.id, 'seg4.ts'), `/tmp/fake-live/${session.id}/seg4.ts`)
  assert.equal(h.sessions.fileFor(session.id, '../../etc/passwd'), null)
  assert.equal(h.sessions.fileFor('../x', 'index.m3u8'), null)
  assert.equal(h.sessions.fileFor('ffffffffffffffff', 'index.m3u8'), null)
  await h.sessions.stopAll()
})

const FIRST_PLAYLIST = [
  '#EXTM3U',
  '#EXT-X-VERSION:6',
  '#EXT-X-TARGETDURATION:2',
  '#EXT-X-MEDIA-SEQUENCE:0',
  '#EXT-X-INDEPENDENT-SEGMENTS',
  '#EXTINF:0.960000,',
  'seg0.ts',
  '#EXTINF:1.920000,',
  'seg1.ts',
  '',
].join('\n')

test('playlist: the cut-in segment is dropped and the sequence starts at 1', () => {
  const trimmed = withoutCutInSegment(FIRST_PLAYLIST)
  assert.ok(!trimmed.includes('seg0.ts'))
  assert.ok(!trimmed.includes('#EXTINF:0.960000,'))
  assert.ok(trimmed.includes('#EXT-X-MEDIA-SEQUENCE:1\n'))
  assert.ok(trimmed.includes('#EXTINF:1.920000,\nseg1.ts'))
})

test('playlist: a playlist past the cut-in segment is unchanged', () => {
  const later = FIRST_PLAYLIST
    .replace('#EXT-X-MEDIA-SEQUENCE:0', '#EXT-X-MEDIA-SEQUENCE:1')
    .replace('#EXTINF:0.960000,\nseg0.ts\n', '')
  assert.equal(withoutCutInSegment(later), later)
})

test('playlist: only the cut-in segment is not yet playable', () => {
  const onlyCutIn = FIRST_PLAYLIST.replace('#EXTINF:1.920000,\nseg1.ts\n', '')
  assert.equal(hasSegments(withoutCutInSegment(onlyCutIn)), false)
  assert.equal(hasSegments(withoutCutInSegment(FIRST_PLAYLIST)), true)
})

const VAAPI_ENCODER = { kind: 'vaapi', device: '/dev/dri/renderD128', lowPower: true }

test('pickStreams: H.264 is transcoded to 720p in hardware when VAAPI is available', () => {
  const plan = pickStreams({ streams: SBS_HD, encoder: VAAPI_ENCODER })
  assert.deepEqual(
    { mode: plan.videoMode, cap: plan.heightCap, vaapi: plan.vaapi },
    { mode: 'vaapi', cap: 720, vaapi: { device: '/dev/dri/renderD128', lowPower: true } },
  )
})

test('pickStreams: H.264 is deinterlaced in software at 540p without hardware', () => {
  const plan = pickStreams({ streams: SBS_HD, encoder: { kind: 'software' } })
  assert.deepEqual(
    { mode: plan.videoMode, cap: plan.heightCap, deinterlace: plan.deinterlace },
    { mode: 'transcode', cap: 540, deinterlace: true },
  )
})

test('pickStreams: MPEG-2 SD stays on the software path even with VAAPI', () => {
  assert.equal(pickStreams({ streams: ABC_SD, encoder: VAAPI_ENCODER }).videoMode, 'transcode')
})

test('ffmpegArgsFor: exact arguments for a hardware-transcoded H.264 channel', () => {
  const plan = pickStreams({ streams: SBS_HD, encoder: VAAPI_ENCODER })
  assert.deepEqual(ffmpegArgsFor({ plan, dir: '/tmp/live/abc' }), [
    '-hide_banner', '-loglevel', 'error',
    '-hwaccel', 'vaapi', '-hwaccel_device', '/dev/dri/renderD128', '-hwaccel_output_format', 'vaapi',
    '-fflags', '+genpts+discardcorrupt',
    '-f', 'mpegts', '-i', 'pipe:0',
    '-map', '0:i:0x66', '-map', '0:i:0x67',
    '-vf', 'deinterlace_vaapi=auto=1,scale_vaapi=w=-2:h=min(ih\\,720)',
    '-c:v', 'h264_vaapi', '-low_power', '1', '-qp', '24',
    '-g', '50', '-keyint_min', '50',
    '-c:a', 'aac', '-ac', '2', '-b:a', '128k',
    '-f', 'hls', '-hls_time', '2', '-hls_list_size', '6',
    '-hls_flags', 'delete_segments+independent_segments+omit_endlist+temp_file',
    '-hls_segment_filename', '/tmp/live/abc/seg%d.ts',
    '/tmp/live/abc/index.m3u8',
  ])
})

const listSizeOf = (args) => args[args.indexOf('-hls_list_size') + 1]

test('liveSegmentCount: keeps the 6-segment floor when the buffer is off', () => {
  assert.equal(liveSegmentCount(0), 6)
  assert.equal(liveSegmentCount(), 6)
})

test('liveSegmentCount: covers the buffer in 2-second segments', () => {
  assert.equal(liveSegmentCount(30), 900)
  assert.equal(liveSegmentCount(1), 30)
})

test('liveBufferMinutesFrom: defaults to 30 when unset or not a number', () => {
  assert.equal(liveBufferMinutesFrom(undefined), 30)
  assert.equal(liveBufferMinutesFrom(''), 30)
  assert.equal(liveBufferMinutesFrom('lots'), 30)
})

test('liveBufferMinutesFrom: accepts 0 to turn the buffer off, and caps at 120', () => {
  assert.equal(liveBufferMinutesFrom('0'), 0)
  assert.equal(liveBufferMinutesFrom('10'), 10)
  assert.equal(liveBufferMinutesFrom('500'), 120)
  assert.equal(liveBufferMinutesFrom('-5'), 0)
})

test('ffmpegArgsFor: the segment count sets the HLS list size', () => {
  const plan = pickStreams({ streams: SBS_HD })
  assert.equal(listSizeOf(ffmpegArgsFor({ plan, dir: '/tmp/live/abc', segmentCount: 900 })), '900')
})

test('sessions: ffmpeg keeps enough segments for the configured buffer', async () => {
  const h = fakeHarness({ bufferMinutes: 30 })
  await h.sessions.start({ channelId: 'c1', plan: PLAN })
  assert.equal(listSizeOf(h.spawnArgs[0]), '900')
})

test('sessions: with no buffer, ffmpeg keeps the 6-segment live window', async () => {
  const h = fakeHarness()
  await h.sessions.start({ channelId: 'c1', plan: PLAN })
  assert.equal(listSizeOf(h.spawnArgs[0]), '6')
})
