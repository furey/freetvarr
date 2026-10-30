import { onUnmounted } from '/vendor/vue.esm-browser.prod.js'

export const LONG_PRESS_MS = 500
export const LONG_PRESS_SLOP_PX = 10

export const useLongPress = (onPress) => {
  let press = null
  let swallowing = false
  let lastPointerType = ''

  const clear = () => {
    clearTimeout(press?.timer)
    press = null
    CANCEL_EVENTS.forEach((type) => window.removeEventListener(type, cancelOnGesture, true))
  }

  const cancelOnGesture = (event) => {
    if (event.type === 'touchstart' && event.touches.length < 2) return
    clear()
  }

  const watchForGestures = () => {
    CANCEL_EVENTS.forEach((type) => window.addEventListener(type, cancelOnGesture, { capture: true, passive: true }))
  }

  const stopSwallowing = () => {
    swallowing = false
    SWALLOWED_EVENTS.forEach((type) => window.removeEventListener(type, swallowEvent, true))
  }

  const startSwallowing = () => {
    swallowing = true
    clearSelection()
    SWALLOWED_EVENTS.forEach((type) => window.addEventListener(type, swallowEvent, { capture: true, passive: false }))
  }

  const onPointerDown = (event, payload) => {
    lastPointerType = event.pointerType
    if (event.pointerType === 'mouse') return
    if (press || !event.isPrimary) return clear()
    stopSwallowing()
    watchForGestures()
    press = {
      x: event.clientX,
      y: event.clientY,
      timer: setTimeout(() => {
        clear()
        if (isPageZoomed()) return
        startSwallowing()
        onPress(payload)
      }, LONG_PRESS_MS),
    }
  }

  const onPointerMove = (event) => {
    if (!press) return
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > LONG_PRESS_SLOP_PX) clear()
  }

  const onPointerEnd = () => {
    clear()
    if (!swallowing) return
    clearSelection()
    setTimeout(stopSwallowing, CLICK_AFTER_RELEASE_MS)
  }

  const onContextMenu = (event, payload) => {
    event.preventDefault()
    if (lastPointerType !== 'touch' && lastPointerType !== 'pen') onPress(payload)
  }

  onUnmounted(() => {
    clear()
    stopSwallowing()
  })

  return { onPointerDown, onPointerMove, onPointerEnd, onContextMenu }
}

const CLICK_AFTER_RELEASE_MS = 400

const CANCEL_EVENTS = ['touchstart', 'gesturestart', 'scroll']

const isPageZoomed = () => (window.visualViewport?.scale ?? 1) > 1.01

const SWALLOWED_EVENTS = ['click', 'touchend', 'selectstart', 'contextmenu']

const swallowEvent = (event) => {
  if (event.cancelable) event.preventDefault()
  event.stopPropagation()
}

const clearSelection = () => {
  try { window.getSelection()?.removeAllRanges() } catch {}
}
