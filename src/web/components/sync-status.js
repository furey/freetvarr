import { syncOutcome, syncResult } from '/sync-row.js'

const SYNC_OUTCOME_LABELS = { ok: 'OK', partial: 'Partial', failed: 'Failed', running: 'Running' }

export const SyncStatusIcon = {
  props: { status: { type: String, required: true } },
  computed: {
    outcome() { return syncOutcome({ status: this.status }) },
    label() { return SYNC_OUTCOME_LABELS[this.outcome] },
  },
  template: `
    <svg :class="['sync-status-icon', outcome]" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" role="img" :aria-label="label">
      <title>{{ label }}</title>
      <path v-if="outcome === 'ok'" d="M3.5 8.5l3 3 6-7"/>
      <template v-else-if="outcome === 'partial'"><path d="M8 2.25 14.25 13.25H1.75z" stroke-width="1.5"/><path d="M8 6.5v3M8 11.4v.01" stroke-width="1.5"/></template>
      <path v-else-if="outcome === 'failed'" d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>
      <g v-else class="sync-status-spin"><circle cx="8" cy="8" r="5.5" opacity="0.3"/><path d="M8 2.5a5.5 5.5 0 0 1 5.5 5.5"/></g>
    </svg>
  `,
}

export const SyncResult = {
  props: { sync: { type: Object, required: true } },
  computed: {
    parts() { return syncResult(this.sync) },
  },
  template: `
    <span class="sync-result">
      <template v-for="(p, i) in parts" :key="p.tone">
        <span v-if="i > 0" class="sep">·</span>
        <span :class="p.tone">{{ p.text }}</span>
      </template>
    </span>
  `,
}
