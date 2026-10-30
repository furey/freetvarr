const BASE_Z_INDEX = 100

export const createOverlayStack = ({ entries = null } = {}) => {
  const open = []
  const listeners = new Set()
  let nextId = 0
  const notify = () => listeners.forEach((listener) => listener(open.length))
  const push = ({ onBack = null } = {}) => {
    const id = ++nextId
    const zIndex = (open.at(-1)?.zIndex ?? BASE_Z_INDEX) + 1
    open.push({ id, zIndex, onBack })
    if (onBack) entries?.add(id)
    notify()
    return { id, zIndex }
  }
  const remove = (id) => {
    const index = open.findIndex((overlay) => overlay.id === id)
    if (index === -1) return
    const [overlay] = open.splice(index, 1)
    if (overlay.onBack) entries?.drop(id)
    notify()
  }
  const isTop = (id) => open.at(-1)?.id === id
  const has = (id) => open.some((overlay) => overlay.id === id)
  const size = () => open.length
  const backTo = (keepId) => {
    const dismissible = open.filter((overlay) => overlay.onBack)
    const keepIndex = dismissible.findIndex((overlay) => overlay.id === keepId)
    dismissible.slice(keepIndex + 1).reverse().forEach((overlay) => overlay.onBack())
  }
  const subscribe = (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  return { push, remove, isTop, has, size, backTo, subscribe }
}

export const createHistoryEntries = ({ history, usesBackGesture, later = (run) => setTimeout(run) }) => {
  let pendingPops = 0
  let stack = null
  const currentId = () => history.state?.overlayId ?? null
  const skipStaleEntry = () => {
    const id = currentId()
    if (id == null || stack.has(id)) return
    pendingPops += 1
    history.back()
  }
  const add = (id) => {
    if (!usesBackGesture()) return
    history.pushState({ ...history.state, overlayId: id }, '')
  }
  const drop = (id) => later(() => {
    if (currentId() !== id) return
    pendingPops += 1
    history.back()
  })
  const onPop = () => {
    if (pendingPops > 0) pendingPops -= 1
    else stack.backTo(currentId())
    skipStaleEntry()
  }
  const attach = (overlayStack) => {
    stack = overlayStack
    return overlayStack
  }
  return { add, drop, onPop, attach }
}

const browserOverlayStack = () => {
  const entries = createHistoryEntries({
    history: window.history,
    usesBackGesture: () => window.matchMedia('(pointer: coarse)').matches,
  })
  window.addEventListener('popstate', entries.onPop)
  return entries.attach(createOverlayStack({ entries }))
}

export const overlayStack = typeof window === 'undefined' ? createOverlayStack() : browserOverlayStack()
