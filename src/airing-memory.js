export const AIRING_MEMORY_ENTRIES = 20_000

export const createAiringMemory = ({ maxEntries = AIRING_MEMORY_ENTRIES } = {}) => {
  const entries = new Map()
  const keysByShow = new Map()

  const recall = (key) => {
    const entry = entries.get(key)
    if (!entry) return null
    entries.delete(key)
    entries.set(key, entry)
    return { fingerprint: entry.fingerprint, answer: entry.answer }
  }

  const remember = ({ key, fingerprint, showKey, answer }) => {
    forget(key)
    entries.set(key, { fingerprint, showKey, answer })
    if (showKey) keysByShow.set(showKey, (keysByShow.get(showKey) ?? new Set()).add(key))
    while (entries.size > maxEntries) forget(entries.keys().next().value)
  }

  const forget = (key) => {
    const entry = entries.get(key)
    if (!entry) return
    entries.delete(key)
    const keys = keysByShow.get(entry.showKey)
    keys?.delete(key)
    if (keys && !keys.size) keysByShow.delete(entry.showKey)
  }

  const forgetShows = (showKeys = []) => {
    for (const showKey of showKeys) for (const key of [...(keysByShow.get(showKey) ?? [])]) forget(key)
  }

  const clear = () => {
    entries.clear()
    keysByShow.clear()
  }

  const size = () => entries.size

  return { recall, remember, forget, forgetShows, clear, size }
}

export const forgetAiringsOnArtChanges = ({ feed, memory }) => {
  let cursor = feed.cursor()
  return feed.subscribe(() => {
    const batch = feed.since(cursor)
    cursor = batch.cursor
    if (batch.reset) return memory.clear()
    memory.forgetShows(batch.stamps.map((change) => change.key))
  })
}
