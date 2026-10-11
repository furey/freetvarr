import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { readFile } from 'fs/promises'

import {
  pickStreams,
  ffmpegArgsFor,
  tunerVerdict,
  stallReason,
  createLiveSessions,
  missingStreamParameters,
  LIVE_FILE_PATTERN,
  withoutCutInSegment,
  startsOnKeyframe,
  hasSegments,
  liveSegmentCount,
  liveBufferMinutesFrom,
  teletextPageOf,
  missingTeletext,
  withCaptionLabels,
  liveContentType,
  withCaptionCueSettings,
  CAPTION_CUE_SETTINGS,
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
    '-probesize', '500000', '-analyzeduration', '500000',
    '-f', 'mpegts', '-i', 'pipe:0',
    '-map', '0:i:0x66', '-map', '0:i:0x67',
    '-c:v', 'copy',
    '-c:a', 'aac', '-ac', '2', '-b:a', '128k',
    '-muxdelay', '0', '-max_interleave_delta', '500000',
    '-f', 'hls', '-hls_time', '2', '-hls_init_time', '1', '-hls_list_size', '6',
    '-hls_flags', 'delete_segments+independent_segments+omit_endlist+temp_file',
    '-hls_segment_filename', '/tmp/live/abc/seg%d.ts',
    '-master_pl_name', 'index.m3u8', '-var_stream_map', 'v:0,a:0',
    '/tmp/live/abc/live.m3u8',
  ])
})

test('ffmpegArgsFor: exact arguments for a transcoded MPEG-2 SD channel', () => {
  const plan = pickStreams({ streams: ABC_SD })
  assert.deepEqual(ffmpegArgsFor({ plan, dir: '/tmp/live/abc' }), [
    '-hide_banner', '-loglevel', 'error', '-fflags', '+genpts+discardcorrupt',
    '-probesize', '500000', '-analyzeduration', '500000',
    '-f', 'mpegts', '-i', 'pipe:0',
    '-map', '0:i:0x200', '-map', '0:i:0x28a',
    '-vf', 'yadif=deint=interlaced,scale=-2:min(ih\\,576)',
    '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-crf', '23',
    '-g', '50', '-force_key_frames', OPENING_KEYFRAMES, '-sc_threshold', '0', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-ac', '2', '-b:a', '128k',
    '-muxdelay', '0', '-max_interleave_delta', '500000',
    '-f', 'hls', '-hls_time', '2', '-hls_init_time', '1', '-hls_list_size', '6',
    '-hls_flags', 'delete_segments+independent_segments+omit_endlist+temp_file',
    '-hls_segment_filename', '/tmp/live/abc/seg%d.ts',
    '-master_pl_name', 'index.m3u8', '-var_stream_map', 'v:0,a:0',
    '/tmp/live/abc/live.m3u8',
  ])
})

test('ffmpegArgsFor: the full probe leaves out the short probe options', () => {
  const plan = pickStreams({ streams: SBS_HD })
  const args = ffmpegArgsFor({ plan, dir: '/tmp/live/abc', probe: 'full' })
  assert.ok(!args.includes('-probesize'))
  assert.ok(!args.includes('-analyzeduration'))
  assert.ok(args.includes('-hls_init_time'))
})

test('ffmpegArgsFor: copy mode never forces keyframes', () => {
  const plan = pickStreams({ streams: SBS_HD })
  assert.ok(!ffmpegArgsFor({ plan, dir: '/tmp/live/abc' }).includes('-force_key_frames'))
})

