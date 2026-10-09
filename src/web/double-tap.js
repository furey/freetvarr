export const SKIP_STEP_S = 10
export const DOUBLE_TAP_MS = 300
export const SKIP_CHAIN_MS = 700
export const TAP_MAX_MOVE_PX = 10
export const TOUCH_TAP_MAX_MS = 300

const BACK_ARROW = '◀︎'
const FORWARD_ARROW = '▶︎'

export const emptyTapState = () => ({ side: null, lastAt: -Infinity, chainUntil: 0, total: 0, base: 0 })

export const zoneOf = ({ x, y, width, height, bottomInsetPx = 0 }) => {
  if (!width || !height || x < 0 || x > width || y < 0 || y > height - bottomInsetPx) return null
  if (x < width / 3) return 'back'
  if (x > (width * 2) / 3) return 'forward'
  return null
}

export const isTap = ({ startX, startY, endX, endY, ms, pointerType }) => {
  const moved = Math.hypot(endX - startX, endY - startY)
  const quickEnough = pointerType !== 'touch' || ms < TOUCH_TAP_MAX_MS
  return moved < TAP_MAX_MOVE_PX && quickEnough
}

export const registerTap = (state, { side, at, position, force = false }) => {
  if (!side) return { state: emptyTapState(), result: { kind: 'center' } }
  const sameSide = state.side === side
  const chained = sameSide && at < state.chainUntil
  const doubled = sameSide && at - state.lastAt < DOUBLE_TAP_MS
  if (!chained && !doubled && !force) {
    return {
      state: { ...emptyTapState(), side, lastAt: at, base: position },
      result: { kind: 'first' },
    }
  }
  const total = chained ? state.total + SKIP_STEP_S : SKIP_STEP_S
  const base = chained ? state.base : position
  return {
    state: { side, lastAt: at, chainUntil: at + SKIP_CHAIN_MS, total, base },
    result: { kind: 'skip', side, total, base },
  }
}

export const nativeClickPlan = ({ tap, pointerType }) => {
  if (tap === 'skip') return 'swallow'
  if (tap === 'first' && pointerType === 'mouse') return 'toggle-later'
  return 'pass'
}

export const clampSkip = ({ base, delta, floor = null, ceiling = null }) => {
  const wanted = base + delta
  const lowest = floor ?? wanted
  const highest = ceiling ?? wanted
  const to = Math.max(lowest, Math.min(highest, wanted))
  const moved = to - base
  const applied = Math.round(Math.abs(moved))
  if (!applied || Math.sign(moved) !== Math.sign(delta)) return { to: base, applied: 0 }
  return { to, applied }
}

export const skipLabel = ({ side, seconds }) =>
  side === 'back' ? `${BACK_ARROW} -${seconds}` : `+${seconds} ${FORWARD_ARROW}`

export const skipSpoken = ({ side, seconds }) =>
  `${side === 'back' ? 'Back' : 'Forward'} ${seconds} seconds`
