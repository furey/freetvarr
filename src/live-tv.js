import os from 'os'
import path from 'path'
import crypto from 'crypto'
import fs from 'fs/promises'
import { spawn } from 'child_process'

import {
  resolveConnection,
  getTunerStatus,
  listSubscriptions,
  listServiceMuxes,
  getChannelServiceInfo,
  getDefaultLanguages,
  openChannelStream,
} from './tvheadend.js'
import { getRecordingState, listGuideChannels } from './epg.js'
import { vaapiFilters, vaapiEncoderArgs, VAAPI_HEIGHT_CAP } from './live-encoder.js'

export const LIVE_ROOT = path.join(os.tmpdir(), 'freetvarr-live')
export const LIVE_FILE_PATTERN = /^(index\.m3u8|seg\d{1,9}\.ts)$/
export const LIVE_SESSION_PATTERN = /^[a-f0-9]{16}$/
export const CONFLICT_WINDOW_MS = 60 * 60 * 1000
export const HLS_SEGMENT_SECONDS = 2
export const MIN_LIVE_SEGMENTS = 6

export const DEFAULT_LIVE_BUFFER_MINUTES = 30
export const MAX_LIVE_BUFFER_MINUTES = 120

export const liveBufferMinutesFrom = (value) => {
  const minutes = Number(value)
  if (value == null || value === '' || !Number.isFinite(minutes)) return DEFAULT_LIVE_BUFFER_MINUTES
  return Math.min(MAX_LIVE_BUFFER_MINUTES, Math.max(0, Math.round(minutes)))
}

export const liveSegmentCount = (bufferMinutes = 0) =>
  Math.max(MIN_LIVE_SEGMENTS, Math.ceil((bufferMinutes * 60) / HLS_SEGMENT_SECONDS))

