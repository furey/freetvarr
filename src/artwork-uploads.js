import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import sharp from 'sharp'

import knexConfig from '../knexfile.js'
import { UPLOAD_ORIGIN_PREFIX, artworkChoiceKindFrom, isShowKey } from './artwork-choices.js'

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
export const MAX_UPLOADS_PER_KIND = 12
export const UPLOAD_SIZES = {
  background: { width: 1920, height: 1080 },
  poster: { width: 1000, height: 1500 },
}

export const getUploadRoot = () =>
  path.join(path.dirname(knexConfig.connection.filename), 'uploads', 'artwork')

export class UploadRejected extends Error {}

export const MAX_UPLOAD_PIXELS = 40_000_000

export const prepareUpload = ({ body, kind }) => oneUploadAtATime(() => preparedUploadOf({ body, kind }))

export const createSingleSlot = ({ maxWaiting = MAX_WAITING_UPLOADS } = {}) => {
  let tail = Promise.resolve()
  let waiting = 0
  return (task) => {
    if (waiting >= maxWaiting) return Promise.reject(new UploadRejected('another picture is still being prepared: try again in a moment'))
    waiting += 1
    const run = tail.then(task)
    tail = run.catch(() => {}).finally(() => { waiting -= 1 })
    return run
  }
}

const preparedUploadOf = async ({ body, kind }) => {
  const meta = await sharp(body, SHARP_HEADER).metadata().catch(() => null)
  if (!meta || !ACCEPTED_FORMATS.includes(meta.format)) throw new UploadRejected('the file is not a JPEG, PNG, or WebP picture')
  if (meta.compression === 'hevc') throw new UploadRejected('HEIC pictures cannot be read here: save it as a JPEG and try again')
  if ((meta.width ?? 0) * (meta.height ?? 0) > MAX_UPLOAD_PIXELS) throw new UploadRejected('the picture is too large: use one under 40 megapixels')
  const max = UPLOAD_SIZES[kind]
  const { width, height } = croppedSizeOf({ ...orientedSizeOf(meta), max })
  const reduced = await sharp(body, SHARP_INPUT)
    .rotate()
    .resize({ width: max.width * PRE_SHRINK_FACTOR, height: max.height * PRE_SHRINK_FACTOR, fit: 'outside', withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true })
    .catch(() => null)
  if (!reduced) throw new UploadRejected('the picture cannot be read')
  const output = await sharp(reduced.data, { raw: reduced.info })
    .resize({ width, height, fit: 'cover', position: sharp.strategy.attention })
    .webp({ quality: UPLOAD_QUALITY })
    .toBuffer()
    .catch(() => null)
  if (!output) throw new UploadRejected('the picture cannot be read')
  return output
}

export const croppedSizeOf = ({ width, height, max }) => {
  const ratio = max.width / max.height
  const croppedWidth = Math.max(1, Math.round(Math.min(max.width, width, height * ratio)))
  return { width: croppedWidth, height: Math.max(1, Math.round(croppedWidth / ratio)) }
}

export const uploadPartsOf = (origin) => {
  const match = typeof origin === 'string' ? UPLOAD_ORIGIN_PATTERN.exec(origin) : null
  if (!match || !isShowKey(match[1])) return null
  return { key: match[1], kind: match[2], file: `${match[2]}-${match[3]}-${match[4]}.webp`, savedAt: parseInt(match[3], 36) }
}

export const createArtworkUploads = ({ root = getUploadRoot(), now = Date.now, randomHex = defaultRandomHex, maxPerKind = MAX_UPLOADS_PER_KIND } = {}) => {
  const dirOf = (key) => path.join(root, key)

  const list = async ({ key, kind = null }) => {
    if (!isShowKey(key)) return []
    const names = await fs.readdir(dirOf(key)).catch(() => [])
    return names
      .map((name) => uploadPartsOf(`${UPLOAD_ORIGIN_PREFIX}${key}/${name}`))
      .filter((parts) => parts && (!kind || parts.kind === kind))
      .sort((a, b) => b.savedAt - a.savedAt)
      .map((parts) => ({ origin: originOf(parts), kind: parts.kind, source: 'upload' }))
  }

  const saving = new Map()

  const save = ({ key, kind, body }) => {
    const previous = saving.get(key) ?? Promise.resolve()
    const run = previous.catch(() => {}).then(() => saveWithinLimit({ key, kind, body }))
    const settled = run.catch(() => {})
    saving.set(key, settled)
    settled.then(() => { if (saving.get(key) === settled) saving.delete(key) })
    return run
  }

  const saveWithinLimit = async ({ key, kind, body }) => {
    if (!isShowKey(key) || !artworkChoiceKindFrom(kind)) throw new UploadRejected('bad show or kind')
    if ((await list({ key, kind })).length >= maxPerKind) throw new UploadRejected(`remove a picture first: each show keeps up to ${maxPerKind}`)
    const file = `${kind}-${now().toString(36)}-${randomHex()}.webp`
    await fs.mkdir(dirOf(key), { recursive: true })
    const target = path.join(dirOf(key), file)
    await fs.writeFile(`${target}${PARTIAL_SUFFIX}`, body)
    await fs.rename(`${target}${PARTIAL_SUFFIX}`, target)
    return { origin: originOf({ key, file }), kind, source: 'upload' }
  }

  const remove = async (origin) => {
    const parts = uploadPartsOf(origin)
    if (!parts) return false
    await fs.rm(path.join(dirOf(parts.key), parts.file), { force: true })
    await fs.rmdir(dirOf(parts.key)).catch(() => {})
    return true
  }

  const read = async (origin) => {
    const parts = uploadPartsOf(origin)
    if (!parts) return null
    const body = await fs.readFile(path.join(dirOf(parts.key), parts.file)).catch(() => null)
    return body && { body, contentType: 'image/webp' }
  }

  return { list, save, remove, read }
}

const originOf = ({ key, file }) => `${UPLOAD_ORIGIN_PREFIX}${key}/${file}`

const orientedSizeOf = (meta) => {
  if (meta.autoOrient?.width) return meta.autoOrient
  return (meta.orientation ?? 1) >= 5 ? { width: meta.height, height: meta.width } : { width: meta.width, height: meta.height }
}

const defaultRandomHex = () => crypto.randomBytes(4).toString('hex')

export const artworkUploads = createArtworkUploads()

const UPLOAD_ORIGIN_PATTERN = /^upload:([a-z0-9-]{1,200})\/(background|poster)-([0-9a-z]{1,12})-([0-9a-f]{8})\.webp$/
const ACCEPTED_FORMATS = ['jpeg', 'png', 'webp', 'heif']
const SHARP_INPUT = { failOn: 'error', limitInputPixels: MAX_UPLOAD_PIXELS, sequentialRead: true }
const SHARP_HEADER = { failOn: 'error', limitInputPixels: false }
const PRE_SHRINK_FACTOR = 2
const MAX_WAITING_UPLOADS = 4
const UPLOAD_QUALITY = 82
const PARTIAL_SUFFIX = '.partial'

const oneUploadAtATime = createSingleSlot()
