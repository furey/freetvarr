import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { MIN_HEADROOM_MB } from './for-you-capability.js'
import { focusKeyOf, isFocusImagePath, requestedWidthOf } from './web/image-focus.js'

export const FOCUS_VERSION = 2
export const FOCUS_SETTING = 'face_focus_enabled'

export const faceFocusEnabledFrom = (stored) => stored !== 'false'

export const facesFromScores = ({ scores, boxes, threshold = FACE_THRESHOLD }) => {
  const found = []
  for (let index = 0; index < scores.length / 2; index += 1) {
    const score = scores[index * 2 + 1]
    if (score < threshold) continue
    const [x0, y0, x1, y1] = boxes.slice(index * 4, index * 4 + 4)
    found.push({ score, box: [clamp01(x0), clamp01(y0), clamp01(x1), clamp01(y1)] })
  }
  return suppressOverlaps(found).filter((face) => widthOf(face.box) >= MIN_FACE_WIDTH)
}

export const suppressOverlaps = (faces, maxOverlap = MAX_OVERLAP) => {
  const kept = []
  for (const face of [...faces].sort((a, b) => b.score - a.score)) {
    if (kept.every((other) => overlapOf(face.box, other.box) <= maxOverlap)) kept.push(face)
  }
  return kept
}

export const focusOf = ({ faces = [], attention = null, band = null } = {}) => {
  const focus = pictureFocusOf({ faces, attention })
  if (!band || focus.method === 'centre') return focus
  const [top, bottom] = focus.box ? [focus.box[1], focus.box[3]] : [focus.y, focus.y]
  return { ...focus, x: CENTRE, box: [band[0], top, band[1], bottom] }
}

const pictureFocusOf = ({ faces, attention }) => {
  const people = mainFacesOf(faces)
  if (people.length) {
    const [x0, y0, x1, y1] = people[0].box
    return {
      x: rounded((x0 + x1) / 2),
      y: rounded(y0 + (y1 - y0) * EYE_LINE),
      box: keepBoxOf(people),
      method: 'faces',
    }
  }
  if (attention) return { x: rounded(clamp01(attention.x)), y: rounded(clamp01(attention.y)), box: null, method: 'attention' }
  return { x: 0.5, y: 0.5, box: null, method: 'centre' }
}

export const BAND_SAMPLE = { width: 192, height: 108 }

export const columnDetailOf = ({ pixels, width, height }) => Array.from({ length: width }, (_, x) => {
  let total = 0
  for (let y = 0; y < height; y += 1) {
    const at = y * width + x
    if (x + 1 < width) total += Math.abs(pixels[at + 1] - pixels[at])
    if (y + 1 < height) total += Math.abs(pixels[at + width] - pixels[at])
  }
  return total / height
})

export const pillarBandOf = (detail) => {
  const isSharp = (value) => value > SHARP_COLUMN_DETAIL
  const first = detail.findIndex(isSharp)
  if (first < 0) return null
  const last = detail.findLastIndex(isSharp)
  const start = first / detail.length
  const end = (last + 1) / detail.length
  const isCentred = Math.abs(start - (1 - end)) <= MAX_PILLAR_SKEW
  const hasPillars = Math.min(start, 1 - end) >= MIN_PILLAR_SHARE
  const isPortraitBand = end - start <= MAX_BAND_SHARE
  if (!isCentred || !hasPillars || !isPortraitBand) return null
  const halfWidth = Math.max(CENTRE - start, end - CENTRE)
  return [rounded(CENTRE - halfWidth), rounded(CENTRE + halfWidth)]
}

