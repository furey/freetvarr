import { dueRechecksOf, focusEntriesOf, focusKeyOf, focusPointInViewOf, objectPositionOf, recheckDelayOf } from '/image-focus.js'
import { boundedMap, boundedSet } from '/bounded-cache.js'

export const FOCUS_PLACED_EVENT = 'focus-placed'

export const warmImageFocus = async (urls, { fetchFocus = fetchFocusBatch } = {}) => {
  const keys = [...new Set(urls.map((url) => focusKeyOf(url, location.origin)).filter(Boolean))]
    .filter((key) => !known.get(key)?.focus && !warmed.has(key))
    .slice(0, MAX_KEYS_PER_REQUEST)
  if (!keys.length) return
  keys.forEach((key) => warmed.add(key))
  const result = await fetchFocus(keys, { warm: true }).catch(() => null)
  Object.entries(result?.items ?? {}).forEach(([key, focus]) => known.set(key, { focus, at: Date.now() }))
}

export const rememberImageFocus = (pictures) => focusEntriesOf(pictures, location.origin)
  .forEach(([key, focus]) => known.set(key, { focus, at: Date.now() }))

export const installImageFocus = ({ root = document, fetchFocus = fetchFocusBatch, waitCapMs = WAIT_CAP_MS } = {}) => {
  const waiting = new Map()
  const shown = new Map()
  const rechecks = new Map()
  const keyOf = new WeakMap()
  const queued = new Set()
  let flushTimer = null
  let recheckTimer = null
  let enabled = true

  const place = (img) => {
    const focus = known.get(keyOf.get(img))?.focus
    const natural = { width: img.naturalWidth, height: img.naturalHeight }
    const view = { width: img.clientWidth, height: img.clientHeight }
    const position = objectPositionOf({ natural, view, focus, avoid: avoidOf(img) })
    img.style.objectPosition = position ?? ''
    return { focus, natural, view, position }
  }

  const placeLate = (img) => {
    const from = img.style.objectPosition || getComputedStyle(img).objectPosition
    const { focus, natural, view, position } = place(img)
    if (!focus) return
    const durationMs = prefersReducedMotion() ? 0 : LATE_MOVE_MS
    if (position && position !== from && durationMs && typeof img.animate === 'function') {
      img.animate([{ objectPosition: from }, { objectPosition: position }], { duration: durationMs, easing: LATE_MOVE_EASING })
    }
    img.dispatchEvent(new CustomEvent(FOCUS_PLACED_EVENT, {
      bubbles: true,
      detail: { focus, objectPosition: position, point: focusPointInViewOf({ natural, view, position, focus }), durationMs },
    }))
  }

  const reveal = (img, { fade = false } = {}) => {
    if (fade && !fadesOnItsOwn(img)) img.classList.add(FADING_CLASS)
    img.classList.add(READY_CLASS)
  }

  const settle = (key, img) => {
    waiting.get(key)?.delete(img)
    if (img.isConnected && keyOf.get(img) === key) place(img)
    reveal(img, { fade: true })
  }

  const forget = (img) => {
    keyOf.delete(img)
    resizer?.unobserve(img)
    reveal(img)
  }

  const resizer = typeof ResizeObserver === 'function'
    ? new ResizeObserver((entries) => entries.forEach(({ target }) => {
      if (!target.isConnected) return forget(target)
      if (keyOf.has(target) && target.classList.contains(READY_CLASS)) place(target)
    }))
    : null

  const isFresh = (entry) => entry && (entry.focus || Date.now() - entry.at < MISSING_RETRY_MS)

  const waitFor = (key, img) => {
    if (!waiting.has(key)) waiting.set(key, new Set())
    waiting.get(key).add(img)
    setTimeout(() => giveUpWaiting(key, img), waitCapMs)
    queued.add(key)
    flushTimer ??= setTimeout(flush, FLUSH_DELAY_MS)
  }

  const giveUpWaiting = (key, img) => {
    if (!waiting.get(key)?.has(img)) return
    settle(key, img)
    watchForLateFocus(key, img)
  }

  const watchForLateFocus = (key, img) => {
    if (!shown.has(key)) shown.set(key, new Set())
    shown.get(key).add(img)
  }

  const showingImagesOf = (key) => [...(shown.get(key) || [])].filter((img) => img.isConnected && keyOf.get(img) === key)

  const startRecheck = (key) => {
    if (!enabled || rechecks.has(key)) return
    scheduleRecheck({ key, attempt: 0, startedAtMs: Date.now() })
  }

  const scheduleRecheck = ({ key, attempt, startedAtMs }) => {
    const delayMs = recheckDelayOf({ attempt, startedAtMs, nowMs: Date.now() })
    if (delayMs === null) return stopRecheck(key)
    rechecks.set(key, { attempt, startedAtMs, dueAt: Date.now() + delayMs })
    armRechecks()
  }

  const stopRecheck = (key) => {
    rechecks.delete(key)
    shown.delete(key)
  }

  const armRechecks = () => {
    clearTimeout(recheckTimer)
    recheckTimer = null
    if (!rechecks.size) return
    const nextDueAt = Math.min(...[...rechecks.values()].map((entry) => entry.dueAt))
    recheckTimer = setTimeout(runRechecks, Math.max(0, nextDueAt - Date.now()))
  }

  const runRechecks = async () => {
    recheckTimer = null
    for (const key of [...rechecks.keys()]) if (!showingImagesOf(key).length) stopRecheck(key)
    const keys = dueRechecksOf({ rechecks, nowMs: Date.now(), limit: MAX_KEYS_PER_REQUEST })
    if (keys.length) {
      const result = await fetchFocus(keys).catch(() => null)
      if (result?.enabled === false) enabled = false
      keys.forEach((key) => applyRecheck({ key, focus: enabled ? result?.items?.[key] : null }))
    }
    armRechecks()
  }

  const applyRecheck = ({ key, focus }) => {
    const entry = rechecks.get(key)
    if (!entry) return
    if (!focus) {
      if (!enabled) return stopRecheck(key)
      return scheduleRecheck({ key, attempt: entry.attempt + 1, startedAtMs: entry.startedAtMs })
    }
    known.set(key, { focus, at: Date.now() })
    showingImagesOf(key).forEach(placeLate)
    stopRecheck(key)
  }

  const flush = async () => {
    flushTimer = null
    const keys = [...queued].slice(0, MAX_KEYS_PER_REQUEST)
    if (!keys.length) return
    keys.forEach((key) => queued.delete(key))
    const result = await fetchFocus(keys).catch(() => null)
    if (result?.enabled === false) enabled = false
    keys.forEach((key) => {
      const focus = result?.items?.[key] ?? null
      known.set(key, { focus, at: Date.now() })
      const imgs = [...(waiting.get(key) || [])]
      waiting.delete(key)
      imgs.forEach((img) => settle(key, img))
      if (focus) return placeShownLate(key)
      imgs.forEach((img) => watchForLateFocus(key, img))
      startRecheck(key)
    })
    if (queued.size && enabled) flushTimer ??= setTimeout(flush, FLUSH_DELAY_MS)
  }

  const placeShownLate = (key) => {
    showingImagesOf(key).forEach(placeLate)
    stopRecheck(key)
  }

  const onLoad = (event) => track(event.target)

  const track = (img) => {
    if (!(img instanceof HTMLImageElement)) return
    img.classList.remove(FADING_CLASS)
    const key = enabled ? focusKeyOf(img.currentSrc || img.src, location.origin) : null
    if (!key || getComputedStyle(img).objectFit !== 'cover') {
      if (keyOf.has(img)) img.style.objectPosition = ''
      return forget(img)
    }
    keyOf.set(img, key)
    resizer?.observe(img)
    const entry = known.get(key)
    if (!isFresh(entry)) return waitFor(key, img)
    if (!entry.focus && rechecks.has(key)) watchForLateFocus(key, img)
    place(img)
    reveal(img)
  }

  const sourceWatcher = typeof MutationObserver === 'function'
    ? new MutationObserver((records) => records.forEach(({ target }) => {
      target.classList.remove(READY_CLASS, FADING_CLASS)
    }))
    : null

  const onFadeEnd = (event) => {
    if (event.propertyName === 'opacity') event.target.classList?.remove(FADING_CLASS)
  }

  root.addEventListener('load', onLoad, true)
  FADE_END_EVENTS.forEach((type) => root.addEventListener(type, onFadeEnd, true))
  sourceWatcher?.observe(root, { subtree: true, attributes: true, attributeFilter: ['src', 'srcset'] })
  loadedImagesIn(root).forEach(track)
  return () => {
    sourceWatcher?.disconnect()
    root.removeEventListener('load', onLoad, true)
    FADE_END_EVENTS.forEach((type) => root.removeEventListener(type, onFadeEnd, true))
    resizer?.disconnect()
    clearTimeout(flushTimer)
    clearTimeout(recheckTimer)
  }
}

