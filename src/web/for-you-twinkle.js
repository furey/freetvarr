export const twinkleGateOf = ({ played, reducedMotion, visible, introActive }) => {
  if (played || reducedMotion) return 'skip'
  if (!visible) return 'wait-visible'
  return introActive ? 'wait-intro' : 'play'
}
