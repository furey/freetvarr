import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import sharp from 'sharp'

import { getArtworkRoot } from './artwork.js'

export const FRAME_ORIGIN_PREFIX = 'frame:'
export const FRAME_FRACTIONS = [0.25, 0.4, 0.6]
export const FRAME_WIDTH = 1280

export const getFrameRoot = () => path.join(getArtworkRoot(), FRAMES_DIR)

export const frameIdOf = (filePath) => createHash('sha256').update(String(filePath)).digest('hex').slice(0, FRAME_ID_LENGTH)

export const frameOriginOf = (filePath) => `${FRAME_ORIGIN_PREFIX}${frameIdOf(filePath)}`

export const isFrameOrigin = (origin) => String(origin ?? '').startsWith(FRAME_ORIGIN_PREFIX)

export const frameArgsOf = ({ filePath, offsetS, maxWidth = FRAME_WIDTH }) => [
  '-hide_banner', '-loglevel', 'error', '-nostdin',
  '-ss', String(offsetS),
  '-i', filePath,
  '-map', '0:v:0', '-frames:v', '1',
  '-vf', `yadif=deint=interlaced,scale='trunc(ih*dar/2)*2':ih,setsar=1,scale='min(${maxWidth},iw)':-2`,
  '-q:v', '3', '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1',
]

export const niceCommandOf = (args) => ({ command: 'nice', args: ['-n', String(NICE_LEVEL), 'ffmpeg', ...args] })

export const frameOffsetsOf = ({ fileDurationS = null, programmeDurationS = null }) => {
  const total = positiveOrNull(fileDurationS) ?? positiveOrNull(programmeDurationS)
  if (!total) return FALLBACK_OFFSETS_S
  const programme = Math.min(positiveOrNull(programmeDurationS) ?? total, total)
  const lead = (total - programme) / 2
  return FRAME_FRACTIONS.map((fraction) => Math.round(lead + programme * fraction))
}

export const isUsableFrame = ({ brightness, contrast }) =>
  brightness >= MIN_BRIGHTNESS && brightness <= MAX_BRIGHTNESS && contrast >= MIN_CONTRAST

export const frameLevelsOf = async (body) => {
  const { channels } = await sharp(body).stats()
  const [red, green, blue = green] = channels
  return {
    brightness: 0.299 * red.mean + 0.587 * green.mean + 0.114 * blue.mean,
    contrast: (red.stdev + green.stdev + blue.stdev) / 3,
  }
}

export const createFrameGrabs = ({
  root = getFrameRoot(),
  grab = runFfmpegFrame,
  probe = probeDurationS,
  levelsOf = frameLevelsOf,
  hasFfmpeg = ffmpegAvailable,
  canRead = isReadableFile,
  onGrabbed = () => {},
  sizeOf = fileSizeOf,
  now = Date.now,
  failureRetryMs = FAILURE_RETRY_MS,
  maxQueued = MAX_QUEUED,
} = {}) => {
  const queued = new Map()
  const failedAt = new Map()
  let tail = Promise.resolve()

  const frameFor = async ({ filePath, programmeDurationS = null, expectedBytes = null, onReady = () => {} }) => {
    if (!filePath) return NO_FRAME
    const id = frameIdOf(filePath)
    if (await exists(framePathOf(id))) return { sources: [`${FRAME_ORIGIN_PREFIX}${id}`], pending: false }
    if (await exists(missPathOf(id))) return NO_FRAME
    if (queued.has(id)) return PENDING_FRAME
    if (now() - (failedAt.get(id) ?? -Infinity) < failureRetryMs) return NO_FRAME
    if (!(await hasFfmpeg())) return NO_FRAME
    if (!(await canRead(filePath))) return NO_FRAME
    if (queued.size >= maxQueued) return PENDING_FRAME
    const job = enqueue(() => grabFrame({ id, filePath, programmeDurationS, expectedBytes }))
      .then((saved) => {
        if (saved) {
          onGrabbed({ filePath })
          onReady()
        }
        return saved
      })
      .catch(() => false)
      .finally(() => queued.delete(id))
    queued.set(id, job)
    return PENDING_FRAME
  }

  const enqueue = (task) => {
    const run = tail.then(task, task)
    tail = run.catch(() => {})
    return run
  }

  const grabFrame = async ({ id, filePath, programmeDurationS, expectedBytes }) => {
    const fileDurationS = await probe(filePath).catch(() => null)
    let anyDecoded = false
    for (const offsetS of frameOffsetsOf({ fileDurationS, programmeDurationS })) {
      const body = await grab(frameArgsOf({ filePath, offsetS })).catch(() => null)
      if (!body?.length) continue
      const levels = await levelsOf(body).catch(() => null)
      if (!levels) continue
      anyDecoded = true
      if (!isUsableFrame(levels)) continue
      await writeFile({ target: framePathOf(id), body })
      return true
    }
    if (anyDecoded && !(await isShortOf({ filePath, expectedBytes }))) await writeFile({ target: missPathOf(id), body: Buffer.alloc(0) })
    else failedAt.set(id, now())
    return false
  }

  const isShortOf = async ({ filePath, expectedBytes }) => {
    if (!(Number(expectedBytes) > 0)) return false
    const size = await sizeOf(filePath).catch(() => null)
    return size == null || size < Number(expectedBytes)
  }

  const writeFile = async ({ target, body }) => {
    await fs.mkdir(root, { recursive: true })
    const partial = `${target}.part`
    await fs.writeFile(partial, body)
    await fs.rename(partial, target)
  }

  const read = async (origin) => {
    const id = String(origin ?? '').slice(FRAME_ORIGIN_PREFIX.length)
    if (!isFrameOrigin(origin) || !FRAME_ID.test(id)) return null
    const body = await fs.readFile(framePathOf(id)).catch(() => null)
    return body ? { body, contentType: 'image/jpeg' } : null
  }

  const prune = async ({ keepPaths }) => {
    const keep = new Set(keepPaths.filter(Boolean).map(frameIdOf))
    const names = await fs.readdir(root).catch(() => [])
    const removed = names.filter((name) => !keep.has(name.split('.')[0]))
    await Promise.all(removed.map((name) => fs.rm(path.join(root, name), { force: true })))
    const removedOrigins = [...new Set(removed.map((name) => `${FRAME_ORIGIN_PREFIX}${name.split('.')[0]}`))]
    return { removed: removed.length, removedOrigins }
  }

  const idle = () => Promise.all([...queued.values()])

  const framePathOf = (id) => path.join(root, `${id}${FRAME_EXTENSION}`)

  const missPathOf = (id) => path.join(root, `${id}${MISS_EXTENSION}`)

  return { frameFor, read, prune, idle }
}

