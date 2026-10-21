const STEP_KEYS = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }

export const nextSegmentIndex = ({ key, from, enabled }) => {
  const usable = enabled.flatMap((isEnabled, index) => (isEnabled ? [index] : []))
  if (!usable.length) return -1
  if (key === 'Home') return usable[0]
  if (key === 'End') return usable.at(-1)
  const step = STEP_KEYS[key]
  if (!step) return -1
  const position = usable.indexOf(from)
  if (position === -1) return usable[0]
  return usable[(position + step + usable.length) % usable.length]
}
