export const FOCUS_IMAGE_PATHS = [
  /^\/api\/epg\/image\/[^/]+$/,
  /^\/api\/epg\/show-image$/,
  /^\/api\/epg\/person-image$/,
  /^\/api\/recordings\/[^/]+\/image$/,
  /^\/api\/library\/shows\/[^/]+\/art-pool\/[^/]+$/,
  /^\/api\/library\/recordings\/[^/]+\/art\/[^/]+$/,
  /^\/api\/library\/shows\/[^/]+\/artwork-candidates\/[^/]+$/,
]

export const isFocusImagePath = (pathname) => FOCUS_IMAGE_PATHS.some((pattern) => pattern.test(pathname))

export const focusKeyOf = (url, base = LOCAL_BASE) => {
  const parsed = parsedUrlOf(url, base)
  if (!parsed || parsed.origin !== new URL(base).origin || !isFocusImagePath(parsed.pathname)) return null
  IGNORED_PARAMS.forEach((name) => parsed.searchParams.delete(name))
  parsed.searchParams.sort()
  const query = parsed.searchParams.toString()
  return query ? `${parsed.pathname}?${query}` : parsed.pathname
}

export const focusEntriesOf = (pictures, base = LOCAL_BASE) => pictures
  .filter((picture) => isFocus(picture?.focus))
  .map((picture) => [focusKeyOf(picture.url, base), picture.focus])
  .filter(([key]) => key)

export const requestedWidthOf = (url) => {
  const width = Number(parsedUrlOf(url, LOCAL_BASE)?.searchParams.get('w'))
  return Number.isFinite(width) && width > 0 ? width : null
}

export const objectPositionOf = ({ natural, view, focus, avoid = {} }) => {
  if (!focus || !isSized(natural) || !isSized(view)) return null
  const scale = Math.max(view.width / natural.width, view.height / natural.height)
  const keep = focus.box ?? [focus.x, focus.y, focus.x, focus.y]
  const x = axisPercentOf({
    size: natural.width * scale,
    view: view.width,
    keep: [keep[0], keep[2]],
    anchor: focus.x,
    anchorAt: CENTRE,
    avoidStart: avoid.left ?? 0,
    avoidEnd: avoid.right ?? 0,
  })
  const y = axisPercentOf({
    size: natural.height * scale,
    view: view.height,
    keep: [keep[1], keep[3]],
    anchor: focus.y,
    anchorAt: EYE_LINE_AT,
    avoidStart: avoid.top ?? 0,
    avoidEnd: avoid.bottom ?? 0,
  })
  return `${x}% ${y}%`
}

export const FOCUS_RECHECK_DELAYS_MS = [2000, 5000, 15000]

export const recheckDelayOf = ({ attempt, startedAtMs, nowMs, delays = FOCUS_RECHECK_DELAYS_MS }) => {
  if (attempt >= delays.length) return null
  return Math.max(0, startedAtMs + delays[attempt] - nowMs)
}

export const dueRechecksOf = ({ rechecks, nowMs, slackMs = RECHECK_SLACK_MS, limit = Infinity }) => [...rechecks]
  .filter(([, { dueAt }]) => dueAt <= nowMs + slackMs)
  .sort(([, a], [, b]) => a.dueAt - b.dueAt)
  .slice(0, limit)
  .map(([key]) => key)

export const focusPointInViewOf = ({ natural, view, position, focus }) => {
  if (!focus || !isSized(natural) || !isSized(view)) return null
  const scale = Math.max(view.width / natural.width, view.height / natural.height)
  const [px, py] = String(position || '50% 50%').split(' ').map((part) => (parseFloat(part) || 0) / 100)
  const axis = ({ size, length, percent, at }) => {
    const shown = size * scale
    return toThousandths(((length - shown) * percent + at * shown) / length)
  }
  return {
    x: axis({ size: natural.width, length: view.width, percent: px, at: focus.x }),
    y: axis({ size: natural.height, length: view.height, percent: py ?? 0.5, at: focus.y }),
  }
}

const axisPercentOf = ({ size, view, keep, anchor, anchorAt, avoidStart, avoidEnd }) => {
  const overflow = size - view
  if (overflow < MIN_OVERFLOW_PX) return 50
  const offset = offsetFor({
    start: keep[0] * size,
    end: keep[1] * size,
    anchor: anchor * size,
    view,
    anchorAt,
    usableStart: clampFraction(avoidStart) * view,
    usableEnd: view - clampFraction(avoidEnd) * view,
  })
  return Math.round((clamp(offset, 0, overflow) / overflow) * 1000) / 10
}

const offsetFor = ({ start, end, anchor, view, anchorAt, usableStart, usableEnd }) => {
  const length = end - start
  const centre = (start + end) / 2
  const usable = Math.max(0, usableEnd - usableStart)
  if (length <= view) return clamp(centre - (usableStart + usableEnd) / 2, end - view, start)
  return anchor - (usable >= view * MIN_USABLE_SHARE ? usableStart + usable * anchorAt : view * anchorAt)
}

const parsedUrlOf = (url, base) => {
  try {
    return new URL(url, base)
  } catch {
    return null
  }
}

const isSized = (size) => size?.width > 0 && size?.height > 0

const clampFraction = (value) => clamp(Number(value) || 0, 0, MAX_AVOID)

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const toThousandths = (value) => Math.round(value * 1000) / 1000

const isFocus = (focus) => Number.isFinite(focus?.x) && Number.isFinite(focus?.y)

const LOCAL_BASE = 'http://localhost'
const IGNORED_PARAMS = ['w', 'c']
const CENTRE = 0.5
const EYE_LINE_AT = 0.4
const MIN_OVERFLOW_PX = 1
const MAX_AVOID = 0.6
const MIN_USABLE_SHARE = 0.4
const RECHECK_SLACK_MS = 500