export const runFfmpegFrame = (args, { timeoutMs = FFMPEG_TIMEOUT_MS, spawnProcess = spawn } = {}) => new Promise((resolve, reject) => {
  const { command, args: niceArgs } = niceCommandOf(args)
  const child = spawnProcess(command, niceArgs, { stdio: ['ignore', 'pipe', 'ignore'] })
  const chunks = []
  let size = 0
  const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
  timer.unref?.()
  child.stdout.on('data', (chunk) => {
    size += chunk.length
    if (size > MAX_FRAME_BYTES) return child.kill('SIGKILL')
    chunks.push(chunk)
  })
  child.on('error', (err) => {
    clearTimeout(timer)
    reject(err)
  })
  child.on('close', (code) => {
    clearTimeout(timer)
    if (code === 0 && size <= MAX_FRAME_BYTES) return resolve(Buffer.concat(chunks))
    reject(new Error(`ffmpeg exited ${code}`))
  })
})

export const ffmpegAvailable = () => {
  ffmpegCheck ??= new Promise((resolve) => {
    const child = spawn('ffmpeg', ['-version'], { stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
  })
  return ffmpegCheck
}

const probeDurationS = (filePath) => new Promise((resolve, reject) => {
  const child = spawn('nice', ['-n', String(NICE_LEVEL), 'ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath], {
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const chunks = []
  const timer = setTimeout(() => child.kill('SIGKILL'), PROBE_TIMEOUT_MS)
  timer.unref?.()
  child.stdout.on('data', (chunk) => chunks.push(chunk))
  child.on('error', (err) => {
    clearTimeout(timer)
    reject(err)
  })
  child.on('close', () => {
    clearTimeout(timer)
    resolve(positiveOrNull(Number(Buffer.concat(chunks).toString().trim())))
  })
})

const fileSizeOf = async (filePath) => (await fs.stat(filePath)).size

const isReadableFile = (filePath) => fs.access(filePath, fs.constants.R_OK).then(() => true, () => false)

const exists = (target) => fs.access(target).then(() => true, () => false)

const positiveOrNull = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null)

let ffmpegCheck = null

const FRAMES_DIR = 'frames'
const FRAME_ID_LENGTH = 24
const FRAME_ID = /^[0-9a-f]{24}$/
const FRAME_EXTENSION = '.jpg'
const MISS_EXTENSION = '.none'
const NICE_LEVEL = 19
const FALLBACK_OFFSETS_S = [120, 300, 600]
const MIN_BRIGHTNESS = 24
const MAX_BRIGHTNESS = 232
const MIN_CONTRAST = 18
const FFMPEG_TIMEOUT_MS = 30 * 1000
const PROBE_TIMEOUT_MS = 15 * 1000
const FAILURE_RETRY_MS = 60 * 60 * 1000
const MAX_QUEUED = 200
const MAX_FRAME_BYTES = 8 * 1024 * 1024
const NO_FRAME = { sources: [], pending: false }
const PENDING_FRAME = { sources: [], pending: true }
