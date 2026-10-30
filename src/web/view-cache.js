export const LIVE_CACHE = {
  key: 'freetvarr.live',
  version: 1,
  maxAgeMs: 3 * 60 * 60 * 1000,
  maxChars: 400_000,
  isValid: (live) => isPlainObject(live) && Array.isArray(live.entries) && Array.isArray(live.channels),
  freshen: ({ value, nowMs }) => ({ ...value, entries: value.entries.map((entry) => currentNowEntryOf({ entry, nowMs })) }),
}

export const GUIDE_CACHE = {
  key: 'freetvarr.guideToday',
  version: 1,
  maxAgeMs: 12 * 60 * 60 * 1000,
  maxChars: 1_500_000,
  isValid: (guide, nowMs) => isPlainObject(guide)
    && Array.isArray(guide.channels)
    && isPlainObject(guide.programs)
    && guide.dayStart <= nowMs
    && nowMs < guide.dayEnd,
  freshen: ({ value }) => value,
}

export const FOR_YOU_CACHE = {
  key: 'freetvarr.forYou',
  version: 1,
  maxAgeMs: 12 * 60 * 60 * 1000,
  maxChars: 400_000,
  isValid: (forYou) => isPlainObject(forYou)
    && isPlainObject(forYou.payload)
    && Array.isArray(forYou.upcoming)
    && Array.isArray(forYou.pickable),
  freshen: ({ value, nowMs }) => ({ ...value, payload: withoutEndedForYouOf({ payload: value.payload, nowMs }) }),
}

export const LIBRARY_CACHE = {
  key: 'freetvarr.libraryShows',
  version: 1,
  maxAgeMs: 24 * 60 * 60 * 1000,
  maxChars: 400_000,
  isValid: (library) => isPlainObject(library) && Array.isArray(library.shows),
  freshen: ({ value, nowMs }) => ({ ...value, shows: value.shows.map((show) => withoutEndedRecordingOf({ show, nowMs })) }),
}

export const SCHEDULED_CACHE = {
  key: 'freetvarr.scheduled',
  version: 1,
  maxAgeMs: 6 * 60 * 60 * 1000,
  maxChars: 400_000,
  isValid: (scheduled) => isPlainObject(scheduled)
    && isPlainObject(scheduled.state)
    && Array.isArray(scheduled.state.upcomingRecordings)
    && (scheduled.watchlist == null || Array.isArray(scheduled.watchlist)),
  freshen: ({ value }) => value,
}

export const readViewCache = ({ storage, spec, build, nowMs = Date.now() }) => {
  try {
    const saved = JSON.parse(storage.getItem(spec.key))
    if (saved?.version !== spec.version || saved.build !== build) return null
    const ageMs = nowMs - saved.savedAt
    if (!(ageMs >= 0 && ageMs < spec.maxAgeMs)) return null
    return spec.isValid(saved.value, nowMs) ? spec.freshen({ value: saved.value, nowMs }) : null
  } catch {
    return null
  }
}

export const writeViewCache = ({ storage, spec, build, value, nowMs = Date.now() }) => {
  try {
    const text = JSON.stringify({ version: spec.version, build, savedAt: nowMs, value })
    if (text.length > spec.maxChars) return storage.removeItem(spec.key)
    storage.setItem(spec.key, text)
  } catch {
    forget({ storage, key: spec.key })
  }
}

export const currentNowEntryOf = ({ entry, nowMs }) => {
  if (!entry?.now || entry.now.end > nowMs) return entry
  const next = entry.next
  const nextCovers = Boolean(next) && next.start <= nowMs && next.end > nowMs
  return { ...entry, now: nextCovers ? next : null, next: nextCovers ? null : next }
}

export const withoutEndedForYouOf = ({ payload, nowMs }) => {
  if (!Array.isArray(payload?.sections)) return payload
  return {
    ...payload,
    sections: payload.sections.map((section) => ({
      ...section,
      items: (section.items ?? []).filter((item) => !hasEnded({ item, nowMs })),
    })),
  }
}

export const withoutEndedRecordingOf = ({ show, nowMs }) => {
  const item = show?.inProgress
  if (item?.phase !== 'recording') return show
  const stop = Number(item.stopPadded ?? item.stop)
  if (!Number.isFinite(stop) || stop > nowMs) return show
  return { ...show, recordingNow: false, inProgress: { ...item, phase: 'finishing' } }
}

export const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const forget = ({ storage, key }) => {
  try { storage.removeItem(key) } catch {}
}

const hasEnded = ({ item, nowMs }) => {
  const stop = Number(item.stop)
  if (!Number.isFinite(stop) || stop <= 0) return false
  return (stop < 1e11 ? stop * 1000 : stop) <= nowMs
}
