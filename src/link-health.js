import { artworkClient } from './fallback-artwork.js'

export const createLinkHealth = ({
  probe = (url) => artworkClient.isReachable({ url }),
  now = Date.now,
  ttlMs = LINK_CHECK_TTL_MS,
} = {}) => {
  const states = new Map()
  const inflight = new Map()

  const check = (host) => {
    if (inflight.has(host)) return inflight.get(host)
    const pending = Promise.resolve()
      .then(() => probe(`https://${host}/`))
      .catch(() => true)
      .then((up) => { states.set(host, { up: up !== false, checkedAt: now() }) })
      .finally(() => inflight.delete(host))
    inflight.set(host, pending)
    return pending
  }

  const isUp = (url) => {
    const host = httpsHostOf(url)
    if (!host) return false
    const state = states.get(host)
    if (!state || now() - state.checkedAt >= ttlMs) check(host)
    return state ? state.up : true
  }

  const linkOf = (url) => (url && isUp(url) ? url : null)

  const settled = () => Promise.all(inflight.values())

  return { isUp, linkOf, settled }
}

const httpsHostOf = (url) => {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' ? parsed.hostname : null
  } catch {
    return null
  }
}

const LINK_CHECK_TTL_MS = 5 * 60 * 1000

export const linkHealth = createLinkHealth()
