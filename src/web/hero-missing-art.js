export const HERO_MISSING_ART_KEY = 'freetvarr.heroMissingArt'
export const MISSING_ART_TTL_MS = 6 * 60 * 60 * 1000

export const missingArtKeysOf = ({ storage, nowMs }) => new Set(
  Object.entries(readSaved(storage)).filter(([, expiresAt]) => expiresAt > nowMs).map(([key]) => key),
)

export const rememberMissingArt = ({ storage, key, nowMs }) => {
  const kept = Object.entries(readSaved(storage)).filter(([, expiresAt]) => expiresAt > nowMs)
  const saved = Object.fromEntries([...kept, [key, nowMs + MISSING_ART_TTL_MS]])
  try {
    storage?.setItem(HERO_MISSING_ART_KEY, JSON.stringify(saved))
  } catch {}
  return new Set(Object.keys(saved))
}

const readSaved = (storage) => {
  try {
    const saved = JSON.parse(storage?.getItem(HERO_MISSING_ART_KEY) || '{}')
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}
  } catch {
    return {}
  }
}
