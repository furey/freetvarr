import { prefersReducedMotion } from '/shared/utils.js'

const LANDING_LIMIT_MS = 4000
const LANDING_SETTLE_MS = 350
const LINKED_CLASS = 'is-linked'
const LINKED_MS = 1600

let landing = null

export const isLandingPending = () => Boolean(landing)

export const landOnSetting = (setting) => {
  const token = { setting, startedAt: performance.now() }
  landing = token
  requestAnimationFrame(() => seek(token))
}

const seek = (token) => {
  if (landing !== token) return
  const elapsed = performance.now() - token.startedAt
  if (elapsed > LANDING_LIMIT_MS) {
    landing = null
    return
  }
  const target = visibleTarget(token.setting)
  if (!target || elapsed < settleMs()) {
    requestAnimationFrame(() => seek(token))
    return
  }
  landing = null
  land(target)
}

const settleMs = () => (prefersReducedMotion() ? 0 : LANDING_SETTLE_MS)

const visibleTarget = (setting) => {
  const target = document.querySelector(`.settings-content [data-setting="${setting}"]`)
  if (!target) return null
  openContainers(target)
  return target.getClientRects().length ? target : null
}

const openContainers = (target) => {
  for (let el = target.parentElement; el; el = el.parentElement) {
    if (el.tagName === 'DETAILS') el.open = true
  }
}

const land = (target) => {
  const still = prefersReducedMotion() || document.visibilityState !== 'visible'
  target.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' })
  if (prefersReducedMotion()) return
  restartMark(target)
}

const restartMark = (target) => {
  target.classList.remove(LINKED_CLASS)
  target.getBoundingClientRect()
  target.classList.add(LINKED_CLASS)
  setTimeout(() => target.classList.remove(LINKED_CLASS), LINKED_MS)
}