export class LiveTvError extends Error {
  constructor(message, { code, status = 409, details = {} } = {}) {
    super(message)
    this.name = 'LiveTvError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export const pickStreams = ({ streams = [], languages = [], encoder = COPY_ENCODER } = {}) => {
  const video = streams.find((s) => VIDEO_TYPES.includes(s.type)) || null
  const audio = pickAudio({ streams, languages })
  if (!video) return { video: null, audio, videoMode: null, heightCap: null, deinterlace: false }
  if (video.type === 'H264') return { video, audio, ...h264Plan(encoder) }
  const standardDefinition = isStandardDefinition(video)
  return {
    video,
    audio,
    videoMode: 'transcode',
    heightCap: standardDefinition ? SD_HEIGHT_CAP : HD_TRANSCODE_HEIGHT_CAP,
    deinterlace: standardDefinition,
  }
}

export const ffmpegArgsFor = ({ plan, dir, segmentCount = MIN_LIVE_SEGMENTS }) => [
  '-hide_banner',
  '-loglevel', 'error',
  ...hardwareDecodeArgs(plan),
  '-fflags', '+genpts+discardcorrupt',
  '-f', 'mpegts',
  '-i', 'pipe:0',
  '-map', pidSpecifier(plan.video.pid),
  ...(plan.audio ? ['-map', pidSpecifier(plan.audio.pid)] : []),
  ...videoCodecArgs(plan),
  ...(plan.audio ? ['-c:a', 'aac', '-ac', '2', '-b:a', '128k'] : []),
  '-f', 'hls',
  '-hls_time', String(HLS_SEGMENT_SECONDS),
  '-hls_list_size', String(segmentCount),
  '-hls_flags', 'delete_segments+independent_segments+omit_endlist+temp_file',
  '-hls_segment_filename', path.join(dir, 'seg%d.ts'),
  path.join(dir, 'index.m3u8'),
]

const CUT_IN_SEGMENT = 'seg0.ts'

export const withoutCutInSegment = (playlist) => {
  const lines = playlist.split('\n')
  const cutIn = lines.indexOf(CUT_IN_SEGMENT)
  if (cutIn < 1 || !lines[cutIn - 1].startsWith('#EXTINF')) return playlist
  return lines
    .filter((_, i) => i !== cutIn && i !== cutIn - 1)
    .map((line) => line.startsWith('#EXT-X-MEDIA-SEQUENCE:0') ? '#EXT-X-MEDIA-SEQUENCE:1' : line)
    .join('\n')
}

export const hasSegments = (playlist) => /^seg\d+\.ts$/m.test(playlist)

export const tunerVerdict = ({
  channelMux,
  inputs = [],
  tunerCount,
  recordings = [],
  now,
  windowMs = CONFLICT_WINDOW_MS,
}) => {
  const tuners = tunerCount ?? inputs.length
  const tuned = inputs.filter((i) => i.mux)
  const conflict = findConflict({ channelMux, tuners, recordings, now, windowMs })
  if (tuned.some((i) => i.mux === channelMux)) return { ok: true, via: 'shared', conflict }
  if (tuned.length < tuners) return { ok: true, via: 'idle', conflict }
  return {
    ok: false,
    code: 'no-tuner',
    conflict,
    holders: tuned.map((i) => ({ tuner: i.input, mux: i.mux, holders: i.holders || [] })),
  }
}

export const stallReason = ({ subscriptions = [], userAgent, sessionStartedAt = 0 }) => {
  const recording = subscriptions
    .filter((s) => DVR_TITLE.test(s.title) && s.startedAt >= sessionStartedAt)
    .sort((a, b) => b.startedAt - a.startedAt)[0]
  if (recording) return { code: 'preempted', recording: recording.title.replace(DVR_TITLE, '') }
  const own = subscriptions.find((s) => s.client === userAgent || s.title === userAgent)
  if (own) return { code: 'no-input', detail: own.state }
  return { code: 'gone' }
}

export const holdersByInput = ({ inputs = [], subscriptions = [] }) =>
  inputs.map((i) => ({
    ...i,
    holders: subscriptions
      .filter((s) => s.service.startsWith(`${i.input}/`))
      .map((s) => s.title || s.client || s.channel),
  }))

export const createLiveSessions = ({
  spawnProcess = spawn,
  openUpstream,
  describeStall = async () => ({ code: 'gone' }),
  makeDir = (dir) => fs.mkdir(dir, { recursive: true }),
  removeDir = (dir) => fs.rm(dir, { recursive: true, force: true }),
  readText = (file) => fs.readFile(file, 'utf8').catch(() => null),
  now = Date.now,
  newId = () => crypto.randomBytes(8).toString('hex'),
  rootDir = LIVE_ROOT,
  maxSessions = 2,
  streamsElsewhere = () => [],
  bufferMinutes = 0,
  idleMs = 20_000,
  stallMs = 10_000,
  killGraceMs = 3_000,
  endedMemoryMs = 60_000,
} = {}) => {
  const sessions = new Map()
  const ended = new Map()

  const start = async ({ channelId, plan, label = null }) => {
    const existing = forChannel(channelId)
    if (existing) {
      existing.viewers += 1
      touch(existing.id)
      return { session: existing, shared: true }
    }
    const playing = [...labels(), ...streamsElsewhere()]
    if (playing.length >= maxSessions) {
      throw streamLimitError({ maxSessions, playing })
    }
    const id = newId()
    const session = {
      id,
      channelId,
      label: label || `channel ${channelId}`,
      dir: path.join(rootDir, id),
      userAgent: `Freetvarr-live/${id}`,
      status: 'tuning',
      reason: null,
      startedAt: now(),
      lastSeenAt: now(),
      lastByteAt: now(),
      viewers: 1,
      heldUntil: 0,
      bufferSeconds: bufferMinutes * 60,
      controller: new AbortController(),
      child: null,
      errorLines: [],
      ending: null,
    }
    sessions.set(id, session)
    ended.delete(channelId)
    try {
      await makeDir(session.dir)
      session.child = spawnProcess('ffmpeg', ffmpegArgsFor({
        plan,
        dir: session.dir,
        segmentCount: liveSegmentCount(bufferMinutes),
      }), {
        stdio: ['pipe', 'ignore', 'pipe'],
      })
    } catch (err) {
      session.exited = true
      await end(session, { code: 'ffmpeg', detail: err.message })
      return { session, shared: false }
    }
    watchChild(session)
    pumpUpstream(session)
    return { session, shared: false }
  }

  const watchChild = (session) => {
    const { child } = session
    child.stdin.on('error', () => {})
    child.stderr?.on('data', (chunk) => {
      const lines = String(chunk).split('\n').map((l) => l.trim()).filter(Boolean)
      session.errorLines.push(...lines.slice(0, MAX_ERROR_LINES - session.errorLines.length))
    })
    child.on('error', (err) => {
      session.exited = true
      if (!session.ending) end(session, { code: 'ffmpeg', detail: err.message })
    })
    child.on('exit', (code, signal) => {
      session.exited = true
      if (session.ending || session.status === 'stalled') return
      end(session, {
        code: 'ffmpeg',
        detail: session.errorLines[0] || `ffmpeg exited (${signal || code}).`,
      })
    })
  }

  const pumpUpstream = async (session) => {
    try {
      const upstream = await openUpstream({
        channelId: session.channelId,
        signal: session.controller.signal,
        userAgent: session.userAgent,
      })
      if (session.ending) return upstream.destroy?.()
      session.upstream = upstream
      upstream.on('data', () => { session.lastByteAt = now() })
      upstream.on('error', () => {})
      upstream.on('end', () => {
        if (!session.ending) stall(session)
      })
      upstream.pipe(session.child.stdin)
    } catch (err) {
      if (session.ending) return
      end(session, {
        code: err.code === 'no-tuner' ? 'no-tuner' : 'upstream',
        detail: err.message,
      })
    }
  }

  const stall = async (session) => {
    if (session.status === 'stalled' || session.ending) return
    session.status = 'stalled'
    const reason = await describeStall(session).catch(() => ({ code: 'gone' }))
    await end(session, reason)
  }

  const end = (session, reason) => {
    if (session.ending) return session.ending
    session.status = 'ended'
    session.reason = reason
    ended.set(session.channelId, { ...view(session), endedAt: now() })
    session.ending = teardown(session).finally(() => sessions.delete(session.id))
    return session.ending
  }

  const teardown = async (session) => {
    session.controller.abort()
    session.upstream?.destroy?.()
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
    for (const [channelId, info] of ended) {
      if (t - info.endedAt > endedMemoryMs) ended.delete(channelId)
    }
    const work = [...sessions.values()]
      .filter((s) => !s.ending)
      .map((s) => {
        if (t >= s.heldUntil && t - s.lastSeenAt > idleMs) return end(s, { code: 'idle' })
        if (t - s.lastByteAt > stallMs) return stall(s)
        return null
      })
    await Promise.all(work)
  }

  const touch = (id) => {
    const session = sessions.get(id)
    if (session && !session.ending) session.lastSeenAt = now()
    return session || null
  }

  const hold = async (id) => {
    const session = sessions.get(id)
    if (!session || session.ending) return false
    if (!bufferMinutes) return leave(id)
    session.heldUntil = now() + bufferMinutes * 60_000
    return true
  }

  const leave = async (id) => {
    const session = sessions.get(id)
    if (!session || session.ending) return false
    session.viewers -= 1
    if (session.viewers <= 0) await end(session, { code: 'stopped' })
    return true
  }

  const stopAll = () => Promise.all([...sessions.values()].map((s) => end(s, { code: 'shutdown' })))

  const forChannel = (channelId) =>
    [...sessions.values()].find((s) => s.channelId === channelId && !s.ending) || null

  const statusForChannel = async (channelId) => {
    const session = forChannel(channelId)
    if (!session) return ended.get(channelId) || null
    await refreshStatus(session)
    return view(session)
  }

  const readPlaylist = async (session) => {
    const text = await readText(path.join(session.dir, 'index.m3u8'))
    return text == null ? null : withoutCutInSegment(text)
  }

  const refreshStatus = async (session) => {
    if (session.status !== 'tuning') return session
    const playlist = await readPlaylist(session)
    if (playlist && hasSegments(playlist)) session.status = 'live'
    return session
  }

  const playlistFor = async (id) => {
    const session = sessions.get(id)
    if (!session || session.ending) return null
    return readPlaylist(session)
  }

  const waitForPlaylist = async (id, { timeoutMs = 8_000, pollMs = 200 } = {}) => {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const session = sessions.get(id)
      if (!session || session.ending) return false
      await refreshStatus(session)
      if (session.status === 'live') return true
      if (Date.now() >= deadline) return false
      await new Promise((resolve) => setTimeout(resolve, pollMs))
    }
  }

