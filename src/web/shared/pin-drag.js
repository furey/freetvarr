import { ref, computed, nextTick, onUnmounted, watch } from '/vendor/vue.esm-browser.prod.js'
import {
  autoScrollStep, cancelledText, clampOffset, keyboardTarget, mergeVisibleOrder, moveItem,
  movedText, offsetsFor, pickedUpText, positionText, slotOffsetFor, targetIndexFor,
} from '/sortable-math.js'
import { api } from '/shared/api.js'
import { toast } from '/shared/toast.js'

export const setDragLock = (on) => {
  try { document.body.classList.toggle('epg-drag-lock', on) } catch { /* ignore */ }
}

export const useSortable = ({ listEl, ids, nameOf, onDrop, threshold = 4, liftScale = 1.02, edgeInsetTop = () => 0 }) => {
  const activeId = ref(null)
  const keyboardActive = ref(false)
  const previewOrder = ref(null)
  const announcement = ref('')
  let pending = null
  let drag = null

  const announce = (text) => {
    announcement.value = ''
    nextTick(() => { announcement.value = text })
  }

  const rowOf = (id) => listEl()?.querySelector(`[data-sort-id="${cssEscape(id)}"]`)

  const focusHandleOf = (id) => nextTick(() => rowOf(id)?.querySelector('[data-sort-handle]')?.focus())

  const lift = ({ id, mode, startY, pointerId = null, handle = null }) => {
    const list = listEl()
    const order = ids()
    const from = order.indexOf(id)
    if (!list || from < 0) return false
    const rows = order.map(rowOf)
    if (rows.some((row) => !row)) return false
    const listBox = list.getBoundingClientRect()
    const slots = rows.map((row) => {
      const box = row.getBoundingClientRect()
      return { top: box.top, height: box.height }
    })
    const scroller = scrollParentOf(list)
    const reduced = prefersReducedMotion()
    const slotEl = document.createElement('div')
    slotEl.className = 'sort-slot'
    slotEl.setAttribute('aria-hidden', 'true')
    list.classList.add('is-sorting')
    list.classList.toggle('is-sort-reduced', reduced)
    list.classList.toggle('is-sort-keyboard', mode === 'keyboard')
    list.appendChild(slotEl)
    rows[from].classList.add('is-sort-lifted')
    drag = {
      id, mode, from, to: from, rows, slots, list, listTop: listBox.top, slotEl, scroller, reduced,
      startY, pointerY: startY, pointerId, handle, scrollStart: scrollTopOf(scroller), frame: 0, settling: false,
    }
    slotEl.style.top = `${slots[from].top - listBox.top}px`
    slotEl.style.height = `${slots[from].height}px`
    activeId.value = id
    keyboardActive.value = mode === 'keyboard'
    previewOrder.value = order
    setDragLock(true)
    window.addEventListener('keydown', onWindowKeydown, true)
    scroller.addEventListener?.('scroll', onScroll, { passive: true })
    if (scroller === document.scrollingElement) window.addEventListener('scroll', onScroll, { passive: true })
    announce(pickedUpText({ name: nameOf(id), index: from, count: order.length }))
    paint()
    if (mode === 'pointer') drag.frame = requestAnimationFrame(autoScroll)
    return true
  }

  const liftedOffset = () => {
    const scrollDelta = scrollTopOf(drag.scroller) - drag.scrollStart
    return clampOffset({ slots: drag.slots, from: drag.from, offset: drag.pointerY - drag.startY + scrollDelta })
  }

  const paint = () => {
    const { rows, slots, from, to, reduced, mode } = drag
    const offsets = offsetsFor({ slots, from, to })
    rows.forEach((row, i) => {
      if (i !== from) row.style.transform = offsets[i] ? `translateY(${offsets[i]}px)` : ''
    })
    const followsPointer = mode === 'pointer' && !reduced
    const liftedY = followsPointer ? liftedOffset() : offsets[from]
    rows[from].style.transform = reduced || liftScale === 1 ? `translateY(${liftedY}px)` : `translateY(${liftedY}px) scale(${liftScale})`
    drag.slotEl.style.transform = `translateY(${offsets[from]}px)`
  }

  const retarget = (to) => {
    if (to === drag.to) return
    drag.to = to
    const order = moveItem({ list: ids(), from: drag.from, to })
    previewOrder.value = order
    tick()
    announce(positionText({ name: nameOf(drag.id), index: to, count: order.length }))
  }

  const update = () => {
    if (!drag || drag.settling) return
    if (drag.mode === 'pointer') retarget(targetIndexFor({ slots: drag.slots, from: drag.from, offset: liftedOffset() }))
    paint()
  }

  const autoScroll = () => {
    if (!drag || drag.mode !== 'pointer' || drag.settling) return
    const view = viewBoxOf(drag.scroller)
    const top = drag.slots[drag.from].top + liftedOffset() - (scrollTopOf(drag.scroller) - drag.scrollStart)
    const step = autoScrollStep({
      top, bottom: top + drag.slots[drag.from].height,
      viewTop: view.top + edgeInsetTop(), viewBottom: view.bottom,
    })
    if (step) {
      scrollBy(drag.scroller, step)
      update()
    }
    drag.frame = requestAnimationFrame(autoScroll)
  }

  const onScroll = () => update()

  const onPointerDown = (id, event) => {
    if (drag || pending) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const handle = event.currentTarget
    pending = { id, handle, pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    try { handle.setPointerCapture(event.pointerId) } catch { /* ignore */ }
    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
  }

  const onPointerMove = (event) => {
    if (pending && event.pointerId === pending.pointerId) {
      if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) < threshold) return
      const { id, y, pointerId, handle } = pending
      pending = null
      if (!lift({ id, mode: 'pointer', startY: y, pointerId, handle })) return removePointerListeners()
    }
    if (!drag || event.pointerId !== drag.pointerId) return
    event.preventDefault()
    drag.pointerY = event.clientY
    update()
  }

  const onPointerUp = (event) => {
    if (pending) {
      pending = null
      return removePointerListeners()
    }
    if (!drag || event.pointerId !== drag.pointerId) return
    removePointerListeners()
    settle()
  }

  const onPointerCancel = () => {
    pending = null
    removePointerListeners()
    if (drag) cancel()
  }

  const removePointerListeners = () => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerCancel)
  }

  const settle = () => {
    drag.settling = true
    cancelAnimationFrame(drag.frame)
    const { rows, from, slots, to, reduced } = drag
    if (reduced) return commit()
    const lifted = rows[from]
    lifted.classList.add('is-sort-settling')
    lifted.style.transform = `translateY(${slotOffsetFor({ slots, from, to })}px)`
    setTimeout(commit, SETTLE_MS)
  }

  const commit = () => {
    if (!drag) return
    const { id, from, to, mode } = drag
    const order = ids()
    const next = moveItem({ list: order, from, to })
    const finished = finish()
    if (from === to) {
      if (mode === 'keyboard') announce(movedText({ name: nameOf(id), index: to, count: order.length }))
      return
    }
    onDrop({ order: next, id, from, to })
    announce(movedText({ name: nameOf(id), index: to, count: order.length }))
    finished.then(() => { if (mode === 'keyboard') focusHandleOf(id) })
  }

  const cancel = () => {
    if (!drag) return
    const { id, from, rows, reduced } = drag
    const count = ids().length
    drag.settling = true
    cancelAnimationFrame(drag.frame)
    rows.forEach((row) => {
      row.classList.add('is-sort-settling')
      row.style.transform = ''
    })
    drag.slotEl.style.transform = ''
    announce(cancelledText({ name: nameOf(id), index: from, count }))
    if (reduced) return finish()
    setTimeout(finish, SETTLE_MS)
  }

  const finish = () => {
    if (!drag) return Promise.resolve()
    const { list, rows, slotEl, scroller } = drag
    cancelAnimationFrame(drag.frame)
    list.classList.add('is-sort-commit')
    rows.forEach((row) => {
      row.style.transform = ''
      row.classList.remove('is-sort-lifted', 'is-sort-settling')
    })
    slotEl.remove()
    window.removeEventListener('keydown', onWindowKeydown, true)
    scroller.removeEventListener?.('scroll', onScroll)
    window.removeEventListener('scroll', onScroll)
    setDragLock(false)
    drag = null
    activeId.value = null
    keyboardActive.value = false
    previewOrder.value = null
    return nextTick().then(() => new Promise((resolve) => requestAnimationFrame(() => {
      if (!drag) list.classList.remove('is-sorting', 'is-sort-commit', 'is-sort-reduced', 'is-sort-keyboard')
      resolve()
    })))
  }

  const onWindowKeydown = (event) => {
    if (!drag || event.key !== 'Escape') return
    event.preventDefault()
    event.stopImmediatePropagation()
    pending = null
    removePointerListeners()
    cancel()
  }

  const onKeydown = (id, event) => {
    const isPickKey = event.key === ' ' || event.key === 'Enter'
    if (!drag) {
      if (!isPickKey || pending) return
      event.preventDefault()
      lift({ id, mode: 'keyboard', startY: 0 })
      return
    }
    if (drag.id !== id || drag.mode !== 'keyboard' || drag.settling) return
    if (isPickKey) {
      event.preventDefault()
      drag.settling = true
      setTimeout(commit, drag.reduced ? 0 : SETTLE_MS)
      return
    }
    const to = keyboardTarget({ key: event.key, index: drag.to, count: drag.rows.length })
    if (to === null) return
    event.preventDefault()
    retarget(to)
    paint()
    keepLiftedInView()
  }

  const onBlur = (id) => {
    if (drag?.id === id && drag.mode === 'keyboard' && !drag.settling) cancel()
  }

  const keepLiftedInView = () => {
    const { slots, from, to, scroller, scrollStart } = drag
    const view = viewBoxOf(scroller)
    const top = slots[from].top + slotOffsetFor({ slots, from, to }) - (scrollTopOf(scroller) - scrollStart)
    const bottom = top + slots[from].height
    const viewTop = view.top + edgeInsetTop()
    if (top < viewTop) scrollBy(scroller, top - viewTop - KEYBOARD_SCROLL_MARGIN_PX)
    else if (bottom > view.bottom) scrollBy(scroller, bottom - view.bottom + KEYBOARD_SCROLL_MARGIN_PX)
  }

  const isActive = () => Boolean(drag || pending)

  onUnmounted(() => {
    removePointerListeners()
    if (drag) finish()
  })

  return { activeId, keyboardActive, previewOrder, announcement, announce, isActive, onPointerDown, onKeydown, onBlur }
}

