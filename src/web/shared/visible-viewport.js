export const installVisibleViewport = ({ body = document.body, root = document.documentElement, viewport = window.visualViewport } = {}) => {
  if (!viewport) return () => {}
  let frame = 0
  let tracking = false
  const write = () => {
    frame = 0
    root.style.setProperty(VISIBLE_BOTTOM_VAR, `${Math.round(viewport.offsetTop + viewport.height)}px`)
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(write)
  }
  const start = () => {
    tracking = true
    write()
    VIEWPORT_EVENTS.forEach((type) => viewport.addEventListener(type, schedule))
  }
  const stop = () => {
    tracking = false
    cancelAnimationFrame(frame)
    frame = 0
    VIEWPORT_EVENTS.forEach((type) => viewport.removeEventListener(type, schedule))
    root.style.removeProperty(VISIBLE_BOTTOM_VAR)
  }
  const sync = () => {
    const overlayOpen = OVERLAY_BODY_CLASSES.some((name) => body.classList.contains(name))
    if (overlayOpen && !tracking) start()
    if (!overlayOpen && tracking) stop()
  }
  const watcher = new MutationObserver(sync)
  watcher.observe(body, { attributes: true, attributeFilter: ['class'] })
  sync()
  return () => {
    watcher.disconnect()
    if (tracking) stop()
  }
}

const VISIBLE_BOTTOM_VAR = '--visible-viewport-bottom'
const VIEWPORT_EVENTS = ['resize', 'scroll']
const OVERLAY_BODY_CLASSES = ['sheet-open', 'player-open']
