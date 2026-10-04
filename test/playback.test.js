import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'

import {
  playbackArgsFor,
  probeStreamsFrom,
  durationFrom,
  planForFile,
  playbackCandidates,
  isInsideRoots,
  resolvePlaybackFile,
  resumeStartFor,
  startOffsetFor,
  positionFrom,
  producedSecondsOf,
  playlistForClient,
  createPlaybackSessions,
  PLAY_FILE_PATTERN,
} from '../src/playback.js'
import { createLiveSessions } from '../src/live-tv.js'
import { seekPlan, fmtPlayTime } from '../src/web/playback.js'

const SD_PROBE = {
  format: { duration: '1800.48' },
  streams: [
    { index: 0, codec_type: 'video', codec_name: 'mpeg2video', height: 576 },
    { index: 1, codec_type: 'audio', codec_name: 'mp2', tags: { language: 'eng' }, disposition: { visual_impaired: 0 } },
    { index: 2, codec_type: 'audio', codec_name: 'mp2', tags: { language: 'eng' }, disposition: { visual_impaired: 1 } },
    { index: 3, codec_type: 'subtitle', codec_name: 'dvb_teletext' },
  ],
}

const HD_PROBE = {
  format: { duration: '3600' },
  streams: [
    { index: 0, codec_type: 'video', codec_name: 'h264', height: 1080 },
    { index: 1, codec_type: 'audio', codec_name: 'ac3', tags: { language: 'eng' } },
  ],
}

test('probeStreamsFrom: maps ffprobe codecs to the stream types pickStreams reads', () => {
  assert.deepEqual(probeStreamsFrom(SD_PROBE).map((s) => [s.index, s.type, s.audioType]), [
    [0, 'MPEG2VIDEO', null],
    [1, 'MPEG2AUDIO', 0],
    [2, 'MPEG2AUDIO', 3],
  ])
})

test('durationFrom: reads the format duration, or null when unknown', () => {
  assert.equal(durationFrom(SD_PROBE), 1800.48)
  assert.equal(durationFrom({ format: {} }), null)
})

test('planForFile: MPEG-2 SD is transcoded and deinterlaced; the AD track is skipped', () => {
  const plan = planForFile({ probe: SD_PROBE, encoder: { kind: 'software' } })
  assert.equal(plan.videoMode, 'transcode')
  assert.equal(plan.deinterlace, true)
  assert.equal(plan.audio.index, 1)
})

test('planForFile: a file with no video is refused', () => {
  assert.throws(
    () => planForFile({ probe: { streams: [SD_PROBE.streams[1]] }, encoder: { kind: 'copy' } }),
    { code: 'no-video' },
  )
})

test('playbackArgsFor: seeks the input, maps by index, and writes an event playlist', () => {
  const plan = planForFile({ probe: HD_PROBE, encoder: { kind: 'copy' } })
  const args = playbackArgsFor({ plan, file: '/media/a.ts', offset: 60, dir: '/tmp/p' })
  const line = args.join(' ')
  assert.ok(args.indexOf('-ss') < args.indexOf('-i'))
  assert.ok(line.includes('-ss 60 -fflags +genpts+discardcorrupt -i /media/a.ts'))
  assert.ok(line.includes('-map 0:0 -map 0:1 -c:v copy'))
  assert.ok(line.includes('-c:a aac -ac 2 -b:a 128k'))
  assert.ok(line.includes('-hls_time 6 -hls_playlist_type event'))
  assert.ok(!line.includes('delete_segments'))
  assert.ok(!line.includes('omit_endlist'))
  assert.equal(args.at(-1), '/tmp/p/index.m3u8')
})

test('playbackArgsFor: no -ss at offset 0; VAAPI decodes before the input', () => {
  const plan = planForFile({ probe: HD_PROBE, encoder: { kind: 'vaapi', device: '/dev/dri/renderD128', lowPower: true } })
  const args = playbackArgsFor({ plan, file: '/media/a.ts', offset: 0, dir: '/tmp/p' })
  assert.ok(!args.includes('-ss'))
  assert.ok(args.indexOf('-hwaccel') < args.indexOf('-i'))
  assert.ok(args.includes('h264_vaapi'))
})

test('playbackCandidates: imported file first, then the TVHeadend copy', () => {
  const paths = { tvhRecordingsPath: '/recordings', recordingsRoot: '/mnt/rec' }
  const row = { status: 'done', file_path: '/media/Show/a.ts', tvh_filename: '/recordings/a.ts' }
  assert.deepEqual(playbackCandidates({ row, ...paths }), ['/media/Show/a.ts', '/mnt/rec/a.ts'])
  assert.deepEqual(
    playbackCandidates({ row: { status: 'not_imported', file_path: null, tvh_filename: '/recordings/b.ts' }, ...paths }),
    ['/mnt/rec/b.ts'],
  )
})

