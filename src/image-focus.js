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

export const warmPlanOf = ({ keys, isKnown, isPending, wasTried, limit = MAX_WARM_KEYS }) => {
  const promote = []
  const render = []
  for (const key of new Set(keys)) {
    if (!key || isKnown(key)) continue
    if (isPending(key)) promote.push(key)
    else if (!wasTried(key) && render.length < limit) render.push(key)
  }
  return { promote, render }
}

export const warmUrlOf = (key, width = WARM_WIDTH) => `${key}${key.includes('?') ? '&' : '?'}w=${width}`

export const widthHashesOf = (row) => row?.hashes ?? (row ? { [row.width]: row.sourceHash } : {})

export const servedVerdictOf = ({ row, width, sourceHash, pendingWidth = 0, version = FOCUS_VERSION }) => {
  if (pendingWidth >= width) return 'skip'
  if (!row) return 'detect'
  const known = widthHashesOf(row)[width]
  if (known && known !== sourceHash) return 'detect'
  if (row.version !== version) return row.width > width ? 'skip' : 'detect'
  return known ? 'skip' : 'note-hash'
}

export const staleRowsOf = ({ rows, version = FOCUS_VERSION }) => [...rows]
  .filter((row) => row.version !== version)
  .sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0))

export const refreshUrlOf = (row) => (row.width >= ORIGINAL_WIDTH ? row.urlKey : warmUrlOf(row.urlKey, row.width))

