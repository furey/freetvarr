import { morphFrames } from '/setup-steps.js'
import { prefersReducedMotion } from '/shared/utils.js'

const CHROME_FADE_MS = 160
const FLIGHT_MS = 780
const CHIP_STAGGER_MS = 70
const CROSSFADE_MS = 240
const BOB_PX = 14
const EASE_GATHER = 'cubic-bezier(.3,0,.2,1)'
const EASE_DROP = 'cubic-bezier(.6,0,.9,.5)'
const EASE_SPRING = 'cubic-bezier(.34,1.7,.64,1)'
const EASE_FADE = 'cubic-bezier(.4,0,1,1)'

export const morphBarsIntoChips = async ({ bars, chrome, mark }) => {
  const chips = [...mark.children]
  if (prefersReducedMotion() || bars.length !== chips.length) return crossfade({ chrome, bars, mark })
  await fadeOut(chrome)
  const flights = bars.map((bar, index) => ({
    bar,
    from: bar.getBoundingClientRect(),
    to: chips[index].getBoundingClientRect(),
    fromRadius: parseFloat(getComputedStyle(bar).borderTopLeftRadius) || 0,
    toRadius: parseFloat(getComputedStyle(chips[index]).borderTopLeftRadius) || 0,
    colour: getComputedStyle(chips[index]).backgroundColor,
  }))
  const layer = ghostLayer(flights)
  document.body.append(layer)
  bars.forEach((bar) => { bar.style.visibility = 'hidden' })
  await Promise.all([...layer.children].map((ghost, index) => fly({ ghost, flight: flights[index], index })))
  return () => layer.remove()
}

const crossfade = async ({ chrome, bars, mark }) => {
  const timing = { duration: CROSSFADE_MS, easing: 'ease', fill: 'forwards' }
  mark.style.visibility = 'visible'
  await Promise.all([
    ...[...chrome, ...bars].map((element) => element.animate([{ opacity: 1 }, { opacity: 0 }], timing).finished),
    mark.animate([{ opacity: 0 }, { opacity: 1 }], timing).finished,
  ]).catch(() => {})
  return () => {}
}

const fadeOut = (elements) => Promise.all(elements.map((element) => element
  .animate([{ opacity: 1 }, { opacity: 0 }], { duration: CHROME_FADE_MS, easing: EASE_FADE, fill: 'forwards' })
  .finished.catch(() => {})))

const ghostLayer = (flights) => {
  const layer = document.createElement('div')
  layer.className = 'setup-morph'
  layer.setAttribute('aria-hidden', 'true')
  flights.forEach(({ to, colour }) => {
    const ghost = document.createElement('span')
    ghost.className = 'setup-morph-chip'
    Object.assign(ghost.style, {
      left: `${to.left}px`,
      top: `${to.top}px`,
      width: `${to.width}px`,
      height: `${to.height}px`,
      background: colour,
    })
    layer.append(ghost)
  })
  return layer
}

const fly = ({ ghost, flight, index }) => {
  const { x, y, sx, sy, startRadius, endRadius } = morphFrames(flight)
  const frames = [
    { offset: 0, transform: `translate(${x}px, ${y}px) scale(${sx}, ${sy})`, borderRadius: startRadius, easing: EASE_GATHER },
    { offset: 0.5, transform: `translate(0, ${-BOB_PX}px) scale(0.85, 1.2)`, borderRadius: endRadius, easing: EASE_DROP },
    { offset: 0.68, transform: 'translate(0, 0) scale(1.35, 0.7)', borderRadius: endRadius, easing: EASE_SPRING },
    { offset: 1, transform: 'none', borderRadius: endRadius },
  ]
  return ghost
    .animate(frames, { duration: FLIGHT_MS, delay: index * CHIP_STAGGER_MS, easing: 'linear', fill: 'both' })
    .finished.catch(() => {})
}
