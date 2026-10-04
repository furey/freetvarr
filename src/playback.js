import path from 'path'
import crypto from 'crypto'
import fs from 'fs/promises'
import { spawn, execFile } from 'child_process'

import {
  LIVE_ROOT,
  LiveTvError,
  pickStreams,
  hardwareDecodeArgs,
  videoCodecArgs,
  streamLimitError,
} from './live-tv.js'
import { localPathFor } from './sync.js'

export const PLAY_ROOT = path.join(LIVE_ROOT, 'play')
export const PLAY_FILE_PATTERN = /^(index\.m3u8|seg\d{1,9}\.ts)$/
export const PLAY_SESSION_PATTERN = /^[a-f0-9]{16}$/
export const PLAY_SEGMENT_SECONDS = 6
export const RESUME_END_MARGIN_S = 30
export const MAX_POSITION_S = 24 * 60 * 60

export const probeStreamsFrom = (probe) =>
  (probe?.streams || [])
    .map((s) => ({
      index: s.index,
      pid: s.index,
      type: CODEC_TYPES[s.codec_name] || null,
      language: s.tags?.language || '',
      audioType: s.codec_type === 'audio' ? audioTypeOf(s) : null,
      height: s.height || null,
    }))
    .filter((s) => s.type)

export const durationFrom = (probe) => {
  const duration = Number(probe?.format?.duration)
  return Number.isFinite(duration) && duration > 0 ? duration : null
}

export const playbackArgsFor = ({ plan, file, offset = 0, dir }) => [
  '-hide_banner',
  '-loglevel', 'error',
  '-nostdin',
  ...hardwareDecodeArgs(plan),
  ...(offset > 0 ? ['-ss', String(offset)] : []),
  '-fflags', '+genpts+discardcorrupt',
  '-i', file,
  '-map', `0:${plan.video.index}`,
  ...(plan.audio ? ['-map', `0:${plan.audio.index}`] : []),
  ...videoCodecArgs(plan),
  ...(plan.audio ? ['-c:a', 'aac', '-ac', '2', '-b:a', '128k'] : []),
  '-max_muxing_queue_size', '1024',
  '-f', 'hls',
  '-hls_time', String(PLAY_SEGMENT_SECONDS),
  '-hls_playlist_type', 'event',
  '-hls_flags', 'independent_segments+temp_file',
  '-hls_segment_filename', path.join(dir, 'seg%d.ts'),
  path.join(dir, 'index.m3u8'),
]

export const playbackCandidates = ({ row, tvhRecordingsPath, recordingsRoot }) => {
  if (!row || row.status === 'importing' || row.purged_at) return []
  const imported = ['done', 'partial'].includes(row.status) && row.file_path ? [row.file_path] : []
  const fromTvh = !row.deleted_from_tvh_at && row.tvh_filename
    ? [localPathFor({ tvhFilename: row.tvh_filename, tvhRecordingsPath, recordingsRoot })]
    : []
  return [...imported, ...fromTvh].filter(Boolean)
}

export const isInsideRoots = ({ file, roots }) => {
  const resolved = path.resolve(file)
  return roots.filter(Boolean).some((root) => {
    const rel = path.relative(path.resolve(root), resolved)
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
  })
}

export const resumeStartFor = ({ savedSeconds, durationSeconds, endMarginS = RESUME_END_MARGIN_S }) => {
  const saved = Number(savedSeconds)
  if (!Number.isFinite(saved) || saved <= 0) return 0
  if (durationSeconds && saved >= durationSeconds - endMarginS) return 0
  return Math.floor(saved)
}

export const positionFrom = (value) => {
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > MAX_POSITION_S) return null
  return Math.round(seconds)
}

export const startOffsetFor = ({ seconds, duration }) => {
  const wanted = positionFrom(seconds) ?? 0
  const last = duration ? Math.max(0, Math.floor(duration) - 1) : wanted
  return Math.min(wanted, last)
}

