import os from 'os'
import path from 'path'
import fs from 'fs/promises'
import { createReadStream } from 'fs'
import { once } from 'events'
import { Transform } from 'stream'

import { LiveTvError } from './live-tv.js'
import { planForFile, probeRecording, resolvePlaybackFile, view } from './playback.js'
import { getRecordingsRoot, getTvhRecordingsPath, localPathFor } from './sync.js'
import { listActiveRecordings, loadRecording, openDvrFile, resolveConnection } from './tvheadend.js'

export const IN_PROGRESS_POLL_MS = 1000
export const RECORDING_CHECK_MS = 5000
export const PROBE_HEAD_BYTES = 8 * 1024 * 1024

export const mountInProgressPlayback = ({
  app, csrf, limiter, sessions, encoderReady, folders, onError,
}) => {
  app.post('/api/play/in-progress', limiter, csrf, async (req, res) => {
    const dvrUuid = typeof req.body?.dvrUuid === 'string' ? req.body.dvrUuid.trim() : ''
    if (!dvrUuid) return res.status(400).json({ ok: false, error: 'dvrUuid is required', code: 'dvr-uuid' })
    try {
      const started = await startInProgressPlayback({
        dvrUuid,
        sessions,
        encoder: await encoderReady,
        folders: await folders(),
        replace: typeof req.body?.replace === 'string' ? req.body.replace : null,
        player: typeof req.body?.player === 'string' ? req.body.player.slice(0, 64) : null,
      })
      res.json({ ok: true, ...started })
    } catch (err) {
      onError(res, err, 'in-progress play')
    }
  })
}

export const inProgressFolders = async () => {
  const [tvhRecordingsPath, recordingsRoot] = await Promise.all([getTvhRecordingsPath(), getRecordingsRoot()])
  return { tvhRecordingsPath, recordingsRoot }
}

export const startInProgressPlayback = async ({ dvrUuid, sessions, encoder, folders, replace, player }) => {
  const conn = await resolveConnection()
  const recording = (await listActiveRecordings(conn)).find((r) => r.uuid === dvrUuid)
  if (!recording) {
    throw new LiveTvError('That programme is not recording now.', { code: 'not-recording', status: 404 })
  }
  const source = await growingSourceFor({ recording, folders, conn })
  const probe = await probeHead(source)
  const plan = planForFile({ probe, encoder })
  const isRecording = recordingChecker({ uuid: dvrUuid, conn })
  const session = await sessions.start({
    recordingId: dvrUuid,
    label: `"${[recording.name, recording.episodeTitle].filter(Boolean).join(': ')}" from the start`,
    file: source.file,
    offset: 0,
    duration: null,
    plan,
    replace,
    player,
    inProgress: { recordingStartedAt: recordingStartedAtOf(recording) },
    feed: ({ sink, signal }) => feedGrowing({ open: source.open, sink, isRecording, signal }),
  })
  if (session.status === 'ended') {
    throw new LiveTvError(`ffmpeg failed: ${session.reason?.detail || 'unknown error'}`, { code: 'ffmpeg', status: 500 })
  }
  return { session: view(session), source: source.kind }
}

export const recordingStartedAtOf = (recording) => recording.recordingSince ?? recording.startPadded ?? null

export const feedGrowing = async ({
  open,
  sink,
  isRecording,
  signal,
  pollMs = IN_PROGRESS_POLL_MS,
  sleep = abortableSleep,
}) => {
  let offset = 0
  let stoppedChecks = 0
  while (!signal.aborted) {
    const stream = await open({ start: offset, signal }).catch(() => null)
    const copied = stream ? await copyInto({ stream, sink, signal }) : 0
    offset += copied
    if (signal.aborted) return offset
    if (copied > 0) {
      stoppedChecks = 0
    } else if (!(await isRecording())) {
      stoppedChecks += 1
      if (stoppedChecks >= FINAL_READS) {
        sink.end()
        return offset
      }
    }
    await sleep(pollMs, signal)
  }
  return offset
}

