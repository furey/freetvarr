import fs from 'fs/promises'
import path from 'path'
import { spawn } from 'child_process'

import knexConfig from '../knexfile.js'

export const getArtworkRoot = () =>
  process.env.ARTWORK_PATH || path.join(path.dirname(knexConfig.connection.filename), 'artwork')

export const saveArtwork = async ({ kind, id, image: original, root = getArtworkRoot(), shrink = shrinkImage }) => {
  const image = kind === 'recording' ? await shrink(original).catch(() => original) : original
  const relative = artworkPath({ kind, id, contentType: image.contentType })
  if (!relative) return null
  const target = path.join(root, relative)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await removeArtwork({ kind, id, root })
  await fs.writeFile(target, image.body)
  return relative
}

export const readArtwork = async ({ relative, root = getArtworkRoot() }) => {
  if (!isSafeRelative(relative)) return null
  const body = await fs.readFile(path.join(root, relative)).catch(() => null)
  if (!body) return null
  return { body, contentType: contentTypeFor(relative) }
}

export const findArtwork = async ({ kind, id, root = getArtworkRoot() }) => {
  const relative = await existingArtworkPath({ kind, id, root })
  return relative ? readArtwork({ relative, root }) : null
}

export const removeArtwork = async ({ kind, id, root = getArtworkRoot() }) => {
  const relative = await existingArtworkPath({ kind, id, root })
  if (relative) await fs.rm(path.join(root, relative), { force: true })
}

export const pruneRecordingArtwork = async ({
  keepIds,
  minAgeMs = ORPHAN_MIN_AGE_MS,
  nowMs = Date.now(),
  root = getArtworkRoot(),
}) => {
  const dir = path.join(root, KINDS.recording)
  const names = await fs.readdir(dir).catch(() => [])
  const keep = new Set(keepIds)
  const isOldOrphan = async (name) => {
    if (keep.has(path.parse(name).name)) return false
    const stat = await fs.stat(path.join(dir, name)).catch(() => null)
    return Boolean(stat) && nowMs - stat.mtimeMs >= minAgeMs
  }
  const orphans = []
  for (const name of names) if (await isOldOrphan(name)) orphans.push(name)
  await Promise.all(orphans.map((name) => fs.rm(path.join(dir, name), { force: true })))
  return orphans.length
}

export const shrinkImage = async (image, { maxWidth = MAX_IMAGE_WIDTH, run = runFfmpeg } = {}) => {
  if (image.body.length <= SMALL_IMAGE_BYTES || image.contentType.includes('svg')) return image
  const body = await run({
    input: image.body,
    args: [
      '-hide_banner', '-loglevel', 'error', '-i', 'pipe:0',
      '-vf', `scale='min(${maxWidth},iw)':-2`,
      '-q:v', '4', '-frames:v', '1', '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1',
    ],
  })
  return body.length > 0 && body.length < image.body.length ? { body, contentType: 'image/jpeg' } : image
}

export const shrinkStoredArtwork = async ({ root = getArtworkRoot(), shrink = shrinkImage } = {}) => {
  const dir = path.join(root, KINDS.recording)
  const names = await fs.readdir(dir).catch(() => [])
  let shrunk = 0
  for (const name of names) {
    const file = path.join(dir, name)
    const body = await fs.readFile(file).catch(() => null)
    if (!body || body.length <= SMALL_IMAGE_BYTES) continue
    const image = await shrink({ body, contentType: contentTypeFor(name) }).catch(() => null)
    if (!image || image.body === body) continue
    await saveArtwork({ kind: 'recording', id: path.parse(name).name, image, root, shrink: async (i) => i })
    shrunk++
  }
  return shrunk
}

const runFfmpeg = ({ input, args }) => new Promise((resolve, reject) => {
  const child = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'ignore'] })
  const chunks = []
  child.stdout.on('data', (chunk) => chunks.push(chunk))
  child.on('error', reject)
  child.on('close', (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`ffmpeg exited ${code}`))))
  child.stdin.on('error', () => {})
  child.stdin.end(input)
})

const artworkPath = ({ kind, id, contentType }) => {
  if (!KINDS[kind] || !SAFE_ID.test(String(id))) return null
  return `${KINDS[kind]}/${id}${extensionFor(contentType)}`
}

const existingArtworkPath = async ({ kind, id, root }) => {
  if (!KINDS[kind] || !SAFE_ID.test(String(id))) return null
  const names = await fs.readdir(path.join(root, KINDS[kind])).catch(() => [])
  const name = names.find((n) => path.parse(n).name === String(id))
  return name ? `${KINDS[kind]}/${name}` : null
}

const isSafeRelative = (relative) =>
  typeof relative === 'string'
  && Object.values(KINDS).some((dir) => relative.startsWith(`${dir}/`))
  && !relative.includes('..')

const extensionFor = (contentType) => EXTENSIONS[String(contentType).split(';')[0].trim()] || '.img'

const contentTypeFor = (relative) =>
  Object.entries(EXTENSIONS).find(([, ext]) => relative.endsWith(ext))?.[0] || 'application/octet-stream'

const KINDS = { recording: 'recordings', channel: 'channels' }
const ORPHAN_MIN_AGE_MS = 14 * 24 * 60 * 60 * 1000
const MAX_IMAGE_WIDTH = 960
const SMALL_IMAGE_BYTES = 150 * 1024
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/
const EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
}