test('playbackCandidates: nothing while importing; no TVHeadend copy once removed there', () => {
  const paths = { tvhRecordingsPath: '/recordings', recordingsRoot: '/mnt/rec' }
  assert.deepEqual(playbackCandidates({ row: { status: 'importing', tvh_filename: '/recordings/a.ts' }, ...paths }), [])
  const removed = { status: 'skipped', tvh_filename: '/recordings/a.ts', deleted_from_tvh_at: '2026-10-01' }
  assert.deepEqual(playbackCandidates({ row: removed, ...paths }), [])
  const outside = { status: 'skipped', tvh_filename: '/elsewhere/a.ts' }
  assert.deepEqual(playbackCandidates({ row: outside, ...paths }), [])
})

test('isInsideRoots: refuses paths outside every root, the root itself, and traversal', () => {
  const roots = ['/media', '/oneoff', '/mnt/rec']
  assert.equal(isInsideRoots({ file: '/media/Show/a.ts', roots }), true)
  assert.equal(isInsideRoots({ file: '/mnt/rec/x/b.ts', roots }), true)
  assert.equal(isInsideRoots({ file: '/media/../etc/passwd', roots }), false)
  assert.equal(isInsideRoots({ file: '/mediaevil/a.ts', roots }), false)
  assert.equal(isInsideRoots({ file: '/media', roots }), false)
  assert.equal(isInsideRoots({ file: '/etc/passwd', roots: [null, '', '/media'] }), false)
})

test('resolvePlaybackFile: follows symlinks before the root check and skips missing files', async () => {
  const links = { '/media': '/media', '/media/link.ts': '/etc/shadow', '/media/ok.ts': '/media/ok.ts' }
  const realpath = async (p) => {
    if (!(p in links)) throw new Error('ENOENT')
    return links[p]
  }
  const roots = ['/media', '/missing-root']
  assert.equal(await resolvePlaybackFile({ candidates: ['/media/link.ts'], roots, realpath }), null)
  assert.equal(await resolvePlaybackFile({ candidates: ['/media/gone.ts', '/media/ok.ts'], roots, realpath }), '/media/ok.ts')
})

test('resumeStartFor: resumes from the saved spot unless within 30 s of the end', () => {
  assert.equal(resumeStartFor({ savedSeconds: 600.7, durationSeconds: 3600 }), 600)
  assert.equal(resumeStartFor({ savedSeconds: 3575, durationSeconds: 3600 }), 0)
  assert.equal(resumeStartFor({ savedSeconds: 3569, durationSeconds: 3600 }), 3569)
  assert.equal(resumeStartFor({ savedSeconds: null, durationSeconds: 3600 }), 0)
  assert.equal(resumeStartFor({ savedSeconds: 120, durationSeconds: null }), 120)
})

test('startOffsetFor and positionFrom: clamp to the file and reject junk', () => {
  assert.equal(startOffsetFor({ seconds: 9999, duration: 120.5 }), 119)
  assert.equal(startOffsetFor({ seconds: -5, duration: 120 }), 0)
  assert.equal(startOffsetFor({ seconds: 'abc', duration: 120 }), 0)
  assert.equal(positionFrom('61.6'), 62)
  assert.equal(positionFrom(-1), null)
  assert.equal(positionFrom(Infinity), null)
  assert.equal(positionFrom(90_000), null)
})