export const recordingChecker = ({
  uuid,
  conn,
  load = loadRecording,
  now = Date.now,
  everyMs = RECORDING_CHECK_MS,
}) => {
  let checkedAt = -Infinity
  let recording = true
  return async () => {
    if (now() - checkedAt < everyMs) return recording
    checkedAt = now()
    const latest = await load({ uuid, conn }).catch(() => undefined)
    if (latest !== undefined) recording = Boolean(latest && /^recording/.test(latest.schedStatus || ''))
    return recording
  }
}

export const skipFirstBytes = (count) => {
  let left = count
  return new Transform({
    transform(chunk, encoding, done) {
      if (left <= 0) return done(null, chunk)
      const kept = chunk.subarray(Math.min(left, chunk.length))
      left -= chunk.length - kept.length
      done(null, kept.length ? kept : undefined)
    },
  })
}

export const growingSourceFor = async ({ recording, folders, conn }) => {
  const local = await localRecordingFile({ recording, folders })
  if (local) return fileSource(local)
  const http = httpSource({ uuid: recording.uuid, conn })
  const first = await http.open({ start: 0 }).catch(() => null)
  if (!first) {
    throw new LiveTvError('Freetvarr cannot read this recording yet.', { code: 'missing', status: 410 })
  }
  first.destroy?.()
  return http
}

const localRecordingFile = async ({ recording, folders }) => {
  if (!recording.filename || !folders.tvhRecordingsPath || !folders.recordingsRoot) return null
  const candidate = localPathFor({
    tvhFilename: recording.filename,
    tvhRecordingsPath: folders.tvhRecordingsPath,
    recordingsRoot: folders.recordingsRoot,
  })
  if (!candidate) return null
  return resolvePlaybackFile({ candidates: [candidate], roots: [folders.recordingsRoot] })
}

const fileSource = (file) => ({
  kind: 'file',
  file,
  open: async ({ start }) => {
    const { size } = await fs.stat(file)
    if (size <= start) return null
    return createReadStream(file, { start, end: size - 1 })
  },
})

const httpSource = ({ uuid, conn }) => ({
  kind: 'tvheadend',
  file: null,
  open: async ({ start, signal }) => {
    const { status, stream } = await openDvrFile({ uuid, start, signal, conn })
    if (status === 206) return stream
    if (status === 200) return start > 0 ? stream.pipe(skipFirstBytes(start)) : stream
    stream?.destroy?.()
    return null
  },
})

const probeHead = async (source) => {
  if (source.file) return probeRecording(source.file)
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-probe-'))
  const head = path.join(dir, 'head.ts')
  try {
    const stream = await source.open({ start: 0 })
    if (!stream) throw new LiveTvError('The recording has not written any data yet.', { code: 'probe', status: 422 })
    await writeHead({ stream, file: head })
    return await probeRecording(head)
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

const writeHead = async ({ stream, file }) => {
  const handle = await fs.open(file, 'w')
  let written = 0
  try {
    for await (const chunk of stream) {
      const part = chunk.subarray(0, PROBE_HEAD_BYTES - written)
      await handle.write(part)
      written += part.length
      if (written >= PROBE_HEAD_BYTES) break
    }
  } finally {
    stream.destroy?.()
    await handle.close()
  }
}

const copyInto = async ({ stream, sink, signal }) => {
  let copied = 0
  const stopReading = () => stream.destroy?.()
  signal.addEventListener('abort', stopReading, { once: true })
  try {
    for await (const chunk of stream) {
      if (signal.aborted || sink.destroyed) break
      copied += chunk.length
      if (!sink.write(chunk)) await once(sink, 'drain', { signal })
    }
  } catch {
    return copied
  } finally {
    signal.removeEventListener('abort', stopReading)
    stream.destroy?.()
  }
  return copied
}

const abortableSleep = (ms, signal) => new Promise((resolve) => {
  const timer = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => {
    clearTimeout(timer)
    resolve()
  }, { once: true })
})

const FINAL_READS = 2