  const fileFor = (id, name) => {
    if (!LIVE_SESSION_PATTERN.test(String(id)) || !LIVE_FILE_PATTERN.test(String(name))) return null
    const session = sessions.get(id)
    if (!session || session.ending) return null
    return path.join(session.dir, name)
  }

  const get = (id) => sessions.get(id) || null

  const labels = () => [...sessions.values()].map((s) => `live TV on ${s.label}`)

  return {
    start, touch, hold, leave, tick, stopAll, forChannel, statusForChannel,
    waitForPlaylist, playlistFor, fileFor, get, view, labels, activeCount: () => sessions.size,
  }
}

export const streamLimitError = ({ maxSessions, playing }) =>
  new LiveTvError(
    `Only ${maxSessions} stream${maxSessions === 1 ? '' : 's'} can play at once. Playing now: ${playing.join(', ')}.`,
    { code: 'max-sessions', details: { playing } },
  )

export const view = (session) => ({
  id: session.id,
  channelId: session.channelId,
  status: session.status,
  reason: session.reason,
  startedAt: session.startedAt,
  bufferSeconds: session.bufferSeconds ?? 0,
  playlist: `/api/live/${session.id}/index.m3u8`,
})

export const preflightChannel = async ({ channelId, now = Date.now() }) => {
  const channel = await findChannel(channelId)
  const conn = await resolveConnection()
  const [channels, muxes, tuners, subscriptions, state] = await Promise.all([
    listGuideChannels(),
    listServiceMuxes(conn),
    getTunerStatus(conn),
    listSubscriptions(conn).catch(() => []),
    getRecordingState().catch(() => ({ futureRecordings: [] })),
  ])
  const muxOfChannel = (id) => {
    const c = channels.find((ch) => String(ch.id) === String(id))
    return muxes.get(c?.serviceIds?.[0])?.muxName || null
  }
  const verdict = tunerVerdict({
    channelMux: muxOfChannel(channel.id),
    inputs: holdersByInput({ inputs: tuners.inputs, subscriptions }),
    tunerCount: tuners.tunerCount,
    recordings: (state.futureRecordings || []).map((r) => ({
      name: r.name,
      mux: muxOfChannel(r.channelId),
      start: r.paddedStartDate ?? r.startDate,
      end: r.paddedEndDate ?? r.endDate,
      running: r.schedStatus === 'recording',
    })),
    now,
  })
  return { ...verdict, channel: { id: channel.id, name: channel.name } }
}

