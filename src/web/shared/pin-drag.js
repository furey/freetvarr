import { ref } from '/vendor/vue.esm-browser.prod.js'

export const RECORDING_CARDS_MAX = 4

export const setDragLock = (on) => {
  try { document.body.classList.toggle('epg-drag-lock', on) } catch { /* ignore */ }
}

export const usePinDrag = ({ rowSelector, currentPins, onReorder, grabSelector = null }) => {
  const dragPinId = ref(null)
  const dropTargetId = ref(null)
  const dropAfter = ref(false)
  let pendingDrag = null
  let liftTimer = null
  let dragDidMove = false
  let ghostEl = null
  let ghostDX = 0
  let ghostDY = 0

  const distanceToBox = (clientY, box) => {
    if (clientY < box.top) return box.top - clientY
    if (clientY > box.bottom) return clientY - box.bottom
    return 0
  }

  const pinRowUnderPointer = (clientY) => {
    const nearest = [...document.querySelectorAll(rowSelector)]
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.height > 0)
      .reduce((best, row) => {
        const distance = distanceToBox(clientY, row.box)
        return !best || distance < best.distance ? { ...row, distance } : best
      }, null)
    return nearest?.el.dataset.channelId || null
  }

  const isBelow = (from, to) => {
    const order = currentPins()
    return order.indexOf(from) < order.indexOf(to)
  }

  const moveGhost = (e) => {
    if (!ghostEl) return
    ghostEl.style.left = `${e.clientX - ghostDX}px`
    ghostEl.style.top = `${e.clientY - ghostDY}px`
  }

  const removeGhost = () => {
    if (!ghostEl) return
    ghostEl.remove()
    ghostEl = null
  }

  const startPinDrag = () => {
    clearTimeout(liftTimer)
    if (!pendingDrag) return
    const { ch, cell, pointerId, x, y } = pendingDrag
    pendingDrag = null
    dragDidMove = true
    setDragLock(true)
    try { cell.setPointerCapture(pointerId) } catch { /* ignore */ }
    dragPinId.value = String(ch.id)
    dropTargetId.value = null
    const box = cell.getBoundingClientRect()
    ghostDX = x - box.left
    ghostDY = y - box.top
    ghostEl = cell.cloneNode(true)
    ghostEl.classList.add('epg-ghost')
    ghostEl.style.width = `${box.width}px`
    ghostEl.style.height = `${box.height}px`
    document.body.appendChild(ghostEl)
    moveGhost({ clientX: x, clientY: y })
  }

  const onPinPointerDown = (ch, e) => {
    if (!ch.pinned) return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    if (grabSelector && !e.target.closest?.(grabSelector)) return
    pendingDrag = { ch, cell: e.currentTarget, pointerId: e.pointerId, x: e.clientX, y: e.clientY }
    clearTimeout(liftTimer)
    liftTimer = setTimeout(startPinDrag, PIN_LIFT_HOLD_MS)
  }

  const onPinPointerMove = (e) => {
    if (pendingDrag) {
      if (Math.hypot(e.clientX - pendingDrag.x, e.clientY - pendingDrag.y) < EPG_DRAG_THRESHOLD_PX) return
      startPinDrag()
    }
    if (!dragPinId.value) return
    e.preventDefault()
    moveGhost(e)
    const over = pinRowUnderPointer(e.clientY)
    dropTargetId.value = over && over !== dragPinId.value ? over : null
    dropAfter.value = Boolean(dropTargetId.value) && isBelow(dragPinId.value, dropTargetId.value)
  }

  const onPinPointerUp = async () => {
    pendingDrag = null
    clearTimeout(liftTimer)
    setDragLock(false)
    removeGhost()
    if (dragDidMove) setTimeout(() => { dragDidMove = false }, 0)
    const from = dragPinId.value
    const to = dropTargetId.value
    dragPinId.value = null
    dropTargetId.value = null
    dropAfter.value = false
    if (!from || !to || from === to) return
    const movingDown = isBelow(from, to)
    const pins = currentPins().filter((id) => id !== from)
    pins.splice(pins.indexOf(to) + (movingDown ? 1 : 0), 0, from)
    await onReorder(pins)
  }

  const onPinPointerCancel = () => {
    pendingDrag = null
    clearTimeout(liftTimer)
    setDragLock(false)
    removeGhost()
    dragDidMove = false
    dragPinId.value = null
    dropTargetId.value = null
    dropAfter.value = false
  }

  return {
    dragPinId, dropTargetId, dropAfter, didDrag: () => dragDidMove,
    onPinPointerDown, onPinPointerMove, onPinPointerUp, onPinPointerCancel,
  }
}

const EPG_DRAG_THRESHOLD_PX = 6
const PIN_LIFT_HOLD_MS = 250