export const createImageFocus = ({
  loadRows,
  saveRow,
  isEnabled,
  readHeadroomMb,
  detect,
  now = Date.now,
  delayMs = DRAIN_DELAY_MS,
  pauseMs = BATCH_PAUSE_MS,
  retryMs = LOW_MEMORY_RETRY_MS,
  failureBackoffMs = FAILURE_BACKOFF_MS,
  batchSize = BATCH_SIZE,
  maxPending = MAX_PENDING,
}) => {
  const rows = new Map()
  const pending = new Map()
  let loading = null
  let timer = null
  let draining = null
  let pausedUntil = 0

  const prepare = () => {
    loading ??= Promise.resolve()
      .then(loadRows)
      .then((list) => list.forEach((row) => rows.set(row.urlKey, row)))
      .catch(() => {})
    return loading
  }

  const isCurrent = ({ urlKey, width, sourceHash }) => {
    const row = rows.get(urlKey)
    if (!row || row.version !== FOCUS_VERSION) return false
    return row.width > width || (row.width === width && row.sourceHash === sourceHash)
  }

  const noteServed = ({ url, body }) => {
    const urlKey = focusKeyOf(url)
    if (!urlKey || !body?.length) return false
    const width = requestedWidthOf(url) ?? ORIGINAL_WIDTH
    const row = rows.get(urlKey)
    if (row?.version === FOCUS_VERSION && row.width > width) return false
    if ((pending.get(urlKey)?.width ?? 0) >= width) return false
    const job = { urlKey, width, body, sourceHash: hashOf(body) }
    if (isCurrent(job)) return false
    pending.delete(urlKey)
    pending.set(urlKey, job)
    while (pending.size > maxPending) pending.delete(pending.keys().next().value)
    schedule(delayMs)
    return true
  }

  const schedule = (ms) => {
    if (timer || draining) return
    timer = setTimeout(() => {
      timer = null
      draining = drain().finally(() => {
        draining = null
        if (pending.size) schedule(Math.max(pauseMs, pausedUntil - now()))
      })
    }, ms)
    timer.unref?.()
  }

  const drain = async () => {
    await prepare()
    if (now() < pausedUntil) return
    if (!(await Promise.resolve().then(isEnabled).catch(() => false))) return pending.clear()
    const headroomMb = await Promise.resolve().then(readHeadroomMb).catch(() => null)
    if (Number.isFinite(headroomMb) && headroomMb < MIN_HEADROOM_MB) {
      pausedUntil = now() + retryMs
      return
    }
    const jobs = takeBatch()
    if (!jobs.length) return
    const results = await Promise.resolve().then(() => detect(jobs)).catch(() => null)
    if (!results) {
      pausedUntil = now() + failureBackoffMs
      return
    }
    for (const job of jobs.filter((candidate) => results.has(candidate.urlKey))) {
      await remember({ job, result: results.get(job.urlKey) })
    }
  }

  const takeBatch = () => {
    const jobs = []
    for (const job of pending.values()) {
      if (jobs.length >= batchSize) break
      pending.delete(job.urlKey)
      if (!isCurrent(job)) jobs.push(job)
    }
    return jobs
  }

  const remember = async ({ job, result }) => {
    const focus = focusOf(result || {})
    const row = { urlKey: job.urlKey, sourceHash: job.sourceHash, width: job.width, ...focus, version: FOCUS_VERSION, updatedAt: now() }
    rows.set(job.urlKey, row)
    await Promise.resolve().then(() => saveRow(row)).catch(() => {})
  }

  const lookup = async (keys) => {
    const enabled = await Promise.resolve().then(isEnabled).catch(() => false)
    if (!enabled) return { enabled: false, items: {} }
    await prepare()
    const items = {}
    for (const key of keys) {
      const row = rows.get(key)
      if (row?.version === FOCUS_VERSION && row.method !== 'centre') items[key] = { x: row.x, y: row.y, box: row.box }
    }
    return { enabled: true, items }
  }

  const tap = (req, res, next) => {
    if (req.method !== 'GET' || !isFocusImagePath(req.path)) return next()
    const send = res.send.bind(res)
    res.send = (body) => {
      if (isServedPicture({ res, body })) {
        try {
          noteServed({ url: req.originalUrl, body })
        } catch {}
      }
      return send(body)
    }
    next()
  }

  const settle = () => draining ?? Promise.resolve()

  const stats = () => ({ rows: rows.size, pending: pending.size })

  return { prepare, noteServed, lookup, tap, settle, stats }
}