test('producedSecondsOf and playlistForClient: sum segments; start at 0; end a finished encode', () => {
  const playlist = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-PLAYLIST-TYPE:EVENT\n#EXTINF:6.000000,\nseg0.ts\n#EXTINF:5.5,\nseg1.ts\n'
  assert.equal(producedSecondsOf(playlist), 11.5)
  const growing = playlistForClient({ playlist, finished: false })
  assert.match(growing, /^#EXTM3U\n#EXT-X-START:TIME-OFFSET=0,PRECISE=YES\n/)
  assert.doesNotMatch(growing, /ENDLIST/)
  assert.match(playlistForClient({ playlist, finished: true }), /seg1\.ts\n#EXT-X-ENDLIST\n$/)
  const ended = `${playlist}#EXT-X-ENDLIST\n`
  assert.equal(playlistForClient({ playlist: ended, finished: true }).match(/ENDLIST/g).length, 1)
})

test('PLAY_FILE_PATTERN: only the playlist and numbered segments', () => {
  assert.ok(PLAY_FILE_PATTERN.test('index.m3u8'))
  assert.ok(PLAY_FILE_PATTERN.test('seg12.ts'))
  assert.ok(!PLAY_FILE_PATTERN.test('../index.m3u8'))
  assert.ok(!PLAY_FILE_PATTERN.test('seg1.ts.tmp'))
})

test('seekPlan: seeks inside the produced range, restarts outside it', () => {
  const base = { offset: 600, producedEnd: 120, duration: 3600 }
  assert.deepEqual(seekPlan({ ...base, target: 650 }), { kind: 'local', time: 50 })
  assert.deepEqual(seekPlan({ ...base, target: 600 }), { kind: 'local', time: 0 })
  assert.deepEqual(seekPlan({ ...base, target: 719.5 }), { kind: 'restart', offset: 719 })
  assert.deepEqual(seekPlan({ ...base, target: 590 }), { kind: 'restart', offset: 590 })
  assert.deepEqual(seekPlan({ ...base, target: -20 }), { kind: 'restart', offset: 0 })
  assert.deepEqual(seekPlan({ ...base, target: 9999 }), { kind: 'restart', offset: 3599 })
  assert.deepEqual(seekPlan({ ...base, producedEnd: null, target: 610 }), { kind: 'restart', offset: 610 })
})

test('fmtPlayTime: minutes under an hour, hours above', () => {
  assert.equal(fmtPlayTime(65), '1:05')
  assert.equal(fmtPlayTime(3725.9), '1:02:05')
  assert.equal(fmtPlayTime(null), '0:00')
})

const fakeChild = (events) => {
  const child = new EventEmitter()
  child.stderr = new PassThrough()
  child.kill = (signal) => {
    events.push(signal)
    setImmediate(() => child.emit('exit', null, signal))
  }
  return child
}

const PLAN = planForFile({ probe: HD_PROBE, encoder: { kind: 'copy' } })

const playbackHarness = ({ streamsElsewhere, readText = async () => null } = {}) => {
  const events = []
  const children = []
  let clock = 1_000_000
  let ids = 0
  const sessions = createPlaybackSessions({
    now: () => clock,
    newId: () => `${String(++ids).padStart(16, 'a')}`,
    rootDir: '/tmp/fake-play',
    makeDir: async () => {},
    removeDir: async (dir) => { events.push(`rm ${dir}`) },
    readText,
    streamsElsewhere,
    spawnProcess: () => {
      const child = fakeChild(events)
      children.push(child)
      return child
    },
  })
  return { sessions, events, children, advance: (ms) => { clock += ms } }
}

const start = (sessions, extra = {}) => sessions.start({
  recordingId: 'r1', label: '"Show"', file: '/media/a.ts', offset: 0, duration: 3600, plan: PLAN, ...extra,
})

test('playback sessions: stop kills ffmpeg and removes the folder', async () => {
  const h = playbackHarness()
  const session = await start(h.sessions)
  assert.equal(await h.sessions.stop(session.id), true)
  assert.deepEqual(h.events, ['SIGTERM', `rm /tmp/fake-play/${session.id}`])
  assert.equal(h.sessions.activeCount(), 0)
})

test('playback sessions: a restart replaces the old session before the cap is checked', async () => {
  const h = playbackHarness()
  const first = await start(h.sessions)
  await start(h.sessions, { recordingId: 'r2' })
  const restarted = await start(h.sessions, { offset: 600, replace: first.id })
  assert.equal(restarted.offset, 600)
  assert.equal(h.sessions.activeCount(), 2)
})

test('playback sessions: the reaper ends a session idle for 60 s; fetches keep it alive', async () => {
  const h = playbackHarness()
  const session = await start(h.sessions)
  h.advance(50_000)
  h.sessions.touch(session.id)
  h.advance(50_000)
  await h.sessions.tick()
  assert.equal(h.sessions.activeCount(), 1)
  h.advance(11_000)
  await h.sessions.tick()
  assert.equal(h.sessions.activeCount(), 0)
})

test('playback sessions: a finished encode keeps serving and ends its playlist', async () => {
  const playlist = '#EXTM3U\n#EXTINF:6.0,\nseg0.ts\n'
  const h = playbackHarness({ readText: async () => playlist })
  const session = await start(h.sessions)
  h.children[0].emit('exit', 0, null)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(h.sessions.activeCount(), 1)
  assert.match(await h.sessions.playlistFor(session.id), /#EXT-X-ENDLIST\n$/)
  assert.equal((await h.sessions.status(session.id)).producedSeconds, 6)
})

test('playback sessions: ffmpeg failing before any segment ends the session with its error', async () => {
  const h = playbackHarness()
  const session = await start(h.sessions)
  h.children[0].stderr.write('Invalid data found when processing input\n')
  await new Promise((resolve) => setImmediate(resolve))
  h.children[0].emit('exit', 1, null)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(session.status, 'ended')
  assert.equal(session.reason.detail, 'Invalid data found when processing input')
})

test('stream cap: live TV and recordings share one limit and name what is playing', async () => {
  let playback = null
  const live = createLiveSessions({
    maxSessions: 2,
    streamsElsewhere: () => playback.labels(),
    newId: () => 'b'.repeat(16),
    makeDir: async () => {},
    removeDir: async () => {},
    spawnProcess: () => {
      const child = fakeChild([])
      child.stdin = new PassThrough()
      return child
    },
    openUpstream: async () => new PassThrough(),
  })
  const h = playbackHarness({ streamsElsewhere: () => live.labels() })
  playback = h.sessions
  await live.start({ channelId: 'c1', plan: { video: { pid: 1 }, audio: null, videoMode: 'copy' }, label: 'ABC TV' })
  await start(h.sessions)
  await assert.rejects(start(h.sessions, { recordingId: 'r2' }), (err) => {
    assert.equal(err.code, 'max-sessions')
    assert.match(err.message, /Only 2 streams can play at once\. Playing now: "Show", live TV on ABC TV\./)
    return true
  })
  await assert.rejects(live.start({ channelId: 'c2', plan: {} }), { code: 'max-sessions' })
  await live.stopAll()
  await h.sessions.stopAll()
})
