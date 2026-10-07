const REVEAL_TOTAL_MS = 2200
const REVEAL_STEP_MIN_MS = 80
const REVEAL_STEP_MAX_MS = 260

export const revealStepMs = (count) =>
  Math.min(REVEAL_STEP_MAX_MS, Math.max(REVEAL_STEP_MIN_MS, REVEAL_TOTAL_MS / Math.max(1, count)))

export const isStepResolved = (step) => step?.status === 'done' || step?.status === 'failed'

export const pacedSteps = ({ steps, revealed }) => steps.map((step, index) => {
  if (index < revealed) return step
  return { ...step, status: index === revealed ? 'running' : 'pending' }
})
