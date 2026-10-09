const REVEAL_TOTAL_MS = 2200
const REVEAL_STEP_MIN_MS = 80
const REVEAL_STEP_MAX_MS = 260

export const SECURE_REVEAL_PACING = { totalMs: 4000, minMs: 350, maxMs: 500 }

export const revealStepMs = (
  count,
  { totalMs = REVEAL_TOTAL_MS, minMs = REVEAL_STEP_MIN_MS, maxMs = REVEAL_STEP_MAX_MS } = {},
) => Math.min(maxMs, Math.max(minMs, totalMs / Math.max(1, count)))

export const isStepResolved = (step) => step?.status === 'done' || step?.status === 'failed'

export const pacedSteps = ({ steps, revealed }) => steps.map((step, index) => {
  if (index < revealed) return step
  return { ...step, status: index === revealed ? 'running' : 'pending' }
})

export const shownJob = ({ job, revealed }) => {
  if (!job) return { steps: [], running: false, result: null }
  const allRevealed = revealed >= job.steps.length
  return {
    steps: pacedSteps({ steps: job.steps, revealed }),
    running: Boolean(job.running) || !allRevealed,
    result: allRevealed ? job.result || null : null,
  }
}
