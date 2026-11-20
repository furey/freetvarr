import fs from 'node:fs/promises'
import path from 'node:path'

import {
  MANIFEST_FILE, allImagesOf, cacheDirOf, cachePathOf, download, gateImage, readJson, sha256Of, verifyCached,
} from './pack-lib.mjs'

const SURFACE_OF = { channel: 'logo' }
const PARALLEL = 6

const main = async () => {
  const manifest = await readJson(MANIFEST_FILE)
  const images = allImagesOf(manifest)
  const outcomes = await inBatches(images, (image) => ensureImage({ version: manifest.version, image }))
  const fetched = outcomes.filter((o) => o.status === 'fetched').length
  const failed = outcomes.filter((o) => o.status === 'failed')
  for (const failure of failed) console.error(`[fetch] FAILED ${failure.owner} (${failure.file}): ${failure.reason}`)
  const pruned = await pruneUnlisted({ version: manifest.version, images })
  console.log(`[fetch] ${images.length} images: ${images.length - fetched - failed.length} cached, ${fetched} fetched, ${failed.length} failed, ${pruned} unlisted files removed`)
  if (failed.length) process.exitCode = 1
}

const ensureImage = async ({ version, image }) => {
  const cached = await verifyCached({ version, image })
  if (cached.ok) return { status: 'cached' }
  const buffer = await download(image.url).catch((err) => ({ error: err.message }))
  if (buffer.error) return failure({ image, reason: buffer.error })
  if (sha256Of(buffer) !== image.sha256) return failure({ image, reason: 'hash differs from the manifest; the upstream file changed, so swap or rebuild this title' })
  const gate = await gateImage({ buffer, surface: surfaceOf(image) })
  if (!gate.ok) return failure({ image, reason: gate.reason })
  const target = cachePathOf({ version, file: image.file })
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, buffer)
  return { status: 'fetched' }
}

const pruneUnlisted = async ({ version, images }) => {
  const root = cacheDirOf(version)
  const listed = new Set(images.map((image) => path.join(root, image.file)))
  const files = (await fs.readdir(root, { recursive: true, withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) => !listed.has(file))
  for (const file of files) await fs.rm(file)
  return files.length
}

const surfaceOf = (image) => {
  if (SURFACE_OF[image.source]) return SURFACE_OF[image.source]
  if (image.source === 'wikimedia') return 'photo'
  if (/\/s\d+e\d+\./.test(image.file)) return 'still'
  return path.basename(image.file, path.extname(image.file))
}

const failure = ({ image, reason }) => ({ status: 'failed', owner: image.owner, file: image.file, reason })

const inBatches = async (items, task) => {
  const results = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await task(items[index])
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker))
  return results
}

await main()
