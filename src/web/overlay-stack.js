const BASE_Z_INDEX = 100

export const createOverlayStack = () => {
  const open = []
  let nextId = 0
  const push = () => {
    const id = ++nextId
    const zIndex = (open.at(-1)?.zIndex ?? BASE_Z_INDEX) + 1
    open.push({ id, zIndex })
    return { id, zIndex }
  }
  const remove = (id) => {
    const index = open.findIndex((overlay) => overlay.id === id)
    if (index !== -1) open.splice(index, 1)
  }
  const isTop = (id) => open.at(-1)?.id === id
  const size = () => open.length
  return { push, remove, isTop, size }
}

export const overlayStack = createOverlayStack()
