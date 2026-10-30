import { ref, computed, onScopeDispose } from '/vendor/vue.esm-browser.prod.js'
import { revealStepMs, isStepResolved, shownJob, STEP_PACING } from '/paced-reveal.js'
import { runStepValue, runStepProgress } from '/setup-steps.js'
import { wait, prefersReducedMotion } from '/shared/utils.js'

export const usePacedJob = (job) => {
  const revealed = ref(0)
  let revealing = false
  let alive = true
  onScopeDispose(() => { alive = false })
  const shown = computed(() => shownJob({ job: job.value, revealed: revealed.value }))

  const stepAtCursor = () => job.value?.steps[revealed.value]

  const reveal = async () => {
    if (revealing) return
    revealing = true
    try {
      while (alive && job.value && revealed.value < job.value.steps.length) {
        const stepMs = revealStepMs(job.value.steps.length, STEP_PACING)
        const shownAt = Date.now()
        while (alive && job.value?.running && !isStepResolved(stepAtCursor())) await wait(BOOTSTRAP_REVEAL_POLL_MS)
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

export const SetupStatusIcon = {
  props: { status: { type: String, default: 'pending' } },
  template: `
    <span :class="['setup-icon', 'is-' + status]" aria-hidden="true">
      <svg v-if="status === 'done'" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="8.25" stroke-width="1.5"/><path d="m6.5 10.2 2.3 2.3 4.7-4.9"/></svg>
      <svg v-else-if="status === 'failed'" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="10" cy="10" r="8.25" stroke-width="1.5"/><path d="M10 5.75v5M10 14h.01"/></svg>
    </span>
  `,
}

export const SetupRunList = {
  props: { steps: { type: Array, default: () => [] } },
  components: { SetupStatusIcon },
  template: `
    <ol class="ui-group setup-run" aria-live="polite">
      <li v-for="s in steps" :key="s.id" :class="['ui-group-row', 'setup-run-row', 'is-' + s.status]">
        <setup-status-icon :status="s.status" />
        <span class="ui-group-row-main">
          <span class="ui-group-row-title">{{ s.label }}</span>
          <span v-if="progressOf(s) !== null" class="ui-progress setup-run-progress"><span class="ui-progress-fill" :style="{ transform: 'scaleX(' + progressOf(s) + ')' }"></span></span>
        </span>
        <slot name="extra" :step="s"></slot>
        <span v-if="valueOf(s)" class="ui-group-row-value">{{ valueOf(s) }}</span>
        <span class="ui-visually-hidden">{{ STATUS_WORDS[s.status] || '' }}</span>
      </li>
    </ol>
  `,
  setup: () => ({ valueOf: runStepValue, progressOf: runStepProgress, STATUS_WORDS }),
}

const STATUS_WORDS = { pending: ', waiting', running: ', running', done: ', done', failed: ', failed' }

export const BOOTSTRAP_REVEAL_POLL_MS = 50
