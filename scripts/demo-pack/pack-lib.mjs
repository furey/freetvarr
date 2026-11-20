import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

export const PACK_DIR = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(PACK_DIR, '..', '..')
export const SPEC_FILE = path.join(PACK_DIR, 'pack-spec.json')
export const MANIFEST_FILE = path.join(PACK_DIR, 'manifest.json')
export const CACHE_ROOT = process.env.DEMO_PACK_CACHE || path.join(REPO_ROOT, 'scripts', '.cache', 'demo-pack')
export const CACHE_MAX_AGE_MS = 182 * 24 * 60 * 60 * 1000
export const USER_AGENT = 'freetvarr-demo-pack/1 (https://github.com/furey/freetvarr)'

export const GATES = {
  backdrop: { minWidth: 1920, aspect: 16 / 9, tolerance: 0.04 },
  poster: { minWidth: 500, aspect: 2 / 3, tolerance: 0.04 },
  still: { minWidth: 1280, aspect: 16 / 9, tolerance: 0.04 },
  photo: { minWidth: 1280, minHeight: 720 },
  logo: { minWidth: 64 },
}

export const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'))

export const writeJson = (file, value) => fs.writeFile(file, `${compactJson(value)}\n`)

export const compactJson = (value) => JSON.stringify(value, null, 2)
  .replace(/\[\n\s+([^[\]{}]*?)\n\s+\]/g, (_, inner) => `[${inner.split(/,\n\s+/).join(', ')}]`)

export const cacheDirOf = (version) => path.join(CACHE_ROOT, `v${version}`)

export const cachePathOf = ({ version, file }) => path.join(cacheDirOf(version), file)

export const sha256Of = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex')

export const download = async (url, { attempts = 3 } = {}) => {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(60_000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return Buffer.from(await response.arrayBuffer())
    } catch (err) {
      lastError = err
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000))
    }
  }
  throw new Error(`download failed for ${hostOf(url)}: ${lastError.message}`)
}

export const gateImage = async ({ buffer, surface }) => {
  const gate = GATES[surface]
  const meta = await sharp(buffer).metadata().catch(() => null)
  if (!meta?.width) return { ok: false, reason: 'not a readable image' }
  const { width, height } = meta
  if (width < gate.minWidth) return { ok: false, reason: `${width} px wide, needs ${gate.minWidth}`, width, height }
  if (gate.minHeight && height < gate.minHeight) return { ok: false, reason: `${height} px high, needs ${gate.minHeight}`, width, height }
  if (gate.aspect && Math.abs(width / height - gate.aspect) / gate.aspect > gate.tolerance) {
    return { ok: false, reason: `shape ${(width / height).toFixed(2)}, needs ${gate.aspect.toFixed(2)}`, width, height }
  }
  if (surface !== 'logo' && await isBlank(buffer)) return { ok: false, reason: 'blank or flat image', width, height }
  return { ok: true, width, height }
}

export const verifyCached = async ({ version, image }) => {
  const file = cachePathOf({ version, file: image.file })
  const buffer = await fs.readFile(file).catch(() => null)
  if (!buffer) return { ok: false, reason: 'missing' }
  if (sha256Of(buffer) !== image.sha256) return { ok: false, reason: 'hash mismatch' }
  const stat = await fs.stat(file)
  if (Date.now() - stat.mtimeMs > CACHE_MAX_AGE_MS) return { ok: false, reason: 'older than 6 months' }
  return { ok: true, file }
}

export const allImagesOf = (manifest) => [
  ...manifest.channels.map((channel) => ({ owner: channel.name, ...channel.logoImage })),
  ...manifest.titles.flatMap((title) => Object.values(title.images ?? {}).map((image) => ({ owner: title.title, ...image }))),
  ...manifest.titles.flatMap((title) => (title.episodes ?? []).filter((e) => e.still).map((e) => ({ owner: `${title.title} ${e.code}`, ...e.still }))),
]

export const titlesByKey = (manifest) => new Map(manifest.titles.map((title) => [title.key, title]))

const isBlank = async (buffer) => {
  const stats = await sharp(buffer).resize(64, 64, { fit: 'fill' }).stats()
  const spread = stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.stdev, 0) / 3
  return spread < 6
}

const hostOf = (url) => {
  try {
    return new URL(url).host
  } catch {
    return 'unknown host'
  }
}
