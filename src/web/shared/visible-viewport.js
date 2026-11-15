export const installVisibleViewport = ({ body = document.body, root = document.documentElement, viewport = window.visualViewport, win = window } = {}) => {
  if (!viewport) return () => {}
  let frame = 0
  let tracking = false
  let editing = isTextEntry(body.ownerDocument?.activeElement)
  const write = () => {
    frame = 0
    root.style.setProperty(VISIBLE_BOTTOM_VAR, `${visibleBottomOf(viewport)}px`)
    root.style.setProperty(KEYBOARD_INSET_VAR, `${keyboardInsetOf({ layoutHeight: win.innerHeight, viewport })}px`)
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
    root.style.removeProperty(KEYBOARD_INSET_VAR)
  }
  const sync = () => {
    const needed = editing || OVERLAY_BODY_CLASSES.some((name) => body.classList.contains(name))
    if (needed && !tracking) start()
    if (!needed && tracking) stop()
  }
  const onFocusChange = (event) => {
    editing = editingAfter(event)
    sync()
  }
  const watcher = new MutationObserver(sync)
  watcher.observe(body, { attributes: true, attributeFilter: ['class'] })
  FOCUS_EVENTS.forEach((type) => body.addEventListener(type, onFocusChange))
  sync()
  return () => {
    watcher.disconnect()
    FOCUS_EVENTS.forEach((type) => body.removeEventListener(type, onFocusChange))
    if (tracking) stop()
  }
}

export const visibleBottomOf = ({ offsetTop, height }) => Math.round(offsetTop + height)

export const keyboardInsetOf = ({ layoutHeight, viewport }) => {
  if ((viewport.scale ?? 1) > ZOOMED_SCALE) return 0
  return Math.max(0, Math.round(layoutHeight - visibleBottomOf(viewport)))
}

export const editingAfter = ({ type, target, relatedTarget }) => isTextEntry(type === 'focusin' ? target : relatedTarget)

export const isTextEntry = (element) => {
  if (!element) return false
  if (element.isContentEditable || element.tagName === 'TEXTAREA') return true
  return element.tagName === 'INPUT' && TEXT_INPUT_TYPES.has((element.getAttribute('type') || 'text').toLowerCase())
}

export const visibleViewportBottom = (win = window) => (win.visualViewport ? visibleBottomOf(win.visualViewport) : win.innerHeight)

const VISIBLE_BOTTOM_VAR = '--visible-viewport-bottom'
const KEYBOARD_INSET_VAR = '--keyboard-inset'
const VIEWPORT_EVENTS = ['resize', 'scroll']
const FOCUS_EVENTS = ['focusin', 'focusout']
const OVERLAY_BODY_CLASSES = ['sheet-open', 'player-open']
const ZOOMED_SCALE = 1.01
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number'])
