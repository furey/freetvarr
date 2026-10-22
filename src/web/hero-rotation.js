export const SLIDE_MS = 7_000
export const TOUCH_RESUME_MS = 7_000
export const MAX_TICK_MS = 250
export const RESUME_MIN_MS = 3_000

export const rotationStart = ({ count = 0, reducedMotion = false } = {}) => ({
  index: 0,
  count,
  elapsedMs: 0,
  userPaused: false,
  hovering: false,
  keyboardFocused: false,
  touching: false,
  touchResumeAt: 0,
  hidden: false,
  playerOpen: false,
  overlayOpen: false,
  reducedMotion,
})

export const isAdvancing = (state, nowMs) => !state.reducedMotion
  && state.count > 1
  && !state.userPaused
  && !state.hovering
  && !state.keyboardFocused
  && !state.touching
  && !state.hidden
  && !state.playerOpen
  && !state.overlayOpen
  && nowMs >= state.touchResumeAt

export const showsPauseButton = (state) => !state.reducedMotion && state.count > 1

export const pauseButtonOf = (state, nowMs) => (isAdvancing(state, nowMs)
  ? { action: 'pause', label: 'Pause slides' }
  : { action: 'play', label: 'Play slides' })

export const fillFractionOf = (state) => (state.reducedMotion
  ? 1
  : Math.min(1, state.elapsedMs / SLIDE_MS))

export const wrapIndex = ({ index, count }) => (count > 0 ? ((index % count) + count) % count : 0)

export const nextRotation = (state, event) => {
  const handler = HANDLERS[event.type]
  return handler ? handler(state, event) : state
}

const tick = (state, { nowMs, dtMs }) => {
  if (!isAdvancing(state, nowMs)) return state
  const elapsedMs = state.elapsedMs + Math.min(Math.max(0, dtMs), MAX_TICK_MS)
  if (elapsedMs < SLIDE_MS) return { ...state, elapsedMs }
  return { ...state, index: wrapIndex({ index: state.index + 1, count: state.count }), elapsedMs: 0 }
}

const goTo = (state, { index }) => ({ ...state, index: wrapIndex({ index, count: state.count }), elapsedMs: 0 })

const step = (state, { delta }) => goTo(state, { index: state.index + delta })

const sync = (state, { count, index = state.index }) => {
  const clamped = index >= 0 && index < count ? index : 0
  return { ...state, count, index: clamped, elapsedMs: clamped === state.index ? state.elapsedMs : 0 }
}

const withResumeRoom = (state) => ({ ...state, elapsedMs: Math.min(state.elapsedMs, SLIDE_MS - RESUME_MIN_MS) })

const overlayOpen = (state, { open }) => {
  if (open) return { ...state, overlayOpen: true }
  if (!state.overlayOpen) return state
  return withResumeRoom({ ...state, overlayOpen: false })
}

const keyboardLeave = (state) => (state.keyboardFocused ? withResumeRoom({ ...state, keyboardFocused: false }) : state)

const HANDLERS = {
  tick,
  goTo,
  step,
  sync,
  pointerEnter: (state) => ({ ...state, hovering: true }),
  pointerLeave: (state) => ({ ...state, hovering: false }),
  keyboardFocus: (state) => ({ ...state, keyboardFocused: true }),
  keyboardLeave,
  pause: (state) => ({ ...state, userPaused: true }),
  play: (state) => ({ ...state, userPaused: false, hovering: false, keyboardFocused: false, touching: false, touchResumeAt: 0 }),
  touchStart: (state) => ({ ...state, touching: true }),
  touchEnd: (state, { nowMs }) => ({ ...state, touching: false, touchResumeAt: nowMs + TOUCH_RESUME_MS }),
  hidden: (state, { hidden }) => ({ ...state, hidden }),
  playerOpen: (state, { open }) => ({ ...state, playerOpen: open }),
  overlayOpen,
  reducedMotion: (state, { reduced }) => ({ ...state, reducedMotion: reduced, elapsedMs: 0 }),
}
