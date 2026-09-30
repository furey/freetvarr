export const createProgrammeImages = ({
  fetchImage,
  maxEntries = DEFAULT_MAX_ENTRIES,
  maxBytes = DEFAULT_MAX_BYTES,
}) => {
  const entries = new Map()
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

  const imageFor = async (source) => {
    if (!source) return null
    const cached = recall(source)
    if (cached) return cached
    if (inflight.has(source)) return inflight.get(source)
    const pending = Promise.resolve(fetchImage(source))
      .catch(() => null)
      .then((image) => {
        if (image) remember(source, image)
        return image || null
      })
      .finally(() => inflight.delete(source))
    inflight.set(source, pending)
    return pending
  }

  const stats = () => ({ entries: entries.size, bytes: totalBytes })

  return { imageFor, stats }
}

const DEFAULT_MAX_ENTRIES = 64
const DEFAULT_MAX_BYTES = 32 * 1024 * 1024