export const useOrderEditing = ({ canEdit }) => {
  const editing = ref(false)
  const sortable = computed(() => editing.value && canEdit.value)
  const toggle = () => { editing.value = !editing.value }
  const stop = () => {
    if (!editing.value) return false
    editing.value = false
    return true
  }
  watch(canEdit, (can) => { if (!can) editing.value = false })
  return { editing, sortable, toggle, stop }
}

export const useFavouriteOrderSave = ({ currentPins, applyOrder, reload }) => {
  const savePins = (pins) => api('PUT', '/api/epg/channel-prefs', { pinned_ids: pins })

  const onDrop = async ({ order }) => {
    const pins = mergeVisibleOrder({ all: currentPins(), visible: order })
    applyOrder(pins)
    try {
      await savePins(pins)
    } catch (err) {
      toast({ text: `Reorder failed: ${err.message}`, kind: 'error' })
    }
    await reload()
  }

  return { onDrop }
}

const cssEscape = (value) => (window.CSS?.escape ? CSS.escape(String(value)) : String(value).replace(/"/g, '\\"'))

const prefersReducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

const tick = () => {
  try { navigator.vibrate?.(8) } catch { /* ignore */ }
}

const scrollParentOf = (el) => {
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node
  }
  return document.scrollingElement || document.documentElement
}

const isPageScroller = (scroller) => scroller === document.scrollingElement || scroller === document.documentElement

const scrollTopOf = (scroller) => (isPageScroller(scroller) ? window.scrollY : scroller.scrollTop)

const scrollBy = (scroller, step) => {
  if (isPageScroller(scroller)) window.scrollBy(0, step)
  else scroller.scrollTop += step
}

const viewBoxOf = (scroller) => {
  if (isPageScroller(scroller)) return { top: 0, bottom: window.innerHeight }
  const box = scroller.getBoundingClientRect()
  return { top: box.top, bottom: box.bottom }
}

const SETTLE_MS = 160
const KEYBOARD_SCROLL_MARGIN_PX = 8