export const startLiveChannel = async ({ channelId, sessions, encoder }) => {
  const existing = sessions.forChannel(channelId)
  const verdict = existing ? null : await preflightChannel({ channelId })
  if (verdict && !verdict.ok) {
    throw new LiveTvError('Every tuner is busy on another multiplex.', {
      code: verdict.code,
      details: { holders: verdict.holders, conflict: verdict.conflict },
    })
  }
  const plan = existing ? null : await planForChannel({ channelId, encoder })
  const { session, shared } = await sessions.start({ channelId, plan, label: verdict?.channel?.name })
  return { session: sessions.view(session), shared, conflict: verdict?.conflict || null }
}

export const describeStallFor = async (session) =>
  stallReason({
    subscriptions: await listSubscriptions(),
    userAgent: session.userAgent,
    sessionStartedAt: session.startedAt,
  })

export const openUpstreamFor = ({ channelId, signal, userAgent }) =>
  openChannelStream({ channelId, signal, userAgent })

const planForChannel = async ({ channelId, encoder }) => {
  const channel = await findChannel(channelId)
  const conn = await resolveConnection()
  const serviceId = channel.serviceIds?.[0]
  if (!serviceId) {
    throw new LiveTvError('This channel has no service mapped in TVHeadend.', { code: 'no-service' })
  }
  const [info, languages] = await Promise.all([
    getChannelServiceInfo({ serviceId, conn }),
    getDefaultLanguages(conn).catch(() => []),
  ])
  const plan = pickStreams({ streams: info.streams, languages, encoder })
  if (!plan.video) {
    throw new LiveTvError('This channel carries no video.', { code: 'no-video' })
  }
  return plan
}

