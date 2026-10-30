export const SIZE_RULES = {
  split: { min: 0.3, max: 0.7, fallback: 0.5, snaps: [1 / 3, 0.5, 2 / 3] },
  inset: { min: 0.2, max: 0.45, fallback: null, snaps: [] },
  strip: { min: 0.6, max: 0.8, fallback: null, snaps: [2 / 3, 0.75] },
}

export const SIZES_KEY = 'freetvarr.multiviewSizes'

export const KEY_STEP = 0.05

export const SNAP_DISTANCE = 0.02

export const sizeKeyOf = ({ layout, count, resizable }) => {
  if (!resizable || !SIZE_RULES[layout]) return null
  if (layout === 'strip' ? count < 3 : count !== 2) return null
  return `${layout}-${count}`
}

export const ruleOfKey = (key) => (key ? SIZE_RULES[key.split('-')[0]] : null)

export const clampShare = ({ rule, share }) => Math.min(rule.max, Math.max(rule.min, share))

export const snapShare = ({ rule, share, distance = SNAP_DISTANCE }) => {
  const near = rule.snaps.find((snap) => Math.abs(snap - share) <= distance)
  return near ?? share
}

export const shareAtPosition = ({ rule, positionOf, target, steps = 20 }) => {
  let low = rule.min
  let high = rule.max
  for (let i = 0; i < steps; i += 1) {
    const middle = (low + high) / 2
    if (positionOf(middle) < target) low = middle
    else high = middle
  }
  return clampShare({ rule, share: snapShare({ rule, share: roundShare((low + high) / 2) }) })
}

export const keyActionOf = ({ rule, share, key }) => {
  if (key === 'Enter') return { reset: true }
  if (key === 'Home') return { share: rule.min }
  if (key === 'End') return { share: rule.max }
  const step = KEY_STEPS[key]
  if (!step) return null
  return { share: clampShare({ rule, share: roundShare(share + step) }) }
}

export const isDefaultShare = ({ rule, share }) => share == null || (rule.fallback != null && Math.abs(share - rule.fallback) < 0.001)

export const sizesAfterSet = ({ sizes, key, share }) => {
  const rule = ruleOfKey(key)
  if (!rule) return sizes
  const rest = Object.fromEntries(Object.entries(sizes).filter(([k]) => k !== key))
  if (isDefaultShare({ rule, share })) return rest
  return { ...rest, [key]: roundShare(clampShare({ rule, share })) }
}

export const parseSizes = (raw) => {
  try {
    const parsed = JSON.parse(raw || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed)
      .filter(([key, share]) => ruleOfKey(key) && Number.isFinite(share))
      .map(([key, share]) => [key, clampShare({ rule: ruleOfKey(key), share })]))
  } catch {
    return {}
  }
}

export const insetGrowthOf = ({ corner, dx, dy }) => {
  const [vertical, horizontal] = corner.split('-')
  const along = (horizontal === 'right' ? -dx : dx) * 16 + (vertical === 'bottom' ? -dy : dy) * 9
  return (along * 16) / (16 * 16 + 9 * 9)
}

export const innerCornerOf = (corner) => {
  const [vertical, horizontal] = corner.split('-')
  return `${vertical === 'top' ? 'bottom' : 'top'}-${horizontal === 'left' ? 'right' : 'left'}`
}

export const percentOf = (share) => Math.round(share * 100)

export const ratioTextOf = ({ layout, share }) => {
  if (layout === 'split') return `${percentOf(share)} / ${100 - percentOf(share)}`
  if (layout === 'strip') return `Main ${percentOf(share)}%`
  return `${percentOf(share)}% wide`
}

const roundShare = (share) => Math.round(share * 1000) / 1000

const KEY_STEPS = {
  ArrowLeft: -KEY_STEP,
  ArrowDown: -KEY_STEP,
  ArrowRight: KEY_STEP,
  ArrowUp: KEY_STEP,
}
