import { computed } from '/vendor/vue.esm-browser.prod.js'
import { healthLabelOf } from '/health-level.js'
import { recordingChipOf } from '/recording-chip.js'
import { openSearch } from '/components/search-overlay.js'
import { health } from '/shared/health.js'
import { recordingNow } from '/shared/recording-now.js'
import { now, fmtClockTz } from '/shared/time.js'

const HEALTH_HREF = '#/settings/system/health'
const SCHEDULED_HREF = '#/recordings/scheduled'

export const SearchButton = {
  template: `
    <button type="button" class="ui-icon-button" aria-label="Search" title="Search" @click="openSearch"><search-glyph /></button>
  `,
  setup: () => ({ openSearch }),
}

export const ClockLabel = {
  template: `<span class="ui-clock ui-only-wide">{{ clock }}</span>`,
  setup: () => ({ clock: computed(() => fmtClockTz(now.value.getTime())) }),
}

export const HealthDot = {
  props: { variant: { type: String, default: 'chip' } },
  template: `
    <template v-if="variant === 'banner'">
      <a v-if="needsAttention" :href="href" :class="['ui-banner', 'ui-only-phone', 'ui-page-banner', level === 'fail' ? 'is-error' : 'is-warning']">
        <span :class="['ui-dot', dotClass]"></span>
        <span class="ui-banner-text">{{ label }}</span>
        <chevron-glyph class="ui-group-row-chevron" />
      </a>
    </template>
    <template v-else>
      <a :href="href" :class="['ui-header-chip', 'ui-only-wide', chipClass]" :aria-label="'System health: ' + label">
        <span :class="['ui-dot', dotClass]"></span><span>{{ label }}</span>
      </a>
      <a v-if="!needsAttention" :href="href" class="ui-health-button ui-only-phone" :aria-label="'System health: ' + label" :title="label">
        <span :class="['ui-dot', dotClass]"></span>
      </a>
    </template>
  `,
  setup() {
    const level = computed(() => (health.value.known ? health.value.level : 'unknown'))
    const needsAttention = computed(() => level.value === 'warn' || level.value === 'fail')
    const label = computed(() => (health.value.known ? healthLabelOf(health.value) : 'Checking'))
    const dotClass = computed(() => ({ ok: 'is-ok', warn: 'is-warn', fail: 'is-fail' })[level.value] || '')
    const chipClass = computed(() => ({ warn: 'is-warn', fail: 'is-fail' })[level.value] || '')
    return { href: HEALTH_HREF, level, needsAttention, label, dotClass, chipClass }
  },
}

export const RecordingChip = {
  props: { variant: { type: String, default: 'chip' } },
  template: `
    <template v-if="chip">
      <a v-if="variant === 'banner'" :href="href" class="ui-banner is-live ui-only-phone ui-page-banner">
        <span class="ui-dot is-live"></span>
        <span class="ui-banner-text">{{ chip.label }}<template v-if="chip.detail"> · {{ chip.detail }}</template></span>
        <chevron-glyph class="ui-group-row-chevron" />
      </a>
      <a v-else :href="href" class="ui-header-chip is-live ui-only-wide" :title="chip.detail || null">
        <span class="ui-dot is-live"></span><span>{{ chip.label }}</span>
      </a>
    </template>
  `,
  setup() {
    const chip = computed(() => recordingChipOf({ active: recordingNow.value.active, nowMs: now.value.getTime() }))
    return { chip, href: SCHEDULED_HREF }
  },
}

export const PageHeader = {
  props: {
    title: { type: String, required: true },
    subtitle: { type: String, default: '' },
    brand: { type: Boolean, default: false },
    widgets: { type: Boolean, default: true },
  },
  template: `
    <header class="ui-page-header">
      <div class="ui-page-heading">
        <span v-if="brand" class="app-brand-mark is-small ui-only-phone" role="img" aria-label="Freetvarr"><span></span><span></span><span></span></span>
        <h1 class="ui-page-title">{{ title }}</h1>
        <p v-if="subtitle" class="ui-page-subtitle">{{ subtitle }}</p>
      </div>
      <div v-if="widgets || $slots.actions" class="ui-page-actions">
        <slot name="actions" />
        <template v-if="widgets">
          <recording-chip />
          <health-dot />
          <clock-label />
          <search-button />
        </template>
      </div>
      <template v-if="widgets">
        <recording-chip variant="banner" />
        <health-dot variant="banner" />
      </template>
      <slot name="below" />
    </header>
  `,
}
