const plexSummary = (p) => {
  if (p.triggered) return { kind: 'mark', label: 'plex', mark: 'done', text: `(${p.status})` }
  if (p.skipped) return { kind: 'text', text: 'plex: skipped' }
  if (p.error) return { kind: 'mark', label: 'plex', mark: 'failed', text: p.error }
  return { kind: 'text', text: 'plex ?' }
}

const deleteSummary = (d) => {
  if (d.triggered) return { kind: 'mark', label: 'rm', mark: 'done', text: String(d.removed?.length ?? '?') }
  if (d.skipped) return { kind: 'text', text: `rm: ${d.reason || ''}`.trim() }
  if (d.error) return { kind: 'mark', label: 'rm', mark: 'failed', text: d.error }
  return { kind: 'text', text: 'rm ?' }
}

const adsSummary = (a) => {
  const bits = []
  if (a.detected) bits.push(`${a.detected} detected`)
  if (a.cut) bits.push(`${a.cut} cut`)
  if (a.failed) bits.push(`${a.failed} failed`)
  return `ads ${bits.length ? bits.join(' · ') : `${a.scanned} scanned`}`
}

const triggerMeta = (t) => {
  if (t === 'cron') return { kind: 'trigger-cron', title: 'Cron-scheduled sync' }
  if (t === 'recording-finished') return { kind: 'trigger-cron', title: 'Sync after a recording finished' }
  if (t === 'manual-single') return { kind: 'trigger-manual', title: 'Manual single-show sync' }
  if (t === 'manual') return { kind: 'trigger-manual', title: 'Manual full sync' }
  return { kind: 'text', text: t }
}

const summaryParts = (s) => {
  if (!s) return []
  const parts = []
  if (s.trigger) parts.push({ role: 'trigger', ...triggerMeta(s.trigger) })
  if (s.imported !== undefined) parts.push({ role: 'import', kind: 'import', text: String(s.imported) })
  if (s.skipped !== undefined) parts.push({ role: 'skip', kind: 'text', text: `skip ${s.skipped}` })
  if (s.failed) parts.push({ role: 'fail', kind: 'text', text: `fail ${s.failed}` })
  if (s.plex) parts.push({ role: 'plex', ...plexSummary(s.plex) })
  if (s.delete) parts.push({ role: 'delete', ...deleteSummary(s.delete) })
  if (s.ads) parts.push({ role: 'ads', kind: 'text', text: adsSummary(s.ads) })
  if (s.message) parts.push({ role: 'message', kind: 'text', text: s.message })
  if (s.errors?.length) {
    const tail = s.errors.length > 2 ? '…' : ''
    parts.push({ role: 'errors', kind: 'text', text: `errors: ${s.errors.slice(0, 2).join('; ')}${tail}` })
  }
  return parts
}

export const SummaryLine = {
  props: ['summary', 'roles'],
  computed: {
    parts() {
      const parts = summaryParts(this.summary)
      return this.roles ? parts.filter((p) => this.roles.includes(p.role)) : parts
    }
  },
  template: `
    <code v-if="parts.length" class="inline-flex items-center gap-1.5 flex-wrap align-middle">
      <template v-for="(p, i) in parts" :key="i">
        <span v-if="i > 0" class="text-ink-mute">·</span>
        <span v-if="p.kind === 'trigger-cron'" class="inline-flex items-center align-middle text-ink-dim" :title="p.title" :aria-label="p.title">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 align-middle" aria-hidden="true">
            <circle cx="8" cy="8" r="5.75"/>
            <path d="M8 5v3.25l2.25 1.5"/>
          </svg>
        </span>
        <span v-else-if="p.kind === 'trigger-manual'" class="inline-flex items-center align-middle text-ink-dim" :title="p.title" :aria-label="p.title">
          <svg viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5 align-middle" aria-hidden="true">
            <path d="M5 3.5v9a0.5 0.5 0 0 0 0.78 0.42l6.8-4.5a0.5 0.5 0 0 0 0-0.84l-6.8-4.5A0.5 0.5 0 0 0 5 3.5z"/>
          </svg>
        </span>
        <span v-else class="inline-flex items-center gap-1 align-middle">
          <svg v-if="p.kind === 'import'" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 align-middle text-ink-dim" aria-hidden="true">
            <path d="M8 2.5v7.5M5 7l3 3 3-3M3 13.5h10"/>
          </svg>
          <template v-if="p.kind === 'mark'">
            <span>{{ p.label }}</span>
            <step-mark-icon :state="p.mark" :class="['w-3.5', 'h-3.5', 'align-middle', p.mark === 'done' ? 'text-success' : 'text-live-text']" />
          </template>
          <span>{{ p.text }}</span>
        </span>
      </template>
    </code>
  `,
}
