export const twinkleGateOf = ({ played, reducedMotion, animate = true, visible, introActive }) => {
  if (played || reducedMotion || !animate) return 'skip'
  if (!visible) return 'wait-visible'
  return introActive ? 'wait-intro' : 'play'
}
