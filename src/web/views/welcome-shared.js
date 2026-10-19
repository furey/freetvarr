import { ref, computed } from '/vendor/vue.esm-browser.prod.js'
import { revealStepMs, isStepResolved, shownJob, STEP_PACING } from '/paced-reveal.js'
import { wait, prefersReducedMotion } from '/shared/utils.js'

export const usePacedJob = (job) => {
  const revealed = ref(0)
  let revealing = false
  const shown = computed(() => shownJob({ job: job.value, revealed: revealed.value }))

  const stepAtCursor = () => job.value?.steps[revealed.value]

  const reveal = async () => {
    if (revealing) return
    revealing = true
    try {
      while (job.value && revealed.value < job.value.steps.length) {
        const stepMs = revealStepMs(job.value.steps.length, STEP_PACING)
        const shownAt = Date.now()
        while (job.value?.running && !isStepResolved(stepAtCursor())) await wait(BOOTSTRAP_REVEAL_POLL_MS)
        const step = stepAtCursor()
        if (!isStepResolved(step)) break
        await wait(Math.max(0, stepMs - (Date.now() - shownAt)))
        revealed.value += 1
        if (step.status === 'failed') break
      }
    } finally {
      revealing = false
    }
    showAll()
  }

  const showAll = () => {
    revealed.value = job.value?.steps.length || 0
  }

  const begin = () => {
    revealed.value = 0
    if (prefersReducedMotion()) return showAll()
    reveal()
  }

  return { shown, begin, showAll }
}

export const SETUP_POLL_MS = 1500

export const secureStepDot = (status) => ({
  pending: 'idle',
  running: 'live',
  done: 'bg-plex-yellow',
  failed: 'bg-signal-orange',
})[status] || 'idle'

export const BOOTSTRAP_REVEAL_POLL_MS = 50
