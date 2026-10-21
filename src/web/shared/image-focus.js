import { focusKeyOf, objectPositionOf } from '/image-focus.js'

export const installImageFocus = ({ root = document, fetchFocus = fetchFocusBatch } = {}) => {
  const known = new Map()
  const waiting = new Map()
  const keyOf = new WeakMap()
  const queued = new Set()
  let flushTimer = null
  let enabled = true

  const place = (img) => {
    const focus = known.get(keyOf.get(img))?.focus
    const position = objectPositionOf({
      natural: { width: img.naturalWidth, height: img.naturalHeight },
      view: { width: img.clientWidth, height: img.clientHeight },
      focus,
      avoid: avoidOf(img),
    })
    img.style.objectPosition = position ?? ''
  }

  const forget = (img) => {
    keyOf.delete(img)
    resizer?.unobserve(img)
  }

  const resizer = typeof ResizeObserver === 'function'
    ? new ResizeObserver((entries) => entries.forEach(({ target }) => {
      if (!target.isConnected) return forget(target)
      if (keyOf.has(target)) place(target)
    }))
    : null

  const isFresh = (entry) => entry && (entry.focus || Date.now() - entry.at < MISSING_RETRY_MS)

  const waitFor = (key, img) => {
    if (!waiting.has(key)) waiting.set(key, new Set())
    waiting.get(key).add(img)
    queued.add(key)
    flushTimer ??= setTimeout(flush, FLUSH_DELAY_MS)
  }

  const flush = async () => {
    flushTimer = null
    const keys = [...queued].slice(0, MAX_KEYS_PER_REQUEST)
    keys.forEach((key) => queued.delete(key))
    const result = await fetchFocus(keys).catch(() => null)
    if (result?.enabled === false) enabled = false
    keys.forEach((key) => {
      known.set(key, { focus: result?.items?.[key] ?? null, at: Date.now() })
      const imgs = waiting.get(key) || []
      waiting.delete(key)
      imgs.forEach((img) => { if (img.isConnected && keyOf.get(img) === key) place(img) })
    })
    if (queued.size && enabled) flushTimer = setTimeout(flush, FLUSH_DELAY_MS)
  }

  const onLoad = (event) => {
    const img = event.target
    if (!(img instanceof HTMLImageElement)) return
    const key = enabled ? focusKeyOf(img.currentSrc || img.src, location.origin) : null
    if (!key || getComputedStyle(img).objectFit !== 'cover') {
      if (keyOf.has(img)) img.style.objectPosition = ''
      return forget(img)
    }
    keyOf.set(img, key)
    resizer?.observe(img)
    if (isFresh(known.get(key))) return place(img)
    waitFor(key, img)
  }

  root.addEventListener('load', onLoad, true)
  return () => {
    root.removeEventListener('load', onLoad, true)
    resizer?.disconnect()
    clearTimeout(flushTimer)
  }
}

const fetchFocusBatch = async (keys) => {
  const query = keys.map((key) => `k=${encodeURIComponent(key)}`).join('&')
  const res = await fetch(`/api/image-focus?${query}`, { cache: 'no-store' })
  return res.ok ? res.json() : null
}

const avoidOf = (img) => {
  const style = getComputedStyle(img)
  return Object.fromEntries(AVOID_SIDES.map((side) => [side, parseFloat(style.getPropertyValue(`--focus-avoid-${side}`)) || 0]))
}

const AVOID_SIDES = ['left', 'right', 'top', 'bottom']
const FLUSH_DELAY_MS = 16
const MAX_KEYS_PER_REQUEST = 40
const MISSING_RETRY_MS = 60 * 1000