export const producedSecondsOf = (playlist) =>
  [...String(playlist || '').matchAll(/^#EXTINF:([\d.]+)/gm)]
    .reduce((sum, [, seconds]) => sum + Number(seconds), 0)

export const playlistForClient = ({ playlist, finished }) => {
  const withStart = playlist.replace(/^#EXTM3U\n/, '#EXTM3U\n#EXT-X-START:TIME-OFFSET=0,PRECISE=YES\n')
  if (!finished || /^#EXT-X-ENDLIST/m.test(withStart)) return withStart
  return `${withStart.replace(/\n*$/, '\n')}#EXT-X-ENDLIST\n`
}

export const hasSegments = (playlist) => /^seg\d+\.ts$/m.test(playlist || '')

export const resolvePlaybackFile = async ({ candidates, roots, realpath = fs.realpath }) => {
  const realRoots = (await Promise.all(roots.filter(Boolean).map((r) => realpath(r).catch(() => null))))
    .filter(Boolean)
  for (const candidate of candidates) {
    const real = await realpath(candidate).catch(() => null)
    if (real && isInsideRoots({ file: real, roots: realRoots })) return real
  }
  return null
}

export const probeRecording = (file) => new Promise((resolve, reject) => {
  execFile('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration:stream=index,codec_type,codec_name,height:stream_tags=language:stream_disposition=visual_impaired',
    '-of', 'json',
    file,
  ], { timeout: PROBE_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
    if (err) return reject(new LiveTvError(`ffprobe could not read the recording: ${firstLine(err.message)}`, { code: 'probe', status: 422 }))
    try {
      resolve(JSON.parse(stdout))
    } catch {
      reject(new LiveTvError('ffprobe returned unreadable output.', { code: 'probe', status: 422 }))
    }
  })
})

export const planForFile = ({ probe, encoder }) => {
  const plan = pickStreams({ streams: probeStreamsFrom(probe), encoder })
  if (!plan.video) throw new LiveTvError('This recording has no video.', { code: 'no-video', status: 422 })
  return plan
}

export const createPlaybackSessions = ({
  spawnProcess = spawn,
  makeDir = (dir) => fs.mkdir(dir, { recursive: true }),
  removeDir = (dir) => fs.rm(dir, { recursive: true, force: true }),
  readText = (file) => fs.readFile(file, 'utf8').catch(() => null),
  now = Date.now,
  newId = () => crypto.randomBytes(8).toString('hex'),
  rootDir = PLAY_ROOT,
  maxSessions = 2,
  streamsElsewhere = () => [],
  idleMs = 60_000,
  killGraceMs = 3_000,
} = {}) => {
  const sessions = new Map()

  const start = async ({ recordingId, label, file, offset = 0, duration = null, plan, replace = null }) => {
    if (replace) await stop(replace)
    const playing = [...labels(), ...streamsElsewhere()]
    if (playing.length >= maxSessions) throw streamLimitError({ maxSessions, playing })
    const id = newId()
    const session = {
      id,
      recordingId,
      label: label || 'a recording',
      file,
      offset,
      duration,
      dir: path.join(rootDir, id),
      status: 'starting',
      reason: null,
      startedAt: now(),
      lastSeenAt: now(),
      child: null,
      exited: false,
      finished: false,
      errorLines: [],
      ending: null,
    }
    sessions.set(id, session)
    try {
      await makeDir(session.dir)
      session.child = spawnProcess('ffmpeg', playbackArgsFor({ plan, file, offset, dir: session.dir }), {
        stdio: ['ignore', 'ignore', 'pipe'],
      })
    } catch (err) {
      session.exited = true
      await end(session, { code: 'ffmpeg', detail: err.message })
      return session
    }
    watchChild(session)
    return session
  }

  const watchChild = (session) => {
    const { child } = session
    child.stderr?.on('data', (chunk) => {
      const lines = String(chunk).split('\n').map((l) => l.trim()).filter(Boolean)
      session.errorLines.push(...lines.slice(0, MAX_ERROR_LINES - session.errorLines.length))
    })
    child.on('error', (err) => {
      session.exited = true
      if (!session.ending) end(session, { code: 'ffmpeg', detail: err.message })
    })
    child.on('exit', async (code, signal) => {
      session.exited = true
      if (session.ending) return
      const playlist = await readPlaylist(session)
      if (hasSegments(playlist)) {
        session.finished = true
        session.status = 'ready'
        return
      }
      end(session, {
        code: 'ffmpeg',
        detail: session.errorLines[0] || `ffmpeg exited (${signal || code}).`,
      })
    })
  }

  const end = (session, reason) => {
    if (session.ending) return session.ending
    session.status = 'ended'
    session.reason = reason
    session.ending = teardown(session).finally(() => sessions.delete(session.id))
    return session.ending
  }

  const teardown = async (session) => {
    await stopChild(session)
    await removeDir(session.dir).catch(() => {})
  }

  const stopChild = (session) => new Promise((resolve) => {
    const { child } = session
    if (!child || session.exited) return resolve()
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve()
    }, killGraceMs)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    child.kill('SIGTERM')
  })

  const tick = async () => {
    const t = now()
    const idle = [...sessions.values()].filter((s) => !s.ending && t - s.lastSeenAt > idleMs)
    await Promise.all(idle.map((s) => end(s, { code: 'idle' })))
  }

  const touch = (id) => {
    const session = sessions.get(id)
    if (session && !session.ending) session.lastSeenAt = now()
    return session && !session.ending ? session : null
  }

  const stop = async (id) => {
    const session = sessions.get(id)
    if (!session || session.ending) return false
    await end(session, { code: 'stopped' })
    return true
  }

  const stopAll = () => Promise.all([...sessions.values()].map((s) => end(s, { code: 'shutdown' })))

  const readPlaylist = (session) => readText(path.join(session.dir, 'index.m3u8'))

  const status = async (id) => {
    const session = touch(id)
    if (!session) return null
    const playlist = await readPlaylist(session)
    if (session.status === 'starting' && hasSegments(playlist)) session.status = 'ready'
    return { ...view(session), producedSeconds: producedSecondsOf(playlist) }
  }

  const playlistFor = async (id) => {
    const session = sessions.get(id)
    if (!session || session.ending) return null
    const playlist = await readPlaylist(session)
    if (!hasSegments(playlist)) return null
    return playlistForClient({ playlist, finished: session.finished })
  }

  const waitForPlaylist = async (id, { timeoutMs = 15_000, pollMs = 200 } = {}) => {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const playlist = await playlistFor(id)
      if (playlist) return playlist
      const session = sessions.get(id)
      if (!session || session.ending || Date.now() >= deadline) return null
      await new Promise((resolve) => setTimeout(resolve, pollMs))
    }
  }

  const fileFor = (id, name) => {
    if (!PLAY_SESSION_PATTERN.test(String(id)) || !PLAY_FILE_PATTERN.test(String(name))) return null
    const session = sessions.get(id)
    if (!session || session.ending) return null
    return path.join(session.dir, name)
  }

  const labels = () => [...sessions.values()].map((s) => s.label)

  return {
    start, touch, stop, tick, stopAll, status, playlistFor, waitForPlaylist, fileFor, labels,
    get: (id) => sessions.get(id) || null,
    activeCount: () => sessions.size,
  }
}

export const view = (session) => ({
  id: session.id,
  recordingId: session.recordingId,
  status: session.status,
  reason: session.reason,
  offset: session.offset,
  duration: session.duration,
  finished: session.finished,
  playlist: `/api/play/${session.id}/index.m3u8`,
})

const audioTypeOf = (stream) => (stream.disposition?.visual_impaired ? 3 : 0)

const firstLine = (text) => String(text || '').trim().split('\n')[0]

const CODEC_TYPES = {
  h264: 'H264',
  hevc: 'HEVC',
  mpeg2video: 'MPEG2VIDEO',
  mpeg4: 'MPEG4VIDEO',
  vc1: 'VC1',
  mp2: 'MPEG2AUDIO',
  mp3: 'MPEG2AUDIO',
  ac3: 'AC3',
  eac3: 'EAC3',
  aac: 'AAC',
  aac_latm: 'AAC-LATM',
  vorbis: 'VORBIS',
  opus: 'OPUS',
}
const PROBE_TIMEOUT_MS = 30_000
const MAX_ERROR_LINES = 20
