export const TASTE_TTL_MS = 60_000
export const TASTE_CACHE_LIMIT = 200

export const createTasteCache = ({ ttlMs = TASTE_TTL_MS, limit = TASTE_CACHE_LIMIT, now = Date.now } = {}) => {
  let entries = new Map()
  let generation = 0

  const get = ({ title, kind = null }) => {
    const key = tasteKeyOf({ title, kind })
    const entry = entries.get(key)
    if (!entry) return undefined
    if (now() - entry.savedAt < ttlMs) return entry.taste
    entries.delete(key)
    return undefined
  }

  const set = ({ title, kind = null, taste, startedIn }) => {
    if (startedIn !== generation) return false
    const key = tasteKeyOf({ title, kind })
    entries.delete(key)
    entries.set(key, { taste, savedAt: now() })
    while (entries.size > limit) entries.delete(entries.keys().next().value)
    return true
  }

  const clear = () => {
    entries = new Map()
    generation += 1
  }

  return { get, set, clear, generation: () => generation }
}

const tasteKeyOf = ({ title, kind }) => `${kind ?? ''}|${String(title ?? '').trim()}`
