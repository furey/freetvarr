import {
  localDay,
  shouldPlayIntro,
  readIntroMemory,
  rememberIntroPlayed,
  introGeometry,
  flightTransform,
} from '/brand-intro.js'
import { prefersReducedMotion } from '/shared/utils.js'

const SEGMENTS = [
  { text: 'Free', tone: 'free' },
  { text: 'tv', tone: 'tv' },
  { text: 'arr', tone: 'arr' },
]
const FONT_WAIT_MS = 600
const FLIGHT_MS = 380
const FADE_MS = 200
const HOLD_MS = 700
const SKIP_EVENT = 'brand-intro-skip'
const ACTIVE_CLASS = 'is-brand-intro-active'
const TARGET_SELECTOR = '[data-intro-target]'

let playing = null

export const startBrandIntro = () => {
  const today = localDay(new Date())
  const memory = readIntroMemory({ local: () => window.localStorage, session: () => window.sessionStorage })
  const hidden = document.visibilityState === 'hidden'
  if (!shouldPlayIntro({ ...memory, reducedMotion: prefersReducedMotion(), hidden, today })) return
  rememberIntroPlayed({ local: () => window.localStorage, session: () => window.sessionStorage, today })
  playBrandIntro()
}

export const playBrandIntro = () => {
  if (playing || prefersReducedMotion()) return playing
  playing = runIntro().finally(() => { playing = null })
  return playing
}

const runIntro = async () => {
  const overlay = buildOverlay()
  document.body.append(overlay)
  document.documentElement.classList.add(ACTIVE_CLASS)
  const stopSkipping = listenForSkip(overlay)
  await fontReady()
  layoutOverlay(overlay)
  overlay.classList.add('is-ready', 'is-playing')
  if (overlay.classList.contains('is-skipped')) finishAll(overlay)
  await animationsDone(overlay)
  await holdUnlessSkipped(overlay)
  stopSkipping()
  overlay.classList.add('is-leaving')
  await leave(overlay)
  overlay.remove()
  document.documentElement.classList.remove(ACTIVE_CLASS)
}

const buildOverlay = () => {
  const overlay = document.createElement('div')
  overlay.className = 'brand-intro'
  overlay.setAttribute('aria-hidden', 'true')
  overlay.innerHTML = `
    <div class="brand-intro-backdrop"></div>
    <div class="brand-intro-word">${SEGMENTS.map(segmentMarkup).join('')}</div>
  `
  return overlay
}

const segmentMarkup = ({ text, tone }) => `<span class="brand-intro-segment is-${tone}"><span class="brand-intro-clip"><span class="brand-intro-letters">${text}</span></span><span class="brand-intro-chip"><span class="brand-intro-bar"></span></span></span>`

const layoutOverlay = (overlay) => {
  const word = overlay.querySelector('.brand-intro-word')
  const segments = [...word.querySelectorAll('.brand-intro-segment')]
  const style = getComputedStyle(word)
  const fontSize = parseFloat(style.fontSize)
  const { clipHeight, chips } = introGeometry({
    fontSize,
    ink: measureInk(style),
    wordWidth: word.offsetWidth,
    segments: segments.map((segment) => ({ left: segment.offsetLeft, width: segment.offsetWidth })),
  })
  segments.forEach((segment, index) => {
    const chip = chips[index]
    segment.querySelector('.brand-intro-clip').style.height = `${clipHeight}px`
    setVars(segment, {
      '--chip-left': `${chip.left}px`,
      '--chip-top': `${chip.top}px`,
      '--chip-w': `${chip.width}px`,
      '--chip-h': `${chip.height}px`,
      '--chip-radius': `${chip.radius}px`,
      '--dx': `${chip.dx}px`,
      '--dy': `${chip.dy}px`,
      '--bob': `${chip.bob}px`,
      '--sx': chip.sx,
      '--sy': chip.sy,
      '--delay': `${chip.delayMs}ms`,
    })
  })
}

const listenForSkip = (overlay) => {
  const skip = () => {
    overlay.classList.add('is-skipped')
    finishAll(overlay)
    overlay.dispatchEvent(new Event(SKIP_EVENT))
  }
  const events = ['pointerdown', 'keydown']
  events.forEach((type) => window.addEventListener(type, skip, { capture: true }))
  return () => events.forEach((type) => window.removeEventListener(type, skip, { capture: true }))
}

const finishAll = (overlay) => overlay.getAnimations({ subtree: true })
  .forEach((animation) => animation.finish())

const holdUnlessSkipped = (overlay) => {
  if (overlay.classList.contains('is-skipped')) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, HOLD_MS)
    overlay.addEventListener(SKIP_EVENT, () => {
      clearTimeout(timer)
      resolve()
    }, { once: true })
  })
}

const animationsDone = async (overlay) => {
  await nextFrame()
  await Promise.all(overlay.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})))
}

const leave = async (overlay) => {
  const target = visibleTarget()
  if (!target) return fadeOut(overlay)
  return flyInto({ overlay, target })
}

const flyInto = async ({ overlay, target }) => {
  const word = overlay.querySelector('.brand-intro-word')
  const { x, y, scale } = flightTransform({
    from: word.getBoundingClientRect(),
    to: target.getBoundingClientRect(),
  })
  const timing = { duration: FLIGHT_MS, easing: 'cubic-bezier(.2,0,0,1)', fill: 'forwards' }
  await Promise.all([
    word.animate([{ transform: 'none' }, { transform: `translate(${x}px, ${y}px) scale(${scale})` }], timing).finished,
    overlay.querySelector('.brand-intro-backdrop').animate([{ opacity: 1 }, { opacity: 0 }], timing).finished,
  ]).catch(() => {})
}

const fadeOut = (overlay) => overlay
  .animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' })
  .finished.catch(() => {})

const visibleTarget = () => [...document.querySelectorAll(TARGET_SELECTOR)]
  .find((element) => {
    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight
  })

const fontReady = () => Promise.race([
  document.fonts?.load('800 84px Figtree').catch(() => {}),
  new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS)),
])

const measureInk = (style) => {
  const context = document.createElement('canvas').getContext('2d')
  context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
  const capMetrics = context.measureText('F')
  return {
    cap: capMetrics.actualBoundingBoxAscent,
    fontAscent: capMetrics.fontBoundingBoxAscent,
    fontHeight: capMetrics.fontBoundingBoxAscent + capMetrics.fontBoundingBoxDescent,
  }
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()))

const setVars = (element, vars) => Object.entries(vars)
  .forEach(([name, value]) => element.style.setProperty(name, value))
