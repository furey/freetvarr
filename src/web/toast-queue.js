export const TOAST_MS = 4000
export const TOAST_ACTION_MS = 6000
export const TOAST_SIDE_GAP = 24
export const TOAST_MIN_WIDTH = 240
export const TOAST_MAX_WIDTH = 400

export const toastKindOf = (kind) => KIND_ALIASES[kind] ?? 'ok'

export const toastDurationOf = ({ kind, action, persist }) => {
  if (persist || toastKindOf(kind) === 'error') return null
  return action ? TOAST_ACTION_MS : TOAST_MS
}

export const isSameToast = (a, b) => Boolean(a && b)
  && a.text === b.text
  && (a.detail || '') === (b.detail || '')
  && toastKindOf(a.kind) === toastKindOf(b.kind)

export const createToastQueue = ({ onChange, setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now }) => {
  const pauses = new Set()
  let current = null
  let seq = 0
  let timer = null
  let remainingMs = null
  let startedAt = 0

  const show = ({ text, detail = '', kind = 'ok', action = null, persist = false }) => {
    const next = { text, detail, kind: toastKindOf(kind), action, persist }
    const id = isSameToast(current, next) ? current.id : ++seq
    current = { ...next, id }
    remainingMs = toastDurationOf(next)
    onChange(current)
    schedule()
    return id
  }

  const dismiss = (id) => {
    if (!current || (id != null && current.id !== id)) return
    stopTimer()
    current = null
    remainingMs = null
    onChange(null)
  }

  const pause = (reason) => {
    if (pauses.has(reason)) return
    pauses.add(reason)
    if (!timer) return
    stopTimer()
    remainingMs = Math.max(0, remainingMs - (now() - startedAt))
  }

  const resume = (reason) => {
    if (!pauses.delete(reason)) return
    schedule()
  }

  const schedule = () => {
    stopTimer()
    if (!current || remainingMs == null || pauses.size > 0) return
    startedAt = now()
    const id = current.id
    timer = setTimer(() => {
      timer = null
      dismiss(id)
    }, remainingMs)
  }

  const stopTimer = () => {
    if (timer) clearTimer(timer)
    timer = null
  }

  return { show, dismiss, pause, resume, current: () => current }
}

export const toastPlacementOf = ({ phone, viewportHeight, toastLeft, obstacles }) => {
  const placement = { clearBottom: 0, maxWidth: null }
  for (const { top, left, gap } of obstacles) {
    const roomBeside = left - TOAST_SIDE_GAP - toastLeft
    if (!phone && roomBeside >= TOAST_MIN_WIDTH) {
      placement.maxWidth = Math.min(placement.maxWidth ?? TOAST_MAX_WIDTH, roomBeside)
      continue
    }
    placement.clearBottom = Math.max(placement.clearBottom, Math.ceil(viewportHeight - top + gap))
  }
  return placement
}

const KIND_ALIASES = {
  ok: 'ok',
  info: 'info',
  err: 'error',
  error: 'error',
  warning: 'error',
}