export const createImageFocus = ({
  loadRows,
  saveRow,
  isEnabled,
  readHeadroomMb,
  detect,
  render = async () => null,
  now = Date.now,
  delayMs = DRAIN_DELAY_MS,
  urgentDelayMs = URGENT_DELAY_MS,
  warmStartMs = WARM_START_MS,
  warmRetryMs = WARM_RETRY_MS,
  refreshGapMs = REFRESH_GAP_MS,
  refreshStartMs = REFRESH_START_MS,
  pauseMs = BATCH_PAUSE_MS,
  retryMs = LOW_MEMORY_RETRY_MS,
  failureBackoffMs = FAILURE_BACKOFF_MS,
  batchSize = BATCH_SIZE,
  maxPending = MAX_PENDING,
}) => {
  const rows = new Map()
  const pending = new Map()
  const tried = new Map()
  const unavailable = new Map()
  const settledListeners = new Set()
  const warmQueue = []
  let loading = null
  let timer = null
  let timerDueAt = 0
  let draining = null
  let warming = null
  let warmed = null
  let refreshing = null
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
    return row?.version === FOCUS_VERSION && widthHashesOf(row)[width] === sourceHash
  }

  const noteServed = ({ url, body }) => {
    const urlKey = focusKeyOf(url)
    if (!urlKey || !body?.length) return false
    const width = requestedWidthOf(url) ?? ORIGINAL_WIDTH
    const row = rows.get(urlKey)
    const sourceHash = hashOf(body)
    const verdict = servedVerdictOf({ row, width, sourceHash, pendingWidth: pending.get(urlKey)?.width ?? 0 })
    if (verdict === 'note-hash') rememberHash({ row, width, sourceHash })
    if (verdict !== 'detect') return false
    const job = { urlKey, width, body, sourceHash }
    pending.delete(urlKey)
    pending.set(urlKey, job)
    while (pending.size > maxPending) pending.delete(pending.keys().next().value)
    schedule(delayMs)
    return true
  }

  const schedule = (ms) => {
    if (timer || draining) return
    timerDueAt = now() + ms
    timer = setTimeout(() => {
      timer = null
      draining = drain().finally(() => {
        draining = null
        if (pending.size) schedule(Math.max(pauseMs, pausedUntil - now()))
      })
    }, ms)
    timer.unref?.()
  }

  const scheduleWithin = (ms) => {
    if (draining) return
    if (timer && timerDueAt <= now() + ms) return
    clearTimeout(timer)
    timer = null
    schedule(ms)
  }

  const promote = (keys) => {
    const first = keys.filter((key) => pending.has(key))
    if (!first.length) return false
    const rest = [...pending.entries()].filter(([key]) => !first.includes(key))
    const promoted = first.map((key) => [key, pending.get(key)])
    pending.clear()
    for (const [key, job] of [...promoted, ...rest]) pending.set(key, job)
    scheduleWithin(urgentDelayMs)
    return true
  }

  const hasCurrentRow = (key) => rows.get(key)?.version === FOCUS_VERSION

  const hasRow = (key) => rows.has(key)

  const rememberHash = ({ row, width, sourceHash }) => {
    const updated = { ...row, hashes: { ...widthHashesOf(row), [width]: sourceHash } }
    rows.set(row.urlKey, updated)
    Promise.resolve().then(() => saveRow(updated)).catch(() => {})
  }

  const refreshStale = async () => {
    await wait(refreshStartMs)
    await prepare()
    for (const row of staleRowsOf({ rows: rows.values() })) {
      await wait(refreshGapMs)
      while (pending.size >= batchSize || warmQueue.length || draining) await wait(refreshGapMs)
      if (!(await Promise.resolve().then(isEnabled).catch(() => false))) return
      if (rows.get(row.urlKey)?.version === FOCUS_VERSION) continue
      const url = refreshUrlOf(row)
      const body = await Promise.resolve().then(() => render(url)).catch(() => null)
      if (body?.length) noteServed({ url, body })
    }
  }

  const startRefresh = () => {
    refreshing ??= refreshStale().catch(() => {})
    return refreshing
  }

  const wasTried = (key) => {
    const at = tried.get(key)
    if (at === undefined) return false
    if (now() - at < warmRetryMs) return true
    tried.delete(key)
    return false
  }

  const markTried = (key) => {
    tried.delete(key)
    tried.set(key, now())
    while (tried.size > MAX_TRIED) tried.delete(tried.keys().next().value)
  }

  const warm = async (keys) => {
    await prepare()
    const plan = warmPlanOf({ keys, isKnown: hasRow, isPending: (key) => pending.has(key), wasTried })
    promote(plan.promote)
    plan.render.forEach(markTried)
    warmQueue.push(...plan.render)
    warmQueue.splice(0, Math.max(0, warmQueue.length - MAX_WARM_QUEUE))
    warming ??= renderQueued().finally(() => { warming = null })
    return plan
  }

  const renderQueued = async () => {
    await wait(warmStartMs)
    promote(warmQueue.filter((key) => pending.has(key)))
    while (warmQueue.length) {
      await new Promise((resolve) => setImmediate(resolve))
      const key = warmQueue.shift()
      if (hasCurrentRow(key)) continue
      if (promote([key])) continue
      const url = warmUrlOf(key)
      const body = await Promise.resolve().then(() => render(url)).catch(() => null)
      if (!body?.length) continue
      noteServed({ url, body })
      promote([focusKeyOf(url) ?? key])
    }
  }

  const announceSettled = (keys) => {
    for (const key of keys) settledListeners.forEach((listener) => listener(key))
  }

  const markUnavailable = (keys) => {
    for (const key of keys) {
      unavailable.delete(key)
      unavailable.set(key, now())
    }
    while (unavailable.size > MAX_TRIED) unavailable.delete(unavailable.keys().next().value)
    announceSettled(keys)
  }

  const drain = async () => {
    await prepare()
    if (now() < pausedUntil) return
    if (!(await Promise.resolve().then(isEnabled).catch(() => false))) {
      const dropped = [...pending.keys()]
      pending.clear()
      return announceSettled(dropped)
    }
    const headroomMb = await Promise.resolve().then(readHeadroomMb).catch(() => null)
    if (Number.isFinite(headroomMb) && headroomMb < MIN_HEADROOM_MB) {
      pausedUntil = now() + retryMs
      return markUnavailable([...pending.keys()])
    }
    const jobs = takeBatch()
    if (!jobs.length) return
    const results = await Promise.resolve().then(() => detect(jobs)).catch(() => null)
    if (!results) {
      pausedUntil = now() + failureBackoffMs
      return markUnavailable(jobs.map((job) => job.urlKey))
    }
    for (const job of jobs.filter((candidate) => results.has(candidate.urlKey))) {
      await remember({ job, result: results.get(job.urlKey) })
    }
    markUnavailable(jobs.filter((job) => !results.has(job.urlKey)).map((job) => job.urlKey))
    announceSettled(jobs.filter((job) => results.has(job.urlKey)).map((job) => job.urlKey))
  }

  const focusStatusOf = async (url) => {
    const key = focusKeyOf(url)
    if (!key) return SETTLED_WITHOUT_FOCUS
    if (!(await Promise.resolve().then(isEnabled).catch(() => false))) return SETTLED_WITHOUT_FOCUS
    await prepare()
    const row = rows.get(key)
    if (row) return { settled: true, focus: row.method === 'centre' ? null : { x: row.x, y: row.y, box: row.box } }
    if (unavailable.has(key)) return SETTLED_WITHOUT_FOCUS
    return { settled: false, focus: null }
  }

  const onSettled = (listener) => {
    settledListeners.add(listener)
    return () => settledListeners.delete(listener)
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
    const previous = widthHashesOf(rows.get(job.urlKey))
    const changed = previous[job.width] && previous[job.width] !== job.sourceHash
    const hashes = { ...(changed ? {} : previous), [job.width]: job.sourceHash }
    const row = { urlKey: job.urlKey, sourceHash: job.sourceHash, width: job.width, hashes, ...focus, version: FOCUS_VERSION, updatedAt: now() }
    rows.set(job.urlKey, row)
    await Promise.resolve().then(() => saveRow(row)).catch(() => {})
  }

  const lookup = async (keys, { warmMissing = false } = {}) => {
    const enabled = await Promise.resolve().then(isEnabled).catch(() => false)
    if (!enabled) return { enabled: false, items: {} }
    await prepare()
    if (warmMissing) warmed = warm(keys).catch(() => {})
    const items = {}
    for (const key of keys) {
      const row = rows.get(key)
      if (row && row.method !== 'centre') items[key] = { x: row.x, y: row.y, box: row.box }
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

  const settleWarming = async () => {
    await warmed
    await warming
  }

  const stats = () => ({ rows: rows.size, pending: pending.size, warming: warmQueue.length })

  const pendingKeys = () => [...pending.keys()]

  return { prepare, noteServed, lookup, warm, startRefresh, tap, settle, settleWarming, stats, pendingKeys, focusStatusOf, onSettled }
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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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
const SETTLED_WITHOUT_FOCUS = { settled: true, focus: null }
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
const URGENT_DELAY_MS = 1000
const WARM_WIDTH = 768
const WARM_START_MS = 750
const REFRESH_GAP_MS = 3 * 1000
const REFRESH_START_MS = 60 * 1000
const MAX_WARM_KEYS = 12
const MAX_WARM_QUEUE = 24
const MAX_TRIED = 500
const WARM_RETRY_MS = 10 * 60 * 1000
const BATCH_PAUSE_MS = 2 * 1000
const LOW_MEMORY_RETRY_MS = 10 * 60 * 1000
const FAILURE_BACKOFF_MS = 30 * 60 * 1000
const WORKER_TIMEOUT_MS = 3 * 60 * 1000
const SHARP_COLUMN_DETAIL = 6
const MAX_PILLAR_SKEW = 0.04
const MIN_PILLAR_SHARE = 0.12
const MAX_BAND_SHARE = 0.76
