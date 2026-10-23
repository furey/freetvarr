import { showTitleKey } from './show-artwork.js'

export const UNKNOWN_TITLE_BUDGET = 60
export const UNKNOWN_TITLE_WINDOW_MS = 60 * 60 * 1000
export const KNOWN_TITLES_TTL_MS = 5 * 60 * 1000

export const lookupAllowed = (title) => Promise.resolve()
  .then(() => sharedGate.allows(title))
  .catch(() => false)

export const useLookupGate = (gate) => {
  sharedGate = gate ?? OPEN_GATE
}

export const createLookupGate = ({
  isKnownTitle,
  budget = UNKNOWN_TITLE_BUDGET,
  windowMs = UNKNOWN_TITLE_WINDOW_MS,
  now = Date.now,
}) => {
  const spent = []
  const allowedUnknown = new Map()

  const takeBudget = (key) => {
    const at = now()
    while (spent.length && spent[0] <= at - windowMs) spent.shift()
    if (allowedUnknown.has(key) && allowedUnknown.get(key) > at - windowMs) return true
    if (spent.length >= budget) return false
    spent.push(at)
    allowedUnknown.delete(key)
    allowedUnknown.set(key, at)
    while (allowedUnknown.size > budget * 4) allowedUnknown.delete(allowedUnknown.keys().next().value)
    return true
  }

  const allows = async (title) => {
    const key = showTitleKey(title)
    if (!key) return false
    if (await Promise.resolve().then(() => isKnownTitle(key)).catch(() => false)) return true
    return takeBudget(key)
  }

  return { allows }
}

export const createKnownTitles = ({ loadTitles, ttlMs = KNOWN_TITLES_TTL_MS, now = Date.now }) => {
  let keys = null
  let loadedAt = 0
  let loading = null

  const refresh = () => {
    loading ??= Promise.resolve()
      .then(loadTitles)
      .then((titles) => {
        keys = new Set([...titles].map(showTitleKey).filter(Boolean))
        loadedAt = now()
      })
      .catch(() => {
        loadedAt = now()
      })
      .finally(() => { loading = null })
    return loading
  }

  return async (key) => {
    if (!keys || now() - loadedAt >= ttlMs) {
      const pending = refresh()
      if (!keys) await pending
    }
    return Boolean(keys?.has(key))
  }
}

const OPEN_GATE = { allows: async () => true }

let sharedGate = OPEN_GATE
