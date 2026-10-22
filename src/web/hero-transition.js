export const HERO_MOTION = {
  imageMs: 420,
  imageNudgeScale: 1.02,
  textOutMs: 140,
  textInMs: 380,
  textDelayMs: 120,
  drift: true,
}

export const REDUCED_MOTION = {
  imageMs: 160,
  imageNudgeScale: null,
  textOutMs: 0,
  textInMs: 0,
  textDelayMs: 0,
  drift: false,
}

export const DRIFT = { scale: 1.03 }
export const DECODE_WAIT_MS = 400

export const heroMotionOf = ({ reducedMotion }) => (reducedMotion ? REDUCED_MOTION : HERO_MOTION)

export const directionOf = ({ from, to }) => (to < from ? -1 : 1)

export const entranceSettleMsOf = ({ motion }) => Math.max(motion.imageMs, motion.textDelayMs + motion.textInMs)

export const changeKindOf = (eventType) => (MANUAL_EVENTS.has(eventType) ? 'manual' : 'automatic')

export const imageNudgeOf = ({ motion, direction, boxWidth, kind = 'manual' }) => {
  if (!motion.imageNudgeScale || kind === 'automatic') return null
  const overscanPx = (boxWidth * (motion.imageNudgeScale - 1)) / 2
  return `translateX(${(direction * overscanPx).toFixed(1)}px) scale(${motion.imageNudgeScale})`
}

export const playSlideChange = ({ incoming, outgoing, direction, motion, kind }) => {
  let live = true
  const animations = []
  const add = (animation) => {
    animation.pause()
    animations.push(animation)
  }
  const cancel = () => {
    live = false
    animations.forEach((animation) => animation.cancel())
  }
  settleSlide(incoming)
  settleSlide(outgoing)
  const fade = incoming.animate([{ opacity: 0 }, { opacity: 1 }], { duration: motion.imageMs, easing: FADE_IN, fill: 'backwards' })
  add(fade)
  const nudge = imageNudgeOf({ motion, direction, boxWidth: incoming.offsetWidth, kind })
  const backdrop = incoming.querySelector('.hero-slide-backdrop')
  if (nudge && backdrop) {
    add(backdrop.animate([{ transform: nudge }, { transform: 'none' }], { duration: motion.imageMs + 120, easing: EASE_OUT, fill: 'backwards' }))
  }
  if (motion.textInMs) entranceOf({ slide: incoming, motion }).forEach(add)
  if (motion.textOutMs && outgoing) {
    visiblePartsOf(outgoing).forEach((part) => add(part.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      { duration: motion.textOutMs, easing: FADE_OUT, fill: 'forwards' },
    )))
  }
  const started = decodedWithin([incoming, outgoing].filter(Boolean).map(slideImageOf).filter(Boolean))
    .then(() => {
      if (live) animations.forEach((animation) => animation.play())
      return live
    })
  const finished = started
    .then((playing) => playing && Promise.allSettled(animations.map((animation) => animation.finished)))
    .then(() => { if (live) cancel() })
  const faded = started.then((playing) => playing && fade.finished.then(() => live, () => false))
  return { animations, started, faded, finished, cancel, isLive: () => live }
}

export const settleSlide = (slide) => {
  if (!slide) return
  ownedPartsOf(slide).forEach((part) => part.getAnimations().forEach((animation) => animation.cancel()))
}

export const zoomOriginOf = ({ natural, view, focus, position, zoom = DRIFT.scale }) => {
  if (!focus || !position || !(zoom > 1) || !isSized(natural) || !isSized(view)) return null
  const scale = Math.max(view.width / natural.width, view.height / natural.height)
  const keep = focus.box ?? [focus.x, focus.y, focus.x, focus.y]
  const x = originPercentOf({ size: natural.width * scale, view: view.width, keep: [keep[0], keep[2]], placed: position.x, zoom })
  const y = originPercentOf({ size: natural.height * scale, view: view.height, keep: [keep[1], keep[3]], placed: position.y, zoom })
  return `${x}% ${y}%`
}

export const positionPercentOf = ({ objectPosition, overflow }) => {
  const [x = '50%', y = '50%'] = String(objectPosition || '').trim().split(/\s+/)
  return { x: percentOfToken(x, overflow.x), y: percentOfToken(y, overflow.y) }
}

