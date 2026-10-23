import { ref, onMounted, onUnmounted, watch, nextTick } from '/vendor/vue.esm-browser.prod.js'
import { DOUBLE_TAP_MS } from '/double-tap.js'
import { isSwipeDown } from '/mini-player.js'
import { overlayStack } from '/overlay-stack.js'
import { controlsHideMsOf, singleTapPlanOf, holdsControlsForFocus, isControlTarget } from '/controls-hide.js'

const isPlainKey = (e, key) => (e.key === key || e.key === key.toUpperCase())
  && !e.ctrlKey && !e.metaKey && !e.altKey
  && !e.target.closest?.('select, textarea, input:not([type=range]), [contenteditable]')

export const usePlayerKeys = ({
  isActive, infoOpen, close, toggleInfo, canToggleCaptions, toggleCaptions, togglePause, skip, toggleFullscreen, toggleMute,
  ignoreSelector = 'button, select, textarea, input',
}) => {
  const onKeydown = (e) => {
    if (!isActive() || e.defaultPrevented || overlayStack.size() > 0) return
    if (e.key === 'Escape') {
      if (infoOpen.value) infoOpen.value = false
      else close()
      return
    }
    if (isPlainKey(e, 'i')) {
      e.preventDefault()
      return toggleInfo()
    }
    if (canToggleCaptions() && isPlainKey(e, 'c')) {
      e.preventDefault()
      return toggleCaptions()
    }
    if (isPlainKey(e, 'm')) {
      e.preventDefault()
      return toggleMute()
    }
    if (e.target.closest?.(ignoreSelector) && isKeyboardFocused(e.target)) return
    if (e.key === ' ' || isPlainKey(e, 'k')) {
      e.preventDefault()
      return togglePause()
    }
    if (isPlainKey(e, 'f')) {
      e.preventDefault()
      return toggleFullscreen()
    }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    if (skip(e.key === 'ArrowLeft' ? 'back' : 'forward')) e.preventDefault()
  }
  onMounted(() => window.addEventListener('keydown', onKeydown))
  onUnmounted(() => window.removeEventListener('keydown', onKeydown))
}

export const usePlayerFocus = ({ isOpen, isMini = ref(false), rootEl }) => {
  let returnFocus = null
  const isInsidePlayer = (el) => Boolean(el && rootEl.value?.closest('.pl-backdrop')?.contains(el))
  const restoreFocus = () => {
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
  }
  watch(() => isOpen.value && !isMini.value, async (shown) => {
    if (!shown) {
      restoreFocus()
      if (!isOpen.value) returnFocus = null
      return
    }
    if (!isInsidePlayer(document.activeElement)) returnFocus = document.activeElement
    await nextTick()
    rootEl.value?.focus({ preventScroll: true })
  })
  watch(isOpen, (open) => {
    if (open) return
    if (isInsidePlayer(document.activeElement) || document.activeElement === document.body) restoreFocus()
    returnFocus = null
  })
}

export const useSwipeDown = ({ enabled, onSwipe }) => {
  let start = null
  const onSwipePointerDown = (e) => {
    start = enabled() && e.pointerType === 'touch' && e.isPrimary && !e.target.closest?.('button, input, .pl-bottom')
      ? { x: e.clientX, y: e.clientY, at: Date.now() }
      : null
  }
  const onSwipePointerUp = (e) => {
    const from = start
    start = null
    if (!from) return false
    const swiped = isSwipeDown({ startX: from.x, startY: from.y, endX: e.clientX, endY: e.clientY, ms: Date.now() - from.at })
    if (swiped) onSwipe()
    return swiped
  }
  return { onSwipePointerDown, onSwipePointerUp }
}

const isKeyboardFocused = (el) => !el.matches?.('button') || el.matches(':focus-visible')

export const singleTapActionFor = ({ pointerType, controlsShown, revealControls, hideControls, togglePause }) => {
  const plan = singleTapPlanOf({ pointerType, controlsShown: controlsShown.value })
  if (plan === 'hide') return hideControls
  if (plan === 'reveal') return revealControls
  return () => {
    togglePause()
    revealControls()
  }
}

export const useControlsAutoHide = ({ enabled, holdShown, rootEl, quietRelease = () => false }) => {
  const controlsShown = ref(true)
  let hideTimer = null

  const isFocusInside = () => holdsControlsForFocus({ focused: document.activeElement, root: rootEl.value })

  const hideLater = () => {
    clearTimeout(hideTimer)
    if (!enabled.value || holdShown.value) return
    hideTimer = setTimeout(() => {
      if (isFocusInside()) return hideLater()
      controlsShown.value = false
    }, controlsHideMsOf(localStorage))
  }

  const revealControls = () => {
    controlsShown.value = true
    hideLater()
  }

  const hideControls = () => {
    clearTimeout(hideTimer)
    if (enabled.value) controlsShown.value = false
  }

  const onPointerMove = (e) => {
    if (enabled.value && e.pointerType === 'mouse') revealControls()
  }

  const onPointerDown = (e) => {
    if (enabled.value && controlsShown.value && isControlTarget(e.target)) revealControls()
  }

  const onKeydown = () => {
    if (enabled.value) revealControls()
  }

  watch([enabled, holdShown], ([, held], [, wasHeld]) => {
    if (wasHeld && !held && quietRelease()) return hideControls()
    revealControls()
  })
  onMounted(() => window.addEventListener('keydown', onKeydown, true))
  onUnmounted(() => {
    clearTimeout(hideTimer)
    window.removeEventListener('keydown', onKeydown, true)
  })

  return { controlsShown, revealControls, hideControls, onPointerMove, onPointerDown }
}

export const useInfoDismissTaps = ({ infoOpen, onPointerDown, onPointerUp, onClick, onDoubleClick }) => {
  let ignoreTapsUntil = 0

  const isVideoAreaTap = (e) => !e.target.closest?.('.live-info-body, button')

  const isIgnoredTap = (e) => isVideoAreaTap(e) && Date.now() < ignoreTapsUntil

  const swallow = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const onFramePointerDown = (e) => {
    if (infoOpen.value && e.isPrimary && isVideoAreaTap(e)) {
      infoOpen.value = false
      ignoreTapsUntil = Date.now() + DOUBLE_TAP_MS
    }
    if (isIgnoredTap(e)) return
    onPointerDown(e)
  }

  const onFramePointerUp = (e) => {
    if (!isIgnoredTap(e)) onPointerUp(e)
  }

  const onFrameClick = (e) => {
    if (isIgnoredTap(e)) return swallow(e)
    onClick(e)
  }

  const onFrameDoubleClick = (e) => {
    if (isIgnoredTap(e)) return swallow(e)
    onDoubleClick(e)
  }

  return { onFramePointerDown, onFramePointerUp, onFrameClick, onFrameDoubleClick }
}
