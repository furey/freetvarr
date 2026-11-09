import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'

import { db } from './db.js'
import { getArtworkRoot } from './artwork.js'
import { createCircuitBreaker, createHostLimiter } from './outbound-http.js'
import { guideImageHosts, hostOfSource } from './programme-images.js'
import { showTitleKey } from './show-artwork.js'

export const GUIDE_PICTURE_ORIGIN_PREFIX = 'guide-picture:'
export const GUIDE_PICTURE_MAX_WIDTH = 1280
export const GUIDE_PICTURE_QUALITY = 72
export const GUIDE_PICTURE_KEEP_MS = 180 * 24 * 60 * 60 * 1000
export const GUIDE_PICTURE_MAX_BYTES = 500 * 1024 * 1024

export const isGuidePictureOrigin = (origin) => String(origin ?? '').startsWith(GUIDE_PICTURE_ORIGIN_PREFIX)

export const guidePictureIdOf = (source) => createHash('sha256').update(String(source)).digest('hex').slice(0, PICTURE_ID_LENGTH)

export const guidePictureOriginOf = ({ source_url: source, saved_at: savedAt }) =>
  `${GUIDE_PICTURE_ORIGIN_PREFIX}${guidePictureIdOf(source)}${VERSION_SEPARATOR}${Number(savedAt).toString(36)}`

export const guidePictureCandidatesOf = (programmes = [], { maxSources = MAX_SOURCES_PER_TITLE } = {}) => {
  const byTitle = new Map()
  for (const programme of [...programmes].sort((a, b) => a.start - b.start)) {
    const titleKey = showTitleKey(programme?.title)
    if (!titleKey) continue
    const entry = byTitle.get(titleKey) ?? { titleKey, title: programme.title, sources: [] }
    if (programme.image && !entry.sources.includes(programme.image) && entry.sources.length < maxSources) entry.sources.push(programme.image)
    byTitle.set(titleKey, entry)
  }
  return byTitle
}