const findChannel = async (channelId) => {
  const channel = (await listGuideChannels()).find((c) => String(c.id) === String(channelId))
  if (!channel) throw new LiveTvError('Unknown channel.', { code: 'unknown-channel', status: 404 })
  return channel
}

const findConflict = ({ channelMux, tuners, recordings, now, windowMs }) => {
  const soon = recordings
    .filter((r) => !r.running && r.start > now && r.start <= now + windowMs)
    .sort((a, b) => a.start - b.start)
  for (const r of soon) {
    const active = recordings.filter((o) => o.start <= r.start && o.end > r.start)
    const muxes = new Set([...active.map((o) => o.mux), channelMux])
    if (muxes.size > tuners) return { title: r.name, startsAt: r.start }
  }
  return null
}

const pickAudio = ({ streams, languages }) => {
  const audio = streams.filter((s) => AUDIO_TYPES.includes(s.type))
  const main = audio.filter((s) => (s.audioType ?? 0) === 0)
  const candidates = main.length ? main : audio
  const preferred = languages
    .map((lang) => candidates.find((s) => s.language === lang))
    .find(Boolean)
  return preferred || candidates[0] || null
}

const isStandardDefinition = (video) =>
  video.height ? video.height <= SD_HEIGHT_CAP : video.type === 'MPEG2VIDEO'

const h264Plan = (encoder) => {
  if (encoder.kind === 'vaapi') {
    return {
      videoMode: 'vaapi',
      heightCap: VAAPI_HEIGHT_CAP,
      deinterlace: true,
      vaapi: { device: encoder.device, lowPower: encoder.lowPower },
    }
  }
  if (encoder.kind === 'software') {
    return { videoMode: 'transcode', heightCap: HD_TRANSCODE_HEIGHT_CAP, deinterlace: true }
  }
  return { videoMode: 'copy', heightCap: null, deinterlace: false }
}

export const hardwareDecodeArgs = (plan) => plan.videoMode === 'vaapi'
  ? ['-hwaccel', 'vaapi', '-hwaccel_device', plan.vaapi.device, '-hwaccel_output_format', 'vaapi']
  : []

export const videoCodecArgs = (plan) => {
  if (plan.videoMode === 'copy') return ['-c:v', 'copy']
  if (plan.videoMode === 'vaapi') {
    return [
      '-vf', vaapiFilters(),
      ...vaapiEncoderArgs({ lowPower: plan.vaapi.lowPower }),
      '-g', '50',
      '-keyint_min', '50',
    ]
  }
  const filters = [
    ...(plan.deinterlace ? ['yadif=deint=interlaced'] : []),
    `scale=-2:min(ih\\,${plan.heightCap})`,
  ].join(',')
  return [
    '-vf', filters,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-tune', 'zerolatency',
    '-crf', '23',
    '-g', '50',
    '-sc_threshold', '0',
    '-pix_fmt', 'yuv420p',
  ]
}

const pidSpecifier = (pid) => `0:i:0x${Number(pid).toString(16)}`

const VIDEO_TYPES = ['H264', 'HEVC', 'MPEG2VIDEO', 'MPEG4VIDEO', 'VC1']
const AUDIO_TYPES = ['MPEG2AUDIO', 'AC3', 'EAC3', 'AAC', 'AAC-LATM', 'MP4A', 'VORBIS', 'OPUS']
const DVR_TITLE = /^DVR:\s*/
const SD_HEIGHT_CAP = 576
const HD_TRANSCODE_HEIGHT_CAP = 540
const COPY_ENCODER = { kind: 'copy' }
const MAX_ERROR_LINES = 20
