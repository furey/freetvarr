export const readSnapshot = ({ storage, key, nowMs = Date.now() }) => {
  try {
    const saved = JSON.parse(storage.getItem(storageKeyOf(key)))
    if (saved?.version !== SNAPSHOT_VERSION) return null
    if (!(nowMs - saved.savedAt < SNAPSHOT_MAX_AGE_MS)) return null
    return saved.data ?? null
  } catch {
    return null
  }
}

export const writeSnapshot = ({ storage, key, data, nowMs = Date.now() }) => {
  try {
    storage.setItem(storageKeyOf(key), JSON.stringify({ version: SNAPSHOT_VERSION, savedAt: nowMs, data }))
  } catch {}
}

export const onNowAt = ({ entries = [], nowMs }) => entries.map((entry) => {
  const hasEnded = entry.now && entry.now.end <= nowMs
  const hasNextStarted = entry.next && entry.next.start <= nowMs
  if (!hasEnded || !hasNextStarted) return entry
  return { ...entry, now: entry.next, next: null }
})

export const upcomingAt = ({ recordings = [], nowMs, startMsOf }) =>
  recordings.filter((r) => startMsOf(r) > nowMs)

const storageKeyOf = (key) => `freetvarr.snapshot.${key}`

const SNAPSHOT_VERSION = 1
const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
