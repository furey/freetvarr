export const PINNED_TYPES = ['recording', 'on-now']
export const HOUR_MS = 3_600_000

export const hourKeyOf = ({ nowMs, timeZone }) => {
  const parts = Object.fromEntries(hourParts({ timeZone }).formatToParts(nowMs).map((p) => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}`
}

export const hourlyOrderOf = ({ candidates = [], nowMs, timeZone }) => {
  const pinned = PINNED_TYPES.flatMap((type) => candidates.filter((slide) => slide.type === type))
  const rotating = candidates.filter((slide) => !PINNED_TYPES.includes(slide.type))
  if (pinned.length) return [...pinned, ...rotatingOrderOf({ slides: rotating, seed: hourKeyOf({ nowMs, timeZone }) })]
  return leadSettledOrderOf({ slides: rotating, nowMs, timeZone })
}

export const leadSettledOrderOf = ({ slides, nowMs, timeZone }) => {
  const hourKey = hourKeyOf({ nowMs, timeZone })
  const lead = leadOf({ slides, hourNumber: hourNumberOf(hourKey) })
  return startingAt({ order: rotatingOrderOf({ slides, seed: hourKey }), key: lead?.key })
}

export const leadOf = ({ slides, hourNumber }) => {
  const canonical = [...slides].sort((a, b) => a.key.localeCompare(b.key))
  const count = canonical.length
  if (count < 3) return canonical[hourNumber % count] ?? null
  const position = hourNumber % count
  const block = Math.floor(hourNumber / count)
  return leadBlockOf({ canonical, block })[position]
}

export const leadBlockOf = ({ canonical, block }) => {
  const order = shuffledBy({ items: canonical, seed: `lead|${block}` })
  const previousLast = shuffledBy({ items: canonical, seed: `lead|${block - 1}` }).at(-1)
  return startingAwayFrom({ order, avoidKey: previousLast.key })
}

export const hourNumberOf = (hourKey) => {
  const [date, hour] = hourKey.split('T')
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day, Number(hour)) / HOUR_MS
}

export const startingAt = ({ order, key }) => {
  const index = order.findIndex((slide) => slide.key === key)
  return index > 0 ? [...order.slice(index), ...order.slice(0, index)] : order
}

export const startingAwayFrom = ({ order, avoidKey }) => {
  if (order.length < 2 || order[0].key !== avoidKey) return order
  return [order[1], order[0], ...order.slice(2)]
}

export const rotatingOrderOf = ({ slides, seed }) => {
  const types = shuffledBy({ items: [...new Set(slides.map((slide) => slide.type))], seed })
  const queues = types.map((type) => shuffledBy({ items: slides.filter((slide) => slide.type === type), seed: `${seed}|${type}` }))
  return interleaved(queues)
}

export const interleaved = (queues) => {
  const longest = Math.max(0, ...queues.map((queue) => queue.length))
  return Array.from({ length: longest }, (_, round) => queues.map((queue) => queue[round]))
    .flat()
    .filter(Boolean)
}

export const shuffledBy = ({ items, seed }) => {
  const random = seededRandomOf(seed)
  const shuffled = [...items]
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const held = shuffled[i]
    shuffled[i] = shuffled[j]
    shuffled[j] = held
  }
  return shuffled
}

export const seededRandomOf = (seed) => {
  let state = hashOf(String(seed))
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296
  }
}

export const adoptedOrderOf = ({ pendingKeys, targetKey }) => ({
  keys: pendingKeys,
  index: Math.max(0, pendingKeys.indexOf(targetKey)),
})

export const sameKeySet = (a, b) => a.length === b.length && a.every((key) => b.includes(key))

const hashOf = (text) => {
  let hash = 2_166_136_261
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16_777_619)
  return hash >>> 0
}

const hourParts = ({ timeZone }) => new Intl.DateTimeFormat('en-CA', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', timeZone,
})
