import { computed } from '/vendor/vue.esm-browser.prod.js'
import { diagnoseRecordingError } from '/recording-error.js'
import { DOCS_BASE } from '/shared/constants.js'

export const ErrorDiagnosis = {
  props: { error: { type: String, required: true } },
  template: `
    <div class="error-diagnosis">
      <p class="sync-detail-meta">{{ diagnosis.title }}</p>
      <p class="text-sm text-ink">{{ diagnosis.meaning }}</p>
      <pre class="error-details-full">{{ diagnosis.error }}</pre>
      <p class="deck-card-label">What to try</p>
      <ul class="error-details-steps text-sm text-ink-dim">
        <li v-for="(step, i) in diagnosis.steps" :key="i">{{ step }}</li>
      </ul>
      <div class="card-actions">
        <a href="#/settings/system/health" class="btn btn-sm no-hover-underline">Open Health</a>
        <a :href="docUrl" target="_blank" rel="noopener noreferrer" class="btn btn-sm no-hover-underline">Read the docs <external-link-icon /></a>
      </div>
    </div>
  `,
  setup(props) {
    const diagnosis = computed(() => diagnoseRecordingError(props.error))
    const docUrl = computed(() => `${DOCS_BASE}${diagnosis.value.doc}`)
    return { diagnosis, docUrl }
  },
}