const known = boundedMap(2000)
const warmed = boundedSet(2000)

const fetchFocusBatch = async (keys, { warm = false } = {}) => {
  const query = keys.map((key) => `k=${encodeURIComponent(key)}`).join('&')
  const res = await fetch(`/api/image-focus?${warm ? 'warm=1&' : ''}${query}`, { cache: 'no-store' })
  return res.ok ? res.json() : null
}

const loadedImagesIn = (root) => [...(root.querySelectorAll?.('img') ?? [])].filter((img) => img.complete && img.naturalWidth > 0)

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

const fadesOnItsOwn = (img) => {
  const style = getComputedStyle(img)
  const durations = style.transitionDuration.split(',').map(parseFloat)
  return style.transitionProperty.split(',').some((property, index) =>
    ['opacity', 'all'].includes(property.trim()) && durations[index % durations.length] > 0)
}

const avoidOf = (img) => {
  const style = getComputedStyle(img)
  return Object.fromEntries(AVOID_SIDES.map((side) => [side, parseFloat(style.getPropertyValue(`--focus-avoid-${side}`)) || 0]))
}

const AVOID_SIDES = ['left', 'right', 'top', 'bottom']
const READY_CLASS = 'is-focus-ready'
const FADING_CLASS = 'is-focus-fading'
const FADE_END_EVENTS = ['transitionend', 'transitioncancel']
const WAIT_CAP_MS = 150
const FLUSH_DELAY_MS = 16
const MAX_KEYS_PER_REQUEST = 40
const MISSING_RETRY_MS = 60 * 1000
const LATE_MOVE_MS = 300
const LATE_MOVE_EASING = 'cubic-bezier(.2,.8,.2,1)'