export const encodeGuidePicture = async (image) => {
  const { data, info } = await sharp(image.body, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({ width: GUIDE_PICTURE_MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: GUIDE_PICTURE_QUALITY })
    .toBuffer({ resolveWithObject: true })
  return { body: data, width: info.width, height: info.height }
}

export const createGuidePictures = ({
  database = db,
  root = path.join(getArtworkRoot(), GUIDE_DIR),
  fetchImage,
  encode = encodeGuidePicture,
  hostTally = guideImageHosts,
  now = Date.now,
  sleep,
  gapMs = HOST_GAP_MS,
  keepMs = GUIDE_PICTURE_KEEP_MS,
  maxBytes = GUIDE_PICTURE_MAX_BYTES,
  missRetryMs = MISS_RETRY_MS,
  errorRetryMs = ERROR_RETRY_MS,
} = {}) => {
  const limiters = new Map()
  const breakers = new Map()
  const failedSources = new Map()
  let index = null
  let loading = null

  const limiterFor = (host) => {
    if (!limiters.has(host)) limiters.set(host, createHostLimiter({ concurrency: 1, gapMs, now, ...(sleep ? { sleep } : {}) }))
    return limiters.get(host)
  }

  const breakerFor = (host) => {
    if (!breakers.has(host)) breakers.set(host, createCircuitBreaker({ now }))
    return breakers.get(host)
  }

  const load = async () => {
    if (index) return index
    if (!loading) {
      loading = database('guide_pictures').select('title_key', 'source_url', 'saved_at')
        .then((rows) => { index = indexOf(rows) })
        .catch(() => { index = indexOf([]) })
        .finally(() => { loading = null })
    }
    await loading
    return index
  }

  const originFor = async (title) => {
    const titleKey = showTitleKey(title)
    const row = titleKey ? (await load()).byTitle.get(titleKey) : null
    return row ? guidePictureOriginOf(row) : null
  }

  const originForSource = async (source) => {
    const row = source ? (await load()).bySource.get(source) : null
    return row ? guidePictureOriginOf(row) : null
  }

  const read = async (origin) => {
    const id = idOfOrigin(origin)
    if (!id) return null
    const body = await fs.readFile(path.join(root, `${id}${EXTENSION}`)).catch(() => null)
    return body ? { body, contentType: CONTENT_TYPE } : null
  }

  const isNotedFailure = (source) => {
    const until = failedSources.get(source)
    if (until === undefined) return false
    if (until > now()) return true
    failedSources.delete(source)
    return false
  }

  const noteFailure = ({ source, ms }) => {
    failedSources.delete(source)
    failedSources.set(source, now() + ms)
    if (failedSources.size > MAX_NOTED_FAILURES) failedSources.delete(failedSources.keys().next().value)
  }

  const fetchThroughHost = async (source) => {
    const host = hostOfSource(source) ?? LOCAL_HOST
    const breaker = breakerFor(host)
    if (!breaker.allows()) return { image: null, error: true }
    const outcome = await limiterFor(host).run(() => fetchImage(source), { isBackground: true })
      .then((image) => ({ image }), (error) => ({ image: null, error: error ?? true }))
    if (outcome.error?.code === 'queue-full') return { image: null, error: true }
    hostTally?.record({ source, loaded: Boolean(outcome.image) })
    if (outcome.error) breaker.recordFailure()
    else breaker.recordSuccess()
    return outcome
  }

  const saveSource = async ({ titleKey, source }) => {
    const { image, error } = await fetchThroughHost(source)
    if (!image) {
      noteFailure({ source, ms: error ? errorRetryMs : missRetryMs })
      return false
    }
    const encoded = await encode(image).catch(() => null)
    if (!encoded?.body?.length) {
      noteFailure({ source, ms: missRetryMs })
      return false
    }
    await write({ titleKey, source, encoded })
    return true
  }

  const write = async ({ titleKey, source, encoded }) => {
    const target = path.join(root, `${guidePictureIdOf(source)}${EXTENSION}`)
    const temporary = `${target}.tmp`
    await fs.mkdir(root, { recursive: true })
    await fs.writeFile(temporary, encoded.body)
    await fs.rename(temporary, target)
    const saved = await load()
    const savedAt = Math.max(now(), Number(saved.byTitle.get(titleKey)?.saved_at ?? 0) + 1)
    await database('guide_pictures').insert({
      source_url: source,
      title_key: titleKey,
      host: hostOfSource(source) ?? LOCAL_HOST,
      w: encoded.width,
      h: encoded.height,
      bytes: encoded.body.length,
      saved_at: savedAt,
      last_seen_at: now(),
    }).onConflict('source_url').merge()
    index = indexOf([...saved.bySource.values(), { title_key: titleKey, source_url: source, saved_at: savedAt }])
  }

  const markSeen = async ({ candidates, saved }) => {
    const sources = [...candidates.values()].flatMap((entry) => [
      ...entry.sources,
      saved.byTitle.get(entry.titleKey)?.source_url,
    ]).filter(Boolean)
    for (let at = 0; at < sources.length; at += SEEN_BATCH) {
      await database('guide_pictures').whereIn('source_url', sources.slice(at, at + SEEN_BATCH)).update({ last_seen_at: now() })
    }
  }

  const saveAll = async ({ candidates }) => {
    await markSeen({ candidates, saved: await load() }).catch(() => {})
    const result = { saved: 0, kept: 0, failed: [], unsaved: [] }
    for (const entry of candidates.values()) {
      const saved = await load()
      const missing = entry.sources.filter((source) => !saved.bySource.has(source))
      const due = missing.filter((source) => !isNotedFailure(source))
      result.kept += entry.sources.length - missing.length
      let failed = missing.length > due.length
      for (const source of due) {
        if (await saveSource({ titleKey: entry.titleKey, source }).catch(() => false)) result.saved += 1
        else failed = true
      }
      if (failed) result.failed.push(entry.titleKey)
      if (!(await load()).byTitle.has(entry.titleKey)) result.unsaved.push(entry.titleKey)
    }
    return result
  }

  const prune = async ({ keepTitleKeys = new Set(), keepOrigins = new Set() } = {}) => {
    const rows = await database('guide_pictures').select('title_key', 'source_url', 'bytes', 'last_seen_at').orderBy('last_seen_at', 'asc')
    const chosenIds = new Set([...keepOrigins].map(idOfOrigin).filter(Boolean))
    const isKept = (row) => keepTitleKeys.has(row.title_key) || keepOrigins.has(row.source_url) || chosenIds.has(guidePictureIdOf(row.source_url))
    const gone = new Set(rows.filter((row) => !isKept(row) && Number(row.last_seen_at) < now() - keepMs).map((row) => row.source_url))
    let total = rows.filter((row) => !gone.has(row.source_url)).reduce((sum, row) => sum + Number(row.bytes), 0)
    for (const row of rows) {
      if (total <= maxBytes) break
      if (gone.has(row.source_url) || isKept(row)) continue
      gone.add(row.source_url)
      total -= Number(row.bytes)
    }
    await remove([...gone])
    const kept = new Set(rows.filter((row) => !gone.has(row.source_url)).map((row) => `${guidePictureIdOf(row.source_url)}${EXTENSION}`))
    const strays = (await fs.readdir(root).catch(() => [])).filter((name) => isStrayFile({ name, kept }))
    for (const name of strays) await fs.rm(path.join(root, name), { force: true })
    return gone.size + strays.length
  }

  const remove = async (sources) => {
    for (let at = 0; at < sources.length; at += SEEN_BATCH) {
      await database('guide_pictures').whereIn('source_url', sources.slice(at, at + SEEN_BATCH)).del()
    }
    const removed = new Set(sources)
    index = indexOf([...(await load()).bySource.values()].filter((row) => !removed.has(row.source_url)))
    for (const source of sources) await fs.rm(path.join(root, `${guidePictureIdOf(source)}${EXTENSION}`), { force: true })
  }

  const savedTitleKeys = async () => new Set((await load()).byTitle.keys())

  return { saveAll, originFor, originForSource, read, prune, savedTitleKeys }
}

const isStrayFile = ({ name, kept }) => STRAY_FILE.test(name) && !kept.has(name)

const indexOf = (rows) => {
  const bySource = new Map(rows.map((row) => [row.source_url, row]))
  const byTitle = new Map()
  for (const row of bySource.values()) {
    const current = byTitle.get(row.title_key)
    if (!current || Number(row.saved_at) > Number(current.saved_at)) byTitle.set(row.title_key, row)
  }
  return { bySource, byTitle }
}

const idOfOrigin = (origin) => {
  if (!isGuidePictureOrigin(origin)) return null
  const id = String(origin).slice(GUIDE_PICTURE_ORIGIN_PREFIX.length).split(VERSION_SEPARATOR)[0]
  return PICTURE_ID.test(id) ? id : null
}

const GUIDE_DIR = 'guide'
const EXTENSION = '.webp'
const CONTENT_TYPE = 'image/webp'
const PICTURE_ID_LENGTH = 24
const PICTURE_ID = /^[0-9a-f]{24}$/
const STRAY_FILE = /^[0-9a-f]{24}\.webp(\.tmp)?$/
const VERSION_SEPARATOR = '-v'
const LOCAL_HOST = 'tvheadend'
const MAX_SOURCES_PER_TITLE = 4
const MAX_INPUT_PIXELS = 40_000_000
const HOST_GAP_MS = 1000
const MISS_RETRY_MS = 24 * 60 * 60 * 1000
const ERROR_RETRY_MS = 60 * 60 * 1000
const MAX_NOTED_FAILURES = 20_000
const SEEN_BATCH = 400
