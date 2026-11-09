import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import sharp from 'sharp'

import { getArtworkRoot } from './artwork.js'

export const FRAME_ORIGIN_PREFIX = 'frame:'
export const FRAME_FRACTIONS = [0.25, 0.4, 0.6]
export const FRAME_WIDTH = 1280
export const BREAK_MARGIN_S = 20
export const AD_PLAN_STATES = { clear: 'clear', marked: 'marked', adFree: 'ad-free', waiting: 'waiting', unknown: 'unknown' }
export const UNKNOWN_AD_PLAN = { state: AD_PLAN_STATES.unknown, breaks: [] }

export const getFrameRoot = () => path.join(getArtworkRoot(), FRAMES_DIR)

export const frameIdOf = (filePath) => createHash('sha256').update(String(filePath)).digest('hex').slice(0, FRAME_ID_LENGTH)

export const frameOriginOf = (filePath) => `${FRAME_ORIGIN_PREFIX}${frameIdOf(filePath)}`

export const isFrameOrigin = (origin) => String(origin ?? '').startsWith(FRAME_ORIGIN_PREFIX)

export const frameVersionOriginOf = ({ id, version = 0 }) => `${FRAME_ORIGIN_PREFIX}${id}${version > 0 ? `${VERSION_SEPARATOR}${version}` : ''}`

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

export const adPlanOf = ({
  adStatus = null,
  breaksJson = null,
  showMode = 'off',
  adRemovalEnabled = false,
  importedAt = null,
  scanning = false,
  channelName = null,
  nowMs = Date.now(),
}) => {
  if (scanning || adStatus === 'scanning') return { state: AD_PLAN_STATES.waiting, breaks: [] }
  if (CLEAR_AD_STATUSES.includes(adStatus)) return { state: AD_PLAN_STATES.clear, breaks: [] }
  if (adStatus === 'detected') {
    const breaks = breaksOf(breaksJson)
    return { state: breaks.length ? AD_PLAN_STATES.marked : AD_PLAN_STATES.clear, breaks }
  }
  const scanExpected = adStatus == null && adRemovalEnabled && Boolean(showMode) && showMode !== 'off'
    && nowMs - utcMsOf(importedAt) < AD_SCAN_WAIT_MS
  if (scanExpected) return { state: AD_PLAN_STATES.waiting, breaks: [] }
  return isAdFreeChannel(channelName) ? { state: AD_PLAN_STATES.adFree, breaks: [] } : UNKNOWN_AD_PLAN
}

