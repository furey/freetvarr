export const ROTATE_QUIET_MS = 1_500
export const PHONE_MAX_SHORT_SIDE = 500

export const initialRotateState = (landscape) => ({ landscape: Boolean(landscape), armed: !landscape, quietUntil: 0 })

export const rotateStepOf = (state, { landscape, eligible, fullscreen, nowMs }) => {
  const turned = Boolean(landscape)
  if (turned === state.landscape) return { state, enter: false }
  const quiet = nowMs < state.quietUntil
  if (!turned) return { state: { ...state, landscape: false, armed: quiet ? state.armed : true }, enter: false }
  const enter = state.armed && !quiet && eligible && !fullscreen
  return {
    state: { ...state, landscape: true, armed: false, quietUntil: enter ? nowMs + ROTATE_QUIET_MS : state.quietUntil },
    enter,
  }
}

export const fullscreenExitedState = (state, nowMs) =>
  ({ ...state, armed: false, quietUntil: nowMs + ROTATE_QUIET_MS })

export const isPhoneScreen = ({ coarsePointer, screenWidth, screenHeight }) =>
  Boolean(coarsePointer) && Math.min(screenWidth, screenHeight) <= PHONE_MAX_SHORT_SIDE
