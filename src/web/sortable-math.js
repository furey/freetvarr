export const moveItem = ({ list, from, to }) => {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export const pitchesOf = (slots) => slots.map((slot, i) => (i < slots.length - 1
  ? slots[i + 1].top - slot.top
  : slot.height + trailingGapOf(slots)))

export const clampOffset = ({ slots, from, offset }) => {
  const first = slots[0]
  const last = slots[slots.length - 1]
  const lifted = slots[from]
  const min = first.top - lifted.top
  const max = last.top + last.height - (lifted.top + lifted.height)
  return Math.min(max, Math.max(min, offset))
}

export const targetIndexFor = ({ slots, from, offset }) => {
  const centre = slots[from].top + slots[from].height / 2 + offset
  const passedBelow = slots.slice(from + 1).filter((slot) => centre >= slot.top).length
  if (passedBelow) return from + passedBelow
  const passedAbove = slots.slice(0, from).filter((slot) => centre <= slot.top + slot.height).length
  return from - passedAbove
}

export const slotOffsetFor = ({ slots, from, to }) => {
  const pitches = pitchesOf(slots)
  if (to > from) return sumOf(pitches.slice(from + 1, to + 1))
  if (to < from) return -sumOf(pitches.slice(to, from))
  return 0
}

export const offsetsFor = ({ slots, from, to }) => {
  const liftedPitch = pitchesOf(slots)[from]
  return slots.map((_, i) => {
    if (i === from) return slotOffsetFor({ slots, from, to })
    if (to > from && i > from && i <= to) return -liftedPitch
    if (to < from && i >= to && i < from) return liftedPitch
    return 0
  })
}

export const autoScrollStep = ({ top, bottom, viewTop, viewBottom, edge = AUTO_SCROLL_EDGE_PX, maxStep = AUTO_SCROLL_MAX_STEP_PX }) => {
  const stepFor = (depth) => Math.ceil(maxStep * Math.min(1, depth / edge))
  if (top < viewTop + edge) return -stepFor(viewTop + edge - top)
  if (bottom > viewBottom - edge) return stepFor(bottom - (viewBottom - edge))
  return 0
}

export const keyboardTarget = ({ key, index, count }) => {
  if (key === 'ArrowUp') return Math.max(0, index - 1)
  if (key === 'ArrowDown') return Math.min(count - 1, index + 1)
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}

export const menuMovesFor = ({ index, count }) => [
  { key: 'top', label: 'Move to top', to: 0, shown: index > 0 },
  { key: 'up', label: 'Move up', to: index - 1, shown: index > 0 },
  { key: 'down', label: 'Move down', to: index + 1, shown: index < count - 1 },
  { key: 'bottom', label: 'Move to bottom', to: count - 1, shown: index < count - 1 },
].filter((move) => move.shown).map(({ key, label, to }) => ({ key, label, to }))

export const mergeVisibleOrder = ({ all, visible }) => {
  const visibleSet = new Set(visible)
  const queue = [...visible]
  return all.map((id) => (visibleSet.has(id) ? queue.shift() : id))
}

export const arrangeByOrder = ({ items, order, idOf }) => {
  const byId = new Map(items.map((item) => [idOf(item), item]))
  const ordered = order.filter((id) => byId.has(id)).map((id) => byId.get(id))
  const orderedSet = new Set(ordered)
  return items.map((item) => (orderedSet.has(item) ? ordered.shift() : item))
}

export const positionText = ({ name, index, count }) => `${name}, position ${index + 1} of ${count}.`

export const pickedUpText = ({ name, index, count }) => `Picked up ${name}, position ${index + 1} of ${count}.`

export const movedText = ({ name, index, count }) => `${name} moved to position ${index + 1} of ${count}.`

export const cancelledText = ({ name, index }) => `Cancelled. ${name} is back at position ${index + 1}.`

const sumOf = (values) => values.reduce((total, value) => total + value, 0)

const trailingGapOf = (slots) => (slots.length > 1
  ? Math.max(0, slots[1].top - slots[0].top - slots[0].height)
  : 0)

const AUTO_SCROLL_EDGE_PX = 48
const AUTO_SCROLL_MAX_STEP_PX = 18
