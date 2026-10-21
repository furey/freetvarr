import { currentNowEntryOf, isPlainObject, readViewCache, withoutEndedForYouOf, writeViewCache } from './view-cache.js'

export const HOME_CACHE_KEY = 'freetvarr.home'
export const HOME_CACHE_VERSION = 2
export const HOME_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000
export const HOME_CACHE_MAX_CHARS = 1_000_000
export const HOME_LIST_FIELDS = [
  'inProgress', 'newRecordings', 'nowEntries', 'upcoming', 'activeProgramIds', 'shows', 'watchlist', 'movies',
]

export const isHomeShape = (home) => Boolean(home)
  && typeof home === 'object'
  && HOME_LIST_FIELDS.every((field) => Array.isArray(home[field]))
  && isPlainObject(home.heroPools)
  && (home.forYouPayload === null || isPlainObject(home.forYouPayload))

export const freshHomeOf = ({ home, nowMs }) => ({
  ...home,
  nowEntries: home.nowEntries.map((entry) => currentNowEntryOf({ entry, nowMs })),
  forYouPayload: withoutEndedForYouOf({ payload: home.forYouPayload, nowMs }),
})

export const HOME_CACHE = {
  key: HOME_CACHE_KEY,
  version: HOME_CACHE_VERSION,
  maxAgeMs: HOME_CACHE_MAX_AGE_MS,
  maxChars: HOME_CACHE_MAX_CHARS,
  isValid: isHomeShape,
  freshen: ({ value }) => value,
}

export const readHomeCache = ({ storage, build, nowMs = Date.now() }) =>
  readViewCache({ storage, spec: HOME_CACHE, build, nowMs })

export const writeHomeCache = ({ storage, build, home, nowMs = Date.now() }) =>
  writeViewCache({ storage, spec: HOME_CACHE, build, value: home, nowMs })
