import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import sharp from 'sharp'

import knexConfig from '../knexfile.js'

export const PROGRAMME_IMAGE_WIDTHS = [192, 384, 768]
export const HERO_IMAGE_WIDTHS = [...PROGRAMME_IMAGE_WIDTHS, 1280, 1920]
export const DEFAULT_PROGRAMME_WIDTH = 768
export const CHANNEL_LOGO_WIDTHS = [96, 192]

export const getThumbnailRoot = () =>
  path.join(path.dirname(knexConfig.connection.filename), 'image-cache')

export const thumbnailWidthFrom = ({ requested, allowed, fallback = allowed.at(-1) }) => {
  if (requested === undefined) return fallback
  return allowed.find((width) => String(width) === requested) ?? null
}

export const heroWidthFrom = (requested) =>
  thumbnailWidthFrom({ requested, allowed: HERO_IMAGE_WIDTHS, fallback: DEFAULT_PROGRAMME_WIDTH })

export const imageCacheBytesFrom = (megabytes) => {
  const parsed = Number(megabytes)
  const valid = megabytes != null && megabytes !== '' && Number.isFinite(parsed) && parsed >= 0
  return valid ? Math.round(parsed * BYTES_PER_MB) : DEFAULT_IMAGE_CACHE_BYTES
}

export const resizeToWebp = async ({ body, width }) => ({
  body: await sharp(body)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer(),
  contentType: WEBP,
})

export const landscapeOf = async (image) => {
  const { width, height } = await sharp(image.body).metadata()
  if (!width || !height || width / height >= MIN_LANDSCAPE_RATIO) return image
  const canvasHeight = Math.min(height, LANDSCAPE_MAX_HEIGHT)
  const canvasWidth = Math.round(canvasHeight * 16 / 9)
  const backdrop = await sharp(image.body)
    .resize({ width: canvasWidth, height: canvasHeight, fit: 'cover' })
    .blur(LANDSCAPE_BLUR_SIGMA)
    .modulate({ brightness: LANDSCAPE_BACKDROP_BRIGHTNESS })
    .toBuffer()
  const poster = await sharp(image.body).resize({ height: canvasHeight }).toBuffer()
  const body = await sharp(backdrop)
    .composite([{ input: poster, gravity: 'center' }])
    .jpeg({ quality: LANDSCAPE_JPEG_QUALITY })
    .toBuffer()
  return { body, contentType: 'image/jpeg' }
}

export const createThumbnailStore = ({ dir, maxBytes = DEFAULT_IMAGE_CACHE_BYTES, resize = resizeToWebp }) => {
  const files = new Map()
  const inflight = new Map()
  let totalBytes = 0
  let loading = null
  let usable = true

  const fileOf = (name) => path.join(dir, name)

  const track = (name, bytes) => {
    forget(name)
    files.set(name, bytes)
    totalBytes += bytes
  }

  const forget = (name) => {
    if (!files.has(name)) return
    totalBytes -= files.get(name)
    files.delete(name)
  }

  const touch = (name) => {
    const bytes = files.get(name)
    files.delete(name)
    files.set(name, bytes)
    const now = new Date()
    fs.utimes(fileOf(name), now, now).catch(() => {})
  }

  const prune = async () => {
    const removals = []
    while (totalBytes > maxBytes && files.size) {
      const oldest = files.keys().next().value
      forget(oldest)
      removals.push(fs.rm(fileOf(oldest), { force: true }).catch(() => {}))
    }
    await Promise.all(removals)
  }

  const loadIndex = async () => {
    await fs.mkdir(dir, { recursive: true })
    const names = await fs.readdir(dir)
    await Promise.all(names.filter(isPartialWrite).map((name) => fs.rm(fileOf(name), { force: true })))
    const entries = await Promise.all(names.filter(isThumbnailName).map(statEntry))
    entries
      .filter(Boolean)
      .sort((a, b) => a.mtimeMs - b.mtimeMs)
      .forEach(({ name, size }) => track(name, size))
    await prune()
  }

  const statEntry = async (name) => {
    const stat = await fs.stat(fileOf(name)).catch(() => null)
    return stat ? { name, size: stat.size, mtimeMs: stat.mtimeMs } : null
  }

  const prepare = () => {
    loading ??= loadIndex().catch(() => { usable = false })
    return loading
  }

  const readCached = async (name) => {
    if (!files.has(name)) return null
    const body = await fs.readFile(fileOf(name)).catch(() => null)
    if (!body) {
      forget(name)
      return null
    }
    touch(name)
    return { body, contentType: WEBP }
  }

  const save = async (name, body) => {
    const partial = `${fileOf(name)}.${crypto.randomUUID()}${PARTIAL_SUFFIX}`
    await fs.writeFile(partial, body)
    await fs.rename(partial, fileOf(name)).catch(async (err) => {
      await fs.rm(partial, { force: true })
      throw err
    })
    track(name, body.length)
    await prune()
  }

  const shrink = async (original, width) => {
    if (original.contentType.includes('svg')) return original
    return resize({ body: original.body, width }).catch(() => original)
  }

  const createThumbnail = async ({ name, width, loadOriginal }) => {
    const original = await loadOriginal()
    if (!original) return null
    const thumbnail = await shrink(original, width)
    if (usable && thumbnail.contentType === WEBP) await save(name, thumbnail.body).catch(() => {})
    return thumbnail
  }

  const thumbnailFor = async ({ key, width, loadOriginal }) => {
    await prepare()
    const name = thumbnailNameFor({ key, width })
    const cached = usable ? await readCached(name) : null
    if (cached) return cached
    if (inflight.has(name)) return inflight.get(name)
    const pending = createThumbnail({ name, width, loadOriginal }).finally(() => inflight.delete(name))
    inflight.set(name, pending)
    return pending
  }

  const stats = () => ({ files: files.size, bytes: totalBytes })

  return { prepare, thumbnailFor, stats }
}

const thumbnailNameFor = ({ key, width }) =>
  `${crypto.createHash('sha256').update(`${key}|${width}`).digest('hex')}.webp`

const isThumbnailName = (name) => THUMBNAIL_NAME.test(name)

const isPartialWrite = (name) => name.endsWith(PARTIAL_SUFFIX)

const WEBP = 'image/webp'
const MIN_LANDSCAPE_RATIO = 1.3
const LANDSCAPE_MAX_HEIGHT = 1080
const LANDSCAPE_BLUR_SIGMA = 24
const LANDSCAPE_BACKDROP_BRIGHTNESS = 0.55
const LANDSCAPE_JPEG_QUALITY = 85
const WEBP_QUALITY = 72
const BYTES_PER_MB = 1024 * 1024
const DEFAULT_IMAGE_CACHE_BYTES = 100 * BYTES_PER_MB
const PARTIAL_SUFFIX = '.partial'
const THUMBNAIL_NAME = /^[0-9a-f]{64}\.webp$/