export const startDrift = async ({ slide, durationMs, direction = 1, focusOf = noFocus }) => {
  const image = slide && slideImageOf(slide)
  if (!image) return null
  await image.decode().catch(() => null)
  if (!image.isConnected) return null
  const pendingFocus = Promise.resolve(focusOf(image)).catch(() => null)
  const origin = originOfImage({ image, focus: await withinMs(pendingFocus, FOCUS_WAIT_MS) })
  image.style.transformOrigin = origin ?? ''
  const timing = { duration: durationMs, easing: 'linear', fill: 'forwards' }
  const zoom = image.animate([{ scale: '1' }, { scale: String(DRIFT.scale) }], timing)
  const overscanPx = (slide.offsetWidth * (DRIFT.scale - 1)) / 2
  const endX = (-direction * overscanPx * 0.6).toFixed(1)
  const sideways = origin ? null : image.animate([{ translate: '0px' }, { translate: `${endX}px` }], timing)
  const animations = [zoom, sideways].filter(Boolean)
  let live = true
  let knownFocus = null
  let placedAt = image.style.objectPosition
  const refocus = (focus) => {
    const next = live && originOfImage({ image, focus })
    if (!next) return
    knownFocus = focus
    sideways?.pause()
    if (next !== image.style.transformOrigin) easeOrigin({ image, origin: next })
  }
  const onPlaced = async (event) => refocus(focusFromDetail(event.detail) ?? await focusOf(image, { fresh: true }))
  const placementWatcher = new MutationObserver(() => {
    if (image.style.objectPosition === placedAt) return
    placedAt = image.style.objectPosition
    if (knownFocus) refocus(knownFocus)
  })
  image.addEventListener(FOCUS_PLACED_EVENT, onPlaced)
  placementWatcher.observe(image, { attributes: true, attributeFilter: ['style'] })
  pendingFocus.then(refocus)
  return {
    play: () => animations.forEach((animation) => animation.play()),
    pause: () => animations.forEach((animation) => animation.pause()),
    cancel: () => {
      live = false
      placementWatcher.disconnect()
      image.removeEventListener(FOCUS_PLACED_EVENT, onPlaced)
      animations.forEach((animation) => animation.cancel())
    },
  }
}

export const predecode = (slide) => {
  const image = slide && slideImageOf(slide)
  if (image) image.decode().catch(() => null)
}

const entranceOf = ({ slide, motion }) => visiblePartsOf(slide).map((part) => part.animate(
  [{ opacity: 0 }, { opacity: 1 }],
  { duration: motion.textInMs, delay: motion.textDelayMs, easing: ENTRANCE_EASE, fill: 'backwards' },
))

const bodyPartsOf = (slide) => [...slide.querySelectorAll(BODY_PARTS_SELECTOR)]

const visiblePartsOf = (slide) => bodyPartsOf(slide).filter((part) => part.getClientRects().length > 0)

const ownedPartsOf = (slide) => [slide, slide.querySelector('.hero-slide-backdrop'), ...bodyPartsOf(slide)].filter(Boolean)

const slideImageOf = (slide) => slide.querySelector('.ui-hero-art')

const noFocus = async () => null

const originOfImage = ({ image, focus }) => {
  if (!focus || !image.isConnected) return null
  const natural = { width: image.naturalWidth, height: image.naturalHeight }
  const view = { width: image.clientWidth, height: image.clientHeight }
  const scale = Math.max(view.width / natural.width, view.height / natural.height)
  const overflow = { x: natural.width * scale - view.width, y: natural.height * scale - view.height }
  const position = positionPercentOf({ objectPosition: getComputedStyle(image).objectPosition, overflow })
  return zoomOriginOf({ natural, view, focus, position })
}

const easeOrigin = ({ image, origin }) => {
  const from = getComputedStyle(image).transformOrigin
  image.style.transformOrigin = origin
  image.animate([{ transformOrigin: from }, { transformOrigin: origin }], { duration: ORIGIN_EASE_MS, easing: EASE_OUT })
}

const focusFromDetail = (detail) => {
  const focus = detail?.focus ?? detail
  return Number.isFinite(focus?.x) && Number.isFinite(focus?.y) ? focus : null
}

const withinMs = (promise, waitMs) => Promise.race([
  promise,
  new Promise((resolve) => { setTimeout(() => resolve(null), waitMs) }),
])

const originPercentOf = ({ size, view, keep, placed, zoom }) => {
  const shift = (size - view) * (placed / 100)
  const [start, end] = keep.map((fraction) => fraction * size - shift)
  const centre = (start + end) / 2
  const lowest = (zoom * end - view) / (zoom - 1)
  const highest = (zoom * start) / (zoom - 1)
  const origin = lowest <= highest ? clamp(centre, lowest, highest) : centre
  return Math.round((clamp(origin, 0, view) / view) * 1000) / 10
}

const percentOfToken = (token, overflow) => {
  if (token in POSITION_KEYWORDS) return POSITION_KEYWORDS[token]
  if (token.endsWith('%')) return parseFloat(token)
  const px = parseFloat(token)
  return Number.isFinite(px) && overflow > 0 ? clamp((-px / overflow) * 100, 0, 100) : 50
}

const isSized = (size) => size?.width > 0 && size?.height > 0

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const decodedWithin = (images, waitMs = DECODE_WAIT_MS) => Promise.race([
  Promise.allSettled(images.map((image) => image.decode())),
  new Promise((resolve) => { setTimeout(resolve, waitMs) }),
])

const FOCUS_PLACED_EVENT = 'focus-placed'
const FOCUS_WAIT_MS = 400
const ORIGIN_EASE_MS = 600
const POSITION_KEYWORDS = { left: 0, top: 0, center: 50, right: 100, bottom: 100 }
const MANUAL_EVENTS = new Set(['goTo', 'step'])
const BODY_PARTS_SELECTOR = '.hero-slide-body > *'
const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
const ENTRANCE_EASE = 'cubic-bezier(0.25, 0.6, 0.35, 1)'
const FADE_IN = 'cubic-bezier(0, 0, 0.58, 1)'
const FADE_OUT = 'cubic-bezier(0.42, 0, 1, 1)'
