export const createProgrammeImages = ({
  fetchImage,
  maxEntries = DEFAULT_MAX_ENTRIES,
  maxBytes = DEFAULT_MAX_BYTES,
  missTtlMs = DEFAULT_MISS_TTL_MS,
  maxMisses = DEFAULT_MAX_MISSES,
  now = Date.now,
}) => {
  const entries = new Map()
  const misses = new Map()
  const inflight = new Map()
  let totalBytes = 0

  const evictOldest = () => {
    const [oldestSource, oldest] = entries.entries().next().value
    entries.delete(oldestSource)
    totalBytes -= oldest.body.length
  }

  const remember = (source, image) => {
    if (image.body.length > maxBytes) return
    entries.set(source, image)
    totalBytes += image.body.length
    while (entries.size > maxEntries || totalBytes > maxBytes) evictOldest()
  }

  const recall = (source) => {
    const image = entries.get(source)
    if (!image) return null
    entries.delete(source)
    entries.set(source, image)
    return image
  }

  const rememberMiss = (source) => {
    misses.delete(source)
    misses.set(source, now() + missTtlMs)
    if (misses.size > maxMisses) misses.delete(misses.keys().next().value)
  }

  const recentlyMissed = (source) => {
    const expiresAt = misses.get(source)
    if (expiresAt === undefined) return false
    if (expiresAt > now()) return true
    misses.delete(source)
    return false
  }

  const imageFor = async (source) => {
    if (!source) return null
    const cached = recall(source)
    if (cached) return cached
    if (recentlyMissed(source)) return null
    if (inflight.has(source)) return inflight.get(source)
    const pending = Promise.resolve(fetchImage(source))
      .catch(() => null)
      .then((image) => {
        if (image) remember(source, image)
        else rememberMiss(source)
        return image || null
      })
      .finally(() => inflight.delete(source))
    inflight.set(source, pending)
    return pending
  }

  const stats = () => ({ entries: entries.size, bytes: totalBytes, misses: misses.size })

  return { imageFor, stats }
}

const DEFAULT_MAX_ENTRIES = 64
const DEFAULT_MAX_BYTES = 32 * 1024 * 1024
const DEFAULT_MISS_TTL_MS = 10 * 60 * 1000
const DEFAULT_MAX_MISSES = 2000
