export const PRESS_SLOP_PX = 8
export const PRESS_STILL_MS = 80

export const createPressIntent = ({ target, slopPx = PRESS_SLOP_PX, stillMs = PRESS_STILL_MS }) => {
  let cancelArmed = () => {}

  const arm = ({ event, onIntent }) => {
    cancelArmed()
    const start = { x: event.clientX, y: event.clientY }
    const fire = () => {
      cancelArmed()
      onIntent()
    }
    const onMove = (move) => {
      if (Math.hypot(move.clientX - start.x, move.clientY - start.y) > slopPx) cancelArmed()
    }
    const listeners = [['pointermove', onMove], ['pointercancel', () => cancelArmed()], ['pointerup', fire]]
    const timer = setTimeout(fire, stillMs)
    listeners.forEach(([type, listener]) => target.addEventListener(type, listener, { capture: true, passive: true }))
    cancelArmed = () => {
      clearTimeout(timer)
      listeners.forEach(([type, listener]) => target.removeEventListener(type, listener, { capture: true }))
      cancelArmed = () => {}
    }
  }

  return { arm, cancel: () => cancelArmed() }
}
