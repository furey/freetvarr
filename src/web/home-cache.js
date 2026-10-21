export const HOME_CACHE_KEY = 'freetvarr.home'
export const HOME_CACHE_VERSION = 1
export const HOME_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000
export const HOME_CACHE_MAX_CHARS = 1_000_000
export const HOME_LIST_FIELDS = [
  'inProgress', 'newRecordings', 'nowEntries', 'upcoming', 'activeProgramIds', 'shows', 'watchlist', 'movies',
]

export const freshHomeOf = ({ home, nowMs }) => ({
  ...home,
  nowEntries: home.nowEntries.map((entry) => currentEntryOf({ entry, nowMs })),
  forYouPayload: currentForYouOf({ payload: home.forYouPayload, nowMs }),
})

export const readHomeCache = ({ storage, build, nowMs = Date.now() }) => {
  try {
    const saved = JSON.parse(storage.getItem(HOME_CACHE_KEY))
    if (saved?.version !== HOME_CACHE_VERSION || saved.build !== build) return null
    const ageMs = nowMs - saved.savedAt
    if (!(ageMs >= 0 && ageMs < HOME_CACHE_MAX_AGE_MS)) return null
    return isHomeShape(saved.home) ? saved.home : null
  } catch {
    return null
  }
}

export const writeHomeCache = ({ storage, build, home, nowMs = Date.now() }) => {
  try {
    const text = JSON.stringify({ version: HOME_CACHE_VERSION, build, savedAt: nowMs, home })
    if (text.length > HOME_CACHE_MAX_CHARS) return storage.removeItem(HOME_CACHE_KEY)
    storage.setItem(HOME_CACHE_KEY, text)
  } catch {}
}

export const isHomeShape = (home) => Boolean(home)
  && typeof home === 'object'
  && HOME_LIST_FIELDS.every((field) => Array.isArray(home[field]))
  && isPlainObject(home.heroPools)
  && (home.forYouPayload === null || isPlainObject(home.forYouPayload))

const currentEntryOf = ({ entry, nowMs }) => {
  if (!entry?.now || entry.now.end > nowMs) return entry
  const next = entry.next
  const nextCovers = Boolean(next) && next.start <= nowMs && next.end > nowMs
  return { ...entry, now: nextCovers ? next : null, next: nextCovers ? null : next }
}

const currentForYouOf = ({ payload, nowMs }) => {
  if (!Array.isArray(payload?.sections)) return payload
  return {
    ...payload,
    sections: payload.sections.map((section) => ({
      ...section,
      items: (section.items ?? []).filter((item) => !hasEnded({ item, nowMs })),
    })),
  }
}

const hasEnded = ({ item, nowMs }) => {
  const stop = Number(item.stop)
  if (!Number.isFinite(stop) || stop <= 0) return false
  return (stop < 1e11 ? stop * 1000 : stop) <= nowMs
}

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
