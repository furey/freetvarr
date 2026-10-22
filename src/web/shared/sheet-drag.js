import { prefersReducedMotion } from '/shared/utils.js'
import { releaseVelocityOf, sheetDragOffsetOf, sheetDragStartOf, sheetReleaseOf } from '/sheet-drag.js'

export const useSheetDrag = ({ sheet, onClose, canDrag = () => true }) => {
  let gesture = null
  let frame = 0
  let clickBlockedUntil = 0

  const onTouchStart = (event) => {
    gesture = null
    const root = sheet.value
    if (event.touches.length !== 1 || !root || !canDrag() || !isPhoneSheet(root)) return
    if (event.target.closest?.(NO_DRAG)) return
    const touch = event.touches[0]
    gesture = {
      root,
      state: 'wait',
      fromHandle: Boolean(event.target.closest?.(DRAG_HANDLES)),
      scrolledFromTop: isScrolledFromTop({ target: event.target, root }),
      startX: touch.clientX,
      startY: touch.clientY,
      offset: 0,
      samples: [{ y: touch.clientY, at: event.timeStamp }],
      reduced: prefersReducedMotion(),
    }
  }

  const onTouchMove = (event) => {
    if (!gesture || gesture.state === 'ignore') return
    const touch = event.touches[0]
    if (!touch) return
    const dy = touch.clientY - gesture.startY
    if (gesture.state === 'wait') {
      gesture.state = sheetDragStartOf({
        dx: touch.clientX - gesture.startX,
        dy,
        fromHandle: gesture.fromHandle,
        scrolledFromTop: gesture.scrolledFromTop,
      })
      if (gesture.state !== 'drag') return
      gesture.startY = touch.clientY
      gesture.root.classList.add(DRAGGING_CLASS)
    }
    if (event.cancelable) event.preventDefault()
    gesture.offset = sheetDragOffsetOf(touch.clientY - gesture.startY)
    gesture.samples = [...gesture.samples, { y: touch.clientY, at: event.timeStamp }].slice(-MAX_SAMPLES)
    if (!gesture.reduced) paint()
  }

  const onTouchEnd = (event) => {
    const ended = gesture
    gesture = null
    if (!ended || ended.state !== 'drag') return
    clickBlockedUntil = event.timeStamp + CLICK_BLOCK_MS
    cancelAnimationFrame(frame)
    frame = 0
    ended.root.classList.remove(DRAGGING_CLASS)
    const outcome = sheetReleaseOf({
      offset: ended.offset,
      height: ended.root.offsetHeight,
      velocity: releaseVelocityOf(ended.samples),
    })
    if (outcome === 'close') return close(ended)
    settle({ root: ended.root, to: '', reduced: ended.reduced })
  }

  const onTouchCancel = () => {
    const ended = gesture
    gesture = null
    if (!ended || ended.state !== 'drag') return
    cancelAnimationFrame(frame)
    frame = 0
    ended.root.classList.remove(DRAGGING_CLASS)
    settle({ root: ended.root, to: '', reduced: ended.reduced })
  }

  const onHandleClick = (event) => {
    if (event.timeStamp < clickBlockedUntil) return
    onClose()
  }

  const paint = () => {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      if (gesture?.state === 'drag') gesture.root.style.transform = `translate3d(0, ${gesture.offset}px, 0)`
    })
  }

  const close = ({ root, reduced }) => {
    if (!reduced) settle({ root, to: 'translate3d(0, 100%, 0)', reduced })
    onClose()
    setTimeout(() => {
      if (root.isConnected && !isLeaving(root)) settle({ root, to: '', reduced })
    }, KEPT_CHECK_MS)
  }

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, onHandleClick }
}

const settle = ({ root, to, reduced }) => {
  if (reduced || !root.style.transform) {
    root.style.transform = to
    return
  }
  root.style.transition = SETTLE_TRANSITION
  root.style.transform = to
  const done = () => {
    root.style.transition = ''
    root.removeEventListener('transitionend', onEnd)
  }
  const onEnd = (event) => {
    if (event.target === root && event.propertyName === 'transform') done()
  }
  root.addEventListener('transitionend', onEnd)
  setTimeout(done, SETTLE_FALLBACK_MS)
}

const isLeaving = (root) => /-leave-(active|to)\b/.test(root.parentElement?.className || '')

const isPhoneSheet = (root) => root.querySelector(':scope > .ui-sheet-grab')?.offsetParent != null

const isScrolledFromTop = ({ target, root }) => {
  for (let el = target; el && el !== root.parentElement; el = el.parentElement) {
    if (el.scrollTop > 0) return true
  }
  return false
}

const DRAG_HANDLES = '.ui-sheet-grab, .ui-sheet-header, .ui-sheet-subtitle'
const NO_DRAG = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [data-sort-handle], [data-no-sheet-drag]'
const DRAGGING_CLASS = 'is-dragging'
const SETTLE_TRANSITION = 'transform var(--motion-sheet) var(--ease-standard)'
const SETTLE_FALLBACK_MS = 600
const CLICK_BLOCK_MS = 400
const MAX_SAMPLES = 8
const KEPT_CHECK_MS = 60