test('missingStreamParameters: spots ffmpeg probe failures only', () => {
  assert.equal(missingStreamParameters(['Could not find codec parameters for stream 2']), true)
  assert.equal(missingStreamParameters(['Stream #0:1: unspecified sample rate']), true)
  assert.equal(missingStreamParameters(['unspecified size']), true)
  assert.equal(missingStreamParameters(['Invalid data found when processing input']), false)
  assert.equal(missingStreamParameters(), false)
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

test('LIVE_FILE_PATTERN: accepts the playlists, segments, and caption segments only', () => {
  const good = ['index.m3u8', 'live.m3u8', 'live_vtt.m3u8', 'seg0.ts', 'seg123.ts', 'live0.vtt', 'live123.vtt']
  for (const ok of good) assert.match(ok, LIVE_FILE_PATTERN)
  const bad = [
    '../index.m3u8', '..%2Fseg1.ts', 'seg1.ts/..', 'seg.ts', 'index.m3u8.tmp', 'seg1.ts.tmp', '/etc/passwd',
    'seg-1.ts', '', 'live.vtt', 'live1.vtt.tmp', 'live_vtt.m3u8.tmp', 'other.m3u8', 'seg1.vtt', '../live1.vtt',
  ]
  for (const name of bad) {
    assert.doesNotMatch(name, LIVE_FILE_PATTERN)
  }
})

const OPENING_KEYFRAMES = 'expr:lt(t,4)*gte(t,n_forced)'

const PLAN = pickStreams({ streams: SBS_HD })

const fakeHarness = ({ exitOnTerm = true, killGraceMs = 5_000, bufferMinutes, upstreamError, files = {} } = {}) => {
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
    readText: async (file) => files[file.split('/').pop()] ?? null,
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
      if (upstreamError) throw upstreamError
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
    '-probesize', '500000', '-analyzeduration', '500000',
    '-f', 'mpegts', '-i', 'pipe:0',
    '-map', '0:i:0x66', '-map', '0:i:0x67',
    '-vf', 'deinterlace_vaapi=auto=1,scale_vaapi=w=-2:h=min(ih\\,720)',
    '-c:v', 'h264_vaapi', '-low_power', '1', '-qp', '24',
    '-g', '50', '-keyint_min', '50', '-force_key_frames', OPENING_KEYFRAMES,
    '-c:a', 'aac', '-ac', '2', '-b:a', '128k',
    '-muxdelay', '0', '-max_interleave_delta', '500000',
    '-f', 'hls', '-hls_time', '2', '-hls_init_time', '1', '-hls_list_size', '6',
    '-hls_flags', 'delete_segments+independent_segments+omit_endlist+temp_file',
    '-hls_segment_filename', '/tmp/live/abc/seg%d.ts',
    '-master_pl_name', 'index.m3u8', '-var_stream_map', 'v:0,a:0',
    '/tmp/live/abc/live.m3u8',
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

test('sessions: a held session outlives the idle timeout until the hold expires', async () => {
  const h = fakeHarness({ bufferMinutes: 1 })
  const { session } = await h.sessions.start({ channelId: 'c1', plan: PLAN })
  assert.equal(await h.sessions.hold(session.id), true)
  h.advance(50_000)
  h.upstreams[0].write(Buffer.from('ts'))
  await h.sessions.tick()
  assert.equal(h.sessions.activeCount(), 1)
  h.advance(11_000)
  h.upstreams[0].write(Buffer.from('ts'))
  await h.sessions.tick()
  assert.equal(h.sessions.activeCount(), 0)
})

test('sessions: with no buffer, hold ends the session like leave', async () => {
  const h = fakeHarness()
  const { session } = await h.sessions.start({ channelId: 'c1', plan: PLAN })
  await h.sessions.hold(session.id)
  assert.equal(h.sessions.activeCount(), 0)
})

test('sessions: the session view carries the buffer length', async () => {
  const h = fakeHarness({ bufferMinutes: 30 })
  const { session } = await h.sessions.start({ channelId: 'c1', plan: PLAN })
  assert.equal(h.sessions.view(session).bufferSeconds, 1800)
})

test('sessions: an upstream with no input source ends with a no-source reason', async () => {
  const upstreamError = Object.assign(new Error('TVHeadend closed the stream.'), { code: 'no-source' })
  const h = fakeHarness({ upstreamError })
  await h.sessions.start({ channelId: 'c1', plan: PLAN })
  await new Promise((resolve) => setImmediate(resolve))
  const status = await h.sessions.statusForChannel('c1')
  assert.equal(status.reason.code, 'no-source')
})

const failChild = async (child, line) => {
  child.stderr.write(`${line}\n`)
  await new Promise((resolve) => setImmediate(resolve))
  child.emit('exit', 1, null)
  await new Promise((resolve) => setImmediate(resolve))
}

test('sessions: missing stream parameters restart ffmpeg once with the full probe', async () => {
  const h = fakeHarness()
  const { session } = await h.sessions.start({ channelId: 'c1', plan: PLAN })
  await new Promise((resolve) => setImmediate(resolve))
  await failChild(h.children[0], 'Could not find codec parameters for stream 1')
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(h.children.length, 2)
  assert.equal(h.upstreams.length, 2)
  assert.ok(h.spawnArgs[0].includes('-analyzeduration'))
  assert.ok(!h.spawnArgs[1].includes('-analyzeduration'))
  assert.equal(session.status, 'tuning')
  assert.ok(h.events.includes('abort'))
  await failChild(h.children[1], 'Could not find codec parameters for stream 1')
  assert.equal(session.status, 'ended')
  assert.equal(session.reason.code, 'ffmpeg')
  assert.equal(h.children.length, 2)
})

test('sessions: other ffmpeg failures end the session without a restart', async () => {
  const h = fakeHarness()
  const { session } = await h.sessions.start({ channelId: 'c1', plan: PLAN })
  await failChild(h.children[0], 'Invalid data found when processing input')
  assert.equal(session.status, 'ended')
  assert.equal(h.children.length, 1)
})

const NINE_HD = [
  { pid: 513, type: 'H264', language: '', audioType: null, height: 1080 },
  { pid: 650, type: 'AC3', language: 'eng', audioType: 0, height: null },
  { pid: 577, type: 'TELETEXT', language: '', audioType: null, height: null },
  { pid: 8993, type: 'TEXTSUB', language: 'eng', audioType: null, height: null },
]

const CAPTIONED_PLAN = pickStreams({ streams: NINE_HD })

test('pickStreams: teletext with a subtitle page carries captions', () => {
  assert.deepEqual(CAPTIONED_PLAN.teletext, { pid: 577, page: 801 })
})

test('pickStreams: teletext without a subtitle page carries no captions', () => {
  assert.equal(pickStreams({ streams: SBS_HD }).teletext, null)
  assert.equal(pickStreams({ streams: TEN_HD }).teletext, null)
})

test('teletextPageOf: the subtitle PID less 0x2000 is the page, else page 801', () => {
  assert.equal(teletextPageOf(8993), 801)
  assert.equal(teletextPageOf(0x2000 + 888), 888)
  assert.equal(teletextPageOf(0x2000 + 100), 100)
  assert.equal(teletextPageOf(0x2000 + 99), 801)
  assert.equal(teletextPageOf(0x2000 + 900), 801)
  assert.equal(teletextPageOf(577), 801)
  assert.equal(teletextPageOf(undefined), 801)
})

test('ffmpegArgsFor: exact arguments for a copied H.264 channel with captions', () => {
  assert.deepEqual(ffmpegArgsFor({ plan: CAPTIONED_PLAN, dir: '/tmp/live/abc' }), [
    '-hide_banner', '-loglevel', 'error', '-fflags', '+genpts+discardcorrupt',
    '-probesize', '500000', '-analyzeduration', '500000',
    '-fix_sub_duration', '-txt_page', '801', '-txt_format', 'text', '-txt_duration', '4000',
    '-f', 'mpegts', '-i', 'pipe:0',
    '-map', '0:i:0x201', '-map', '0:i:0x28a', '-map', '0:i:0x241',
    '-c:v', 'copy',
    '-c:a', 'aac', '-ac', '2', '-b:a', '128k',
    '-c:s', 'webvtt',
    '-muxdelay', '0', '-max_interleave_delta', '500000',
    '-f', 'hls', '-hls_time', '2', '-hls_init_time', '1', '-hls_list_size', '6',
    '-hls_flags', 'delete_segments+independent_segments+omit_endlist+temp_file',
    '-hls_segment_filename', '/tmp/live/abc/seg%d.ts',
    '-master_pl_name', 'index.m3u8',
    '-var_stream_map', 'v:0,a:0,s:0,sgroup:subs,language:en,default:no',
    '/tmp/live/abc/live.m3u8',
  ])
})

const streamMapOf = (args) => args[args.indexOf('-var_stream_map') + 1]

test('ffmpegArgsFor: the stream map names audio and captions only when the plan has them', () => {
  const silent = pickStreams({ streams: NINE_HD.filter((s) => s.type !== 'AC3') })
  assert.equal(streamMapOf(ffmpegArgsFor({ plan: silent, dir: '/tmp/x' })), 'v:0,s:0,sgroup:subs,language:en,default:no')
  const bare = pickStreams({ streams: [NINE_HD[0]] })
  const args = ffmpegArgsFor({ plan: bare, dir: '/tmp/x' })
  assert.equal(streamMapOf(args), 'v:0')
  assert.equal(args.filter((a) => a === '-map').length, 1)
})

test('ffmpegArgsFor: no caption options without teletext', () => {
  const args = ffmpegArgsFor({ plan: pickStreams({ streams: SBS_HD }), dir: '/tmp/x' })
  for (const option of ['-fix_sub_duration', '-txt_page', '-txt_format', '-txt_duration', '-c:s']) assert.ok(!args.includes(option))
  assert.ok(!args.some((a) => a.includes('s:0')))
  assert.ok(args.includes('-muxdelay'))
  assert.ok(args.includes('-master_pl_name'))
})

test('missingTeletext: spots a failure on the teletext stream only', () => {
  const plan = CAPTIONED_PLAN
  assert.equal(missingTeletext({ plan, errorLines: ["Stream map '0:i:0x241' matches no streams."] }), true)
  assert.equal(missingTeletext({ plan, errorLines: ['[libzvbi_teletextdec @ 0x1] failed'] }), true)
  assert.equal(missingTeletext({ plan, errorLines: ["Stream map '0:i:0x201' matches no streams."] }), false)
  assert.equal(missingTeletext({ plan: PLAN, errorLines: ["Stream map '0:i:0x241' matches no streams."] }), false)
})

const VTT_PLAYLIST = [
  '#EXTM3U',
  '#EXT-X-VERSION:6',
  '#EXT-X-TARGETDURATION:3',
  '#EXT-X-MEDIA-SEQUENCE:0',
  '#EXTINF:0.960000,',
  'live0.vtt',
  '#EXTINF:1.920000,',
  'live1.vtt',
  '',
].join('\n')

test('playlist: the cut-in caption segment is dropped and the sequence starts at 1', () => {
  const trimmed = withoutCutInSegment(VTT_PLAYLIST, 'live0.vtt')
  assert.ok(!trimmed.includes('live0.vtt'))
  assert.ok(trimmed.includes('#EXT-X-MEDIA-SEQUENCE:1\n'))
  assert.ok(trimmed.includes('#EXTINF:1.920000,\nlive1.vtt'))
})

const MASTER = [
  '#EXTM3U',
  '#EXT-X-VERSION:6',
  '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="subtitle_0",DEFAULT=NO,LANGUAGE="en",URI="live_vtt.m3u8"',
  '#EXT-X-STREAM-INF:BANDWIDTH=140800,RESOLUTION=1920x1080,SUBTITLES="subs"',
  'live.m3u8',
  '',
].join('\n')

test('withCaptionLabels: names the caption track English and lets players pick it', () => {
  assert.equal(withCaptionLabels(MASTER), MASTER.replace(
    'NAME="subtitle_0",DEFAULT=NO,LANGUAGE="en",URI="live_vtt.m3u8"',
    'NAME="English",DEFAULT=NO,LANGUAGE="en",URI="live_vtt.m3u8",AUTOSELECT=YES',
  ))
})

test('withCaptionLabels: leaves a master without captions unchanged, and runs twice safely', () => {
  const plain = MASTER.split('\n').filter((l) => !l.startsWith('#EXT-X-MEDIA')).join('\n')
  assert.equal(withCaptionLabels(plain), plain)
  assert.equal(withCaptionLabels(withCaptionLabels(MASTER)), withCaptionLabels(MASTER))
})

test('liveContentType: playlists, caption segments, and video segments', () => {
  assert.equal(liveContentType('index.m3u8'), 'application/vnd.apple.mpegurl')
  assert.equal(liveContentType('live_vtt.m3u8'), 'application/vnd.apple.mpegurl')
  assert.equal(liveContentType('live3.vtt'), 'text/vtt')
  assert.equal(liveContentType('seg3.ts'), 'video/mp2t')
})

const CAPTION_SEGMENT = [
  'WEBVTT',
  '',
  '00:10.080 --> 00:10.400',
  "to Kohl's, including a year's worth",
  'of groceries.',
  '',
  '01:00:10.400 --> 01:00:10.520 line:0',
  'of groceries. Can',
  '',
].join('\n')

test('withCaptionCueSettings: places every cue low and left-aligned, replacing any settings', () => {
  assert.equal(CAPTION_CUE_SETTINGS, 'line:85%,end align:start position:10% size:80%')
  assert.equal(withCaptionCueSettings(CAPTION_SEGMENT), [
    'WEBVTT',
    '',
    `00:10.080 --> 00:10.400 ${CAPTION_CUE_SETTINGS}`,
    "to Kohl's, including a year's worth",
    'of groceries.',
    '',
    `01:00:10.400 --> 01:00:10.520 ${CAPTION_CUE_SETTINGS}`,
    'of groceries. Can',
    '',
  ].join('\n'))
})

test('withCaptionCueSettings: leaves cue text, empty segments, and its own output unchanged', () => {
  const arrowText = 'WEBVTT\n\n00:01.000 --> 00:02.000\n2 --> 1\n'
  assert.equal(
    withCaptionCueSettings(arrowText),
    `WEBVTT\n\n00:01.000 --> 00:02.000 ${CAPTION_CUE_SETTINGS}\n2 --> 1\n`,
  )
  assert.equal(withCaptionCueSettings('WEBVTT\n\n'), 'WEBVTT\n\n')
  const once = withCaptionCueSettings(CAPTION_SEGMENT)
  assert.equal(withCaptionCueSettings(once), once)
})

test('sessions: readiness reads the media playlist, and each playlist is served rewritten', async () => {
  const h = fakeHarness({
    files: { 'index.m3u8': MASTER, 'live.m3u8': FIRST_PLAYLIST, 'live_vtt.m3u8': VTT_PLAYLIST },
  })
  const { session } = await h.sessions.start({ channelId: 'c1', plan: CAPTIONED_PLAN })
  assert.equal(await h.sessions.waitForPlaylist(session.id, { timeoutMs: 0 }), true)
  assert.match(await h.sessions.playlistFor(session.id, 'index.m3u8'), /NAME="English"/)
  const media = await h.sessions.playlistFor(session.id, 'live.m3u8')
  const captions = await h.sessions.playlistFor(session.id, 'live_vtt.m3u8')
  assert.ok(!media.includes('seg0.ts'))
  assert.ok(!captions.includes('live0.vtt'))
  const sequenceOf = (text) => text.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/)[1]
  assert.equal(sequenceOf(media), sequenceOf(captions))
  assert.equal(await h.sessions.playlistFor(session.id, 'seg1.ts'), null)
  assert.equal(h.sessions.fileFor(session.id, 'live1.vtt'), `/tmp/fake-live/${session.id}/live1.vtt`)
  await h.sessions.stopAll()
})

test('startsOnKeyframe: transcoded paths open on an encoder keyframe, copied video does not', () => {
  assert.equal(startsOnKeyframe(pickStreams({ streams: ABC_SD })), true)
  assert.equal(startsOnKeyframe({ videoMode: 'vaapi' }), true)
  assert.equal(startsOnKeyframe(CAPTIONED_PLAN), false)
})

test('sessions: a transcoded session serves its first segment and is live once it exists', async () => {
  const onlyFirst = FIRST_PLAYLIST.replace('#EXTINF:1.920000,\nseg1.ts\n', '')
  const h = fakeHarness({ files: { 'live.m3u8': onlyFirst } })
  const { session } = await h.sessions.start({ channelId: 'c1', plan: pickStreams({ streams: ABC_SD }) })
  assert.equal(await h.sessions.waitForPlaylist(session.id, { timeoutMs: 0 }), true)
  assert.equal(await h.sessions.playlistFor(session.id, 'live.m3u8'), onlyFirst)
  await h.sessions.stopAll()
})

test('sessions: the master playlist alone does not make a session live', async () => {
  const h = fakeHarness({ files: { 'index.m3u8': MASTER } })
  const { session } = await h.sessions.start({ channelId: 'c1', plan: CAPTIONED_PLAN })
  assert.equal(await h.sessions.waitForPlaylist(session.id, { timeoutMs: 0 }), false)
  await h.sessions.stopAll()
})

test('sessions: the session view says whether captions are on offer', async () => {
  const h = fakeHarness()
  const { session } = await h.sessions.start({ channelId: 'c1', plan: CAPTIONED_PLAN })
  const { session: plain } = await h.sessions.start({ channelId: 'c2', plan: PLAN })
  assert.equal(h.sessions.view(session).captions, true)
  assert.equal(h.sessions.view(plain).captions, false)
  assert.equal(h.sessions.view(session).playlist, `/api/live/${session.id}/index.m3u8`)
  await h.sessions.stopAll()
})

test('sessions: a missing teletext stream restarts ffmpeg once without captions', async () => {
  const h = fakeHarness()
  const { session } = await h.sessions.start({ channelId: 'c1', plan: CAPTIONED_PLAN })
  await new Promise((resolve) => setImmediate(resolve))
  await failChild(h.children[0], "Stream map '0:i:0x241' matches no streams.")
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(h.children.length, 2)
  assert.ok(h.spawnArgs[0].includes('-txt_page'))
  assert.ok(!h.spawnArgs[1].includes('-txt_page'))
  assert.ok(h.spawnArgs[1].includes('-analyzeduration'))
  assert.equal(session.status, 'tuning')
  assert.equal(h.sessions.view(session).captions, false)
  await failChild(h.children[1], "Stream map '0:i:0x241' matches no streams.")
  assert.equal(session.status, 'ended')
  assert.equal(h.children.length, 2)
})

test('sessions: a probe failure and then a missing teletext stream each restart once', async () => {
  const h = fakeHarness()
  await h.sessions.start({ channelId: 'c1', plan: CAPTIONED_PLAN })
  await new Promise((resolve) => setImmediate(resolve))
  await failChild(h.children[0], 'Could not find codec parameters for stream 1')
  await new Promise((resolve) => setImmediate(resolve))
  await failChild(h.children[1], "Stream map '0:i:0x241' matches no streams.")
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(h.children.length, 3)
  assert.ok(!h.spawnArgs[2].includes('-analyzeduration'))
  assert.ok(!h.spawnArgs[2].includes('-txt_page'))
  await h.sessions.stopAll()
})

test('vendor: the server sends the full hls.js build, which has caption support', async () => {
  const server = await readFile(new URL('../src/server.js', import.meta.url), 'utf8')
  assert.match(server, /'\/vendor\/hls\.mjs', sendVendorFile\('hls\.js', 'dist', 'hls\.min\.mjs'\)/)
  const build = await readFile(new URL('../node_modules/hls.js/dist/hls.min.mjs', import.meta.url), 'utf8')
  assert.match(build, /subtitleStreamController:(?!void)/)
})

test('pickStreams: leaves captions out when ffmpeg has no teletext decoder', () => {
  const streams = [
    { pid: 0x100, type: 'H264' },
    { pid: 0x101, type: 'AC3' },
    { pid: 0x241, type: 'TELETEXT' },
    { pid: 0x2000 + 801, type: 'TEXTSUB' },
  ]
  assert.ok(pickStreams({ streams }).teletext)
  assert.equal(pickStreams({ streams, encoder: { kind: 'copy', captions: false } }).teletext, null)
})