export const runFocusWorker = ({ jobs, modelPath = MODEL_PATH, timeoutMs = WORKER_TIMEOUT_MS }) => new Promise((resolve, reject) => {
  const results = new Map()
  let stdout = ''
  let child
  try {
    child = spawn(process.execPath, [WORKER_PATH], { stdio: ['pipe', 'pipe', 'ignore'], env: { ...process.env, OMP_NUM_THREADS: '1' } })
  } catch (err) {
    reject(err)
    return
  }
  try {
    os.setPriority(child.pid, LOW_PRIORITY)
  } catch {}
  const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
  child.stdout.on('data', (chunk) => {
    stdout += chunk
    const lines = stdout.split('\n')
    stdout = lines.pop()
    lines.map(parseJson).filter((message) => message?.type === 'focus').forEach((message) => {
      results.set(message.id, { faces: message.faces || [], attention: message.attention || null, band: message.band || null })
    })
  })
  child.stdin.on('error', () => {})
  child.on('error', (err) => {
    clearTimeout(timer)
    reject(err)
  })
  child.on('close', (code) => {
    clearTimeout(timer)
    if (code !== 0 && !results.size) return reject(new Error(`focus worker exited with ${code}`))
    resolve(results)
  })
  child.stdin.end(JSON.stringify({
    modelPath,
    images: jobs.map((job) => ({ id: job.urlKey, body: job.body.toString('base64') })),
  }))
})

const isServedPicture = ({ res, body }) => res.statusCode === 200
  && Buffer.isBuffer(body)
  && PICTURE_TYPES.test(String(res.get('Content-Type') || ''))

const mainFacesOf = (faces) => {
  const sorted = [...faces].sort((a, b) => areaOf(b.box) - areaOf(a.box))
  const largest = sorted.length ? areaOf(sorted[0].box) : 0
  return sorted.filter((face) => areaOf(face.box) >= largest * GROUP_MIN_AREA_SHARE).slice(0, MAX_GROUP_FACES)
}

const keepBoxOf = (faces) => {
  const padded = faces.map(({ box: [x0, y0, x1, y1] }) => {
    const width = x1 - x0
    const height = y1 - y0
    return [x0 - width * PAD_SIDE, y0 - height * PAD_TOP, x1 + width * PAD_SIDE, y1 + height * PAD_BOTTOM]
  })
  return [
    Math.min(...padded.map((box) => box[0])),
    Math.min(...padded.map((box) => box[1])),
    Math.max(...padded.map((box) => box[2])),
    Math.max(...padded.map((box) => box[3])),
  ].map((value) => rounded(clamp01(value)))
}

const overlapOf = (a, b) => {
  const width = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]))
  const height = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]))
  const shared = width * height
  const union = areaOf(a) + areaOf(b) - shared
  return union > 0 ? shared / union : 0
}

const areaOf = (box) => widthOf(box) * Math.max(0, box[3] - box[1])

const widthOf = (box) => Math.max(0, box[2] - box[0])

const hashOf = (body) => crypto.createHash('sha1').update(body).digest('hex')

const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0))

const rounded = (value) => Math.round(value * 1000) / 1000

const parseJson = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const SRC_DIR = path.dirname(fileURLToPath(import.meta.url))
const MODEL_PATH = path.join(SRC_DIR, '..', 'assets', 'models', 'ultraface-rfb-320.onnx')
const WORKER_PATH = path.join(SRC_DIR, 'image-focus-worker.js')
const PICTURE_TYPES = /^image\/(webp|jpeg|png)/
const FACE_THRESHOLD = 0.7
const MAX_OVERLAP = 0.3
const MIN_FACE_WIDTH = 0.02
const GROUP_MIN_AREA_SHARE = 0.25
const MAX_GROUP_FACES = 8
const EYE_LINE = 0.4
const CENTRE = 0.5
const PAD_SIDE = 0.15
const PAD_TOP = 0.3
const PAD_BOTTOM = 0.35
const ORIGINAL_WIDTH = 1000
const LOW_PRIORITY = 19
const BATCH_SIZE = 16
const MAX_PENDING = 2000
const DRAIN_DELAY_MS = 5 * 1000
const BATCH_PAUSE_MS = 2 * 1000
const LOW_MEMORY_RETRY_MS = 10 * 60 * 1000
const FAILURE_BACKOFF_MS = 30 * 60 * 1000
const WORKER_TIMEOUT_MS = 3 * 60 * 1000
const SHARP_COLUMN_DETAIL = 6
const MAX_PILLAR_SKEW = 0.04
const MIN_PILLAR_SHARE = 0.12
const MAX_BAND_SHARE = 0.76