export const isAdFreeChannel = (channelName) => {
  const words = String(channelName ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  return AD_FREE_BRAND.test(words[0] ?? '')
}

export const framePreferenceOrderOf = (files) => files
  .map((file, index) => ({ file, index, rank: AD_PLAN_RANKS[file.adPlan?.state] ?? AD_PLAN_RANKS[AD_PLAN_STATES.unknown] }))
  .sort((a, b) => a.rank - b.rank || a.index - b.index)
  .map(({ file }) => file)

export const hasAdData = (plan) => plan?.state === AD_PLAN_STATES.clear || plan?.state === AD_PLAN_STATES.marked

export const programmeWindowOf = ({ fileDurationS = null, programmeDurationS = null }) => {
  const total = positiveOrNull(fileDurationS) ?? positiveOrNull(programmeDurationS)
  if (!total) return null
  const programme = Math.min(positiveOrNull(programmeDurationS) ?? total, total)
  const lead = (total - programme) / 2
  return { start: lead, end: total - lead }
}

export const programmeSegmentsOf = ({ window, breaks = [] }) => {
  const segments = []
  let cursor = window.start
  for (const { start, end } of mergedBreaksOf(breaks)) {
    if (end <= cursor) continue
    if (start >= window.end) break
    if (start > cursor) segments.push({ start: cursor, end: start })
    cursor = Math.max(cursor, end)
  }
  if (cursor < window.end) segments.push({ start: cursor, end: window.end })
  return segments
}

export const adAwareOffsetsOf = ({ fileDurationS = null, programmeDurationS = null, breaks = [], marginS = BREAK_MARGIN_S }) => {
  const window = programmeWindowOf({ fileDurationS, programmeDurationS })
  if (!window) return []
  const safe = programmeSegmentsOf({ window, breaks })
    .map(({ start, end }) => ({ start: start + marginS, end: end - marginS }))
    .filter(({ start, end }) => end > start)
    .sort((a, b) => (b.end - b.start) - (a.end - a.start))
  if (!safe.length) return []
  const [longest, ...others] = safe
  const picks = [pointOf(longest, 0.5), ...others.slice(0, FRAME_TRIES - 1).map((segment) => pointOf(segment, 0.5))]
  for (const fraction of SPARE_FRACTIONS) if (picks.length < FRAME_TRIES) picks.push(pointOf(longest, fraction))
  return [...new Set(picks)]
}

export const isNearBreak = ({ offsetS, breaks = [], marginS = BREAK_MARGIN_S }) =>
  breaks.some(({ start, end }) => offsetS >= start - marginS && offsetS <= end + marginS)

export const frameDistanceOf = (a, b) => {
  if (!a?.length || a.length !== b?.length) return Infinity
  let sum = 0
  for (let at = 0; at < a.length; at++) sum += Math.abs(a[at] - b[at])
  return sum / a.length / 255
}

export const frameFingerprintOf = (body) => sharp(body)
  .resize(FINGERPRINT_WIDTH, FINGERPRINT_HEIGHT, { fit: 'fill' })
  .greyscale()
  .raw()
  .toBuffer()

export const distinctFramesOf = (candidates) => candidates.filter((candidate) => !candidates.some((other) =>
  other !== candidate && frameDistanceOf(other.print, candidate.print) < DUPLICATE_DISTANCE))

export const steadyFrameOf = (candidates) => candidates.find((candidate) => candidate.drift <= SCENE_DRIFT_MAX) ?? null

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
  fingerprintOf = frameFingerprintOf,
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
  const awaitingAds = new Set()
  let tail = Promise.resolve()

  const frameFor = async ({ filePath, programmeDurationS = null, expectedBytes = null, adPlan = UNKNOWN_AD_PLAN, onReady = () => {} }) => {
    if (!filePath) return NO_FRAME
    const id = frameIdOf(filePath)
    if (await exists(framePathOf(id))) return { sources: [frameVersionOriginOf({ id, version: (await readMeta(id))?.version ?? 0 })], pending: false }
    if (await exists(missPathOf(id))) return NO_FRAME
    if (queued.has(id)) return PENDING_FRAME
    if (adPlan.state === AD_PLAN_STATES.unknown) return NO_FRAME
    if (adPlan.state === AD_PLAN_STATES.waiting) {
      awaitingAds.add(id)
      return PENDING_FRAME
    }
    if (now() - (failedAt.get(id) ?? -Infinity) < failureRetryMs) return NO_FRAME
    if (!(await hasFfmpeg())) return NO_FRAME
    if (!(await canRead(filePath))) return NO_FRAME
    if (queued.size >= maxQueued) return PENDING_FRAME
    const job = enqueue(() => grabFrame({ id, filePath, programmeDurationS, expectedBytes, adPlan }))
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

  const reconsider = async ({ filePath, breaks = [] }) => {
    if (!filePath) return { stale: false, awaited: false }
    const id = frameIdOf(filePath)
    const awaited = awaitingAds.delete(id)
    failedAt.delete(id)
    await fs.rm(missPathOf(id), { force: true })
    if (!(await exists(framePathOf(id)))) return { stale: false, awaited }
    const meta = await readMeta(id)
    if (meta?.adAware) return { stale: false, awaited }
    if (meta?.offsetS != null && !isNearBreak({ offsetS: meta.offsetS, breaks })) {
      await writeMeta(id, { ...meta, adAware: true })
      return { stale: false, awaited }
    }
    await fs.rm(framePathOf(id), { force: true })
    await writeMeta(id, { offsetS: null, adAware: false, version: meta?.version ?? 0, stale: true })
    return { stale: true, awaited }
  }

  const enqueue = (task) => {
    const run = tail.then(task, task)
    tail = run.catch(() => {})
    return run
  }

  const grabFrame = async ({ id, filePath, programmeDurationS, expectedBytes, adPlan }) => {
    const fileDurationS = await probe(filePath).catch(() => null)
    const aware = hasAdData(adPlan)
    const picked = aware
      ? await firstUsableOf({ filePath, offsets: adAwareOffsetsOf({ fileDurationS, programmeDurationS, breaks: adPlan.breaks }) })
      : await steadyUsableOf({ filePath, offsets: frameOffsetsOf({ fileDurationS, programmeDurationS }) })
    if (picked.frame) {
      await saveFrame({ id, frame: picked.frame, adAware: aware })
      return true
    }
    if (picked.anyDecoded && !(await isShortOf({ filePath, expectedBytes }))) await writeFile({ target: missPathOf(id), body: Buffer.alloc(0) })
    else failedAt.set(id, now())
    return false
  }

  const firstUsableOf = async ({ filePath, offsets }) => {
    let anyDecoded = false
    for (const offsetS of offsets) {
      const decoded = await decodedFrameOf({ filePath, offsetS })
      if (!decoded) continue
      anyDecoded = true
      if (decoded.usable) return { frame: decoded, anyDecoded }
    }
    return { frame: null, anyDecoded: anyDecoded || offsets.length === 0 }
  }

  const steadyUsableOf = async ({ filePath, offsets }) => {
    let anyDecoded = false
    const candidates = []
    for (const offsetS of offsets) {
      const decoded = await decodedFrameOf({ filePath, offsetS })
      if (!decoded) continue
      anyDecoded = true
      if (!decoded.usable) continue
      const print = await fingerprintOf(decoded.body).catch(() => null)
      if (print) candidates.push({ ...decoded, print })
    }
    const distinct = distinctFramesOf(candidates)
    for (const candidate of distinct) candidate.drift = await sceneDriftOf({ filePath, candidate })
    return { frame: steadyFrameOf(distinct), anyDecoded }
  }

  const decodedFrameOf = async ({ filePath, offsetS }) => {
    const body = await grab(frameArgsOf({ filePath, offsetS })).catch(() => null)
    if (!body?.length) return null
    const levels = await levelsOf(body).catch(() => null)
    if (!levels) return null
    return { offsetS, body, usable: isUsableFrame(levels) }
  }

  const sceneDriftOf = async ({ filePath, candidate }) => {
    const body = await grab(frameArgsOf({ filePath, offsetS: candidate.offsetS + SCENE_STEP_S })).catch(() => null)
    if (!body?.length) return Infinity
    const print = await fingerprintOf(body).catch(() => null)
    return frameDistanceOf(candidate.print, print)
  }

  const saveFrame = async ({ id, frame, adAware }) => {
    const before = await readMeta(id)
    const version = before ? (before.version ?? 0) + 1 : 0
    await writeFile({ target: framePathOf(id), body: frame.body })
    await writeMeta(id, { offsetS: frame.offsetS, adAware, version })
  }

  const readMeta = async (id) => {
    const text = await fs.readFile(metaPathOf(id), 'utf8').catch(() => null)
    if (!text) return null
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  const writeMeta = (id, meta) => writeFile({ target: metaPathOf(id), body: JSON.stringify(meta) })

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
    const id = String(origin ?? '').slice(FRAME_ORIGIN_PREFIX.length).split(VERSION_SEPARATOR)[0]
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
    return { removed: removedOrigins.length, removedOrigins }
  }

  const idle = () => Promise.all([...queued.values()])

  const framePathOf = (id) => path.join(root, `${id}${FRAME_EXTENSION}`)

  const missPathOf = (id) => path.join(root, `${id}${MISS_EXTENSION}`)

  const metaPathOf = (id) => path.join(root, `${id}${META_EXTENSION}`)

  return { frameFor, reconsider, read, prune, idle }
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

const pointOf = ({ start, end }, fraction) => Math.round(start + (end - start) * fraction)

const breaksOf = (json) => {
  try {
    const parsed = JSON.parse(json ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(({ start, end } = {}) => Number.isFinite(start) && end > start) : []
  } catch {
    return []
  }
}

const mergedBreaksOf = (breaks) => [...breaks]
  .sort((a, b) => a.start - b.start)
  .reduce((merged, { start, end }) => {
    const last = merged[merged.length - 1]
    if (last && start <= last.end) last.end = Math.max(last.end, end)
    else merged.push({ start, end })
    return merged
  }, [])

const utcMsOf = (value) => {
  if (value == null) return -Infinity
  const text = String(value)
  const ms = Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text) ? `${text.replace(' ', 'T')}Z` : text)
  return Number.isFinite(ms) ? ms : -Infinity
}

const positiveOrNull = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null)

let ffmpegCheck = null

const FRAMES_DIR = 'frames'
const FRAME_ID_LENGTH = 24
const FRAME_ID = /^[0-9a-f]{24}$/
const FRAME_EXTENSION = '.jpg'
const MISS_EXTENSION = '.none'
const META_EXTENSION = '.json'
const VERSION_SEPARATOR = '-v'
const AD_PLAN_RANKS = { clear: 0, marked: 0, 'ad-free': 1, waiting: 2, unknown: 3 }
const AD_FREE_BRAND = /^abc(tv|news|kids|family|entertains|me|[0-9]+)?$/
const CLEAR_AD_STATUSES = ['cut', 'no_breaks']
const AD_SCAN_WAIT_MS = 8 * 60 * 60 * 1000
const FRAME_TRIES = 3
const SPARE_FRACTIONS = [0.3, 0.7]
const SCENE_STEP_S = 2
const SCENE_DRIFT_MAX = 0.1
const DUPLICATE_DISTANCE = 0.03
const FINGERPRINT_WIDTH = 32
const FINGERPRINT_HEIGHT = 18
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
