export const createProgrammeImages = ({
  fetchImage,
  maxEntries = DEFAULT_MAX_ENTRIES,
  maxBytes = DEFAULT_MAX_BYTES,
  missTtlMs = DEFAULT_MISS_TTL_MS,
  failureTtlMs = DEFAULT_FAILURE_TTL_MS,
  maxMisses = DEFAULT_MAX_MISSES,
  now = Date.now,
}) => {
  const entries = new Map()
  const misses = new Map()
  const failures = new Map()
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

  const note = ({ list, source, ttlMs }) => {
    list.delete(source)
    list.set(source, now() + ttlMs)
    if (list.size > maxMisses) list.delete(list.keys().next().value)
  }

  const isNoted = ({ list, source }) => {
    const expiresAt = list.get(source)
    if (expiresAt === undefined) return false
    if (expiresAt > now()) return true
    list.delete(source)
    return false
  }

  const imageOrErrorFor = async (source) => {
    if (!source) return null
    const cached = recall(source)
    if (cached) return cached
    if (isNoted({ list: misses, source })) return null
    if (isNoted({ list: failures, source })) throw new Error('image source failed recently')
    if (inflight.has(source)) return inflight.get(source)
    const pending = Promise.resolve()
      .then(() => fetchImage(source))
      .then((image) => {
        if (image) remember(source, image)
        else note({ list: misses, source, ttlMs: missTtlMs })
        return image || null
      }, (error) => {
        note({ list: failures, source, ttlMs: failureTtlMs })
        throw error
      })
      .finally(() => inflight.delete(source))
    inflight.set(source, pending)
    return pending
  }

  const imageFor = (source) => imageOrErrorFor(source).catch(() => null)

  const stats = () => ({ entries: entries.size, bytes: totalBytes, misses: misses.size, failures: failures.size })

  return { imageFor, imageOrErrorFor, stats }
}

const DEFAULT_MAX_ENTRIES = 64
const DEFAULT_MAX_BYTES = 32 * 1024 * 1024
const DEFAULT_MISS_TTL_MS = 10 * 60 * 1000
const DEFAULT_MAX_MISSES = 2000
const DEFAULT_FAILURE_TTL_MS = 60 * 1000

export const createHostTally = ({ windowSize = DEFAULT_TALLY_WINDOW, maxHosts = DEFAULT_TALLY_HOSTS, now = Date.now } = {}) => {
  const outcomes = new Map()

  const record = ({ source, loaded }) => {
    const host = hostOfSource(source)
    if (!host) return
    const recent = outcomes.get(host) ?? []
    outcomes.delete(host)
    recent.push({ loaded: Boolean(loaded), at: now() })
    if (recent.length > windowSize) recent.shift()
    outcomes.set(host, recent)
    if (outcomes.size > maxHosts) outcomes.delete(outcomes.keys().next().value)
  }

  const watch = (fetchImage) => async (source) => {
    try {
      const image = await fetchImage(source)
      record({ source, loaded: Boolean(image) })
      return image
    } catch (error) {
      record({ source, loaded: false })
      throw error
    }
  }

  const stats = () => new Map([...outcomes].map(([host, recent]) => {
    const failed = recent.filter((outcome) => !outcome.loaded).length
    return [host, { tried: recent.length, failed, loaded: recent.length - failed, lastAt: recent.at(-1)?.at ?? null }]
  }))

  return { record, watch, stats }
}

export const hostOfSource = (source) => {
  if (!/^https?:\/\//i.test(String(source ?? ''))) return null
  try {
    return new URL(source).hostname.toLowerCase()
  } catch {
    return null
  }
}

const DEFAULT_TALLY_WINDOW = 200
const DEFAULT_TALLY_HOSTS = 64

export const guideImageHosts = createHostTally()
