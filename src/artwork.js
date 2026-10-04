import fs from 'fs/promises'
import path from 'path'

import knexConfig from '../knexfile.js'

export const getArtworkRoot = () =>
  process.env.ARTWORK_PATH || path.join(path.dirname(knexConfig.connection.filename), 'artwork')

export const saveArtwork = async ({ kind, id, image, root = getArtworkRoot() }) => {
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
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/
const EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
}
