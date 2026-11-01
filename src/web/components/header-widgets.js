import { computed } from '/vendor/vue.esm-browser.prod.js'
import { healthAlertOf } from '/health-level.js'
import { recordingChipOf, recordingChipTargetOf } from '/recording-chip.js'
import { WarningGlyph } from '/components/nav-icons.js'
import { openSearch } from '/components/search-overlay.js'
import { dismissHealthAlert, health, healthAlertDismissal } from '/shared/health.js'
import { recordingNow } from '/shared/recording-now.js'
import { navigateFrom } from '/shared/router.js'
import { now, fmtClockTz } from '/shared/time.js'

const HEALTH_HREF = '#/settings/system/health'

export const SearchButton = {
  template: `
    <button type="button" class="ui-icon-button" aria-label="Search" title="Search" @click="openSearch"><search-glyph /></button>
  `,
  setup: () => ({ openSearch }),
}

export const ChannelsButton = {
  props: { disabled: { type: Boolean, default: false } },
  emits: ['open'],
  template: `
    <button type="button" class="ui-icon-button" aria-label="Channels" title="Channels" :disabled="disabled" @click="$emit('open')"><sliders-icon /></button>
  `,
}

export const ClockLabel = {
  template: `<span class="ui-clock ui-only-wide"><span class="ui-clock-time">{{ clock }}</span></span>`,
  setup: () => ({ clock: computed(() => fmtClockTz(now.value.getTime())) }),
}

export const HealthAlert = {
  props: { variant: { type: String, default: 'chip' } },
  components: { WarningGlyph },
  template: `
    <div v-if="alert && variant === 'banner'" class="ui-banner health-alert health-alert-banner ui-page-banner" role="status">
      <a :href="href" class="health-alert-link">
        <warning-glyph class="health-alert-icon" />
        <span class="ui-banner-text health-alert-text">{{ alert.sentence }}</span>
        <chevron-glyph class="health-alert-chevron" />
      </a>
      <button type="button" class="health-alert-close" aria-label="Hide for a day" @click="dismiss"><close-glyph /></button>
    </div>
    <span v-else-if="alert" class="ui-header-chip health-alert-chip" role="status">
      <a :href="href" class="health-alert-link">
        <warning-glyph class="health-alert-icon" />
        <span>{{ alert.sentence }}</span>
      </a>
      <button type="button" class="health-alert-close" aria-label="Hide for a day" @click="dismiss"><close-glyph /></button>
    </span>
  `,
  setup() {
    const alert = computed(() => healthAlertOf({
      health: health.value,
      dismissal: healthAlertDismissal.value,
      nowMs: now.value.getTime(),
    }))
    const dismiss = () => dismissHealthAlert({ sentence: alert.value.sentence, nowMs: now.value.getTime() })
    return { href: HEALTH_HREF, alert, dismiss }
  },
}

export const RecordingChip = {
  props: { variant: { type: String, default: 'chip' } },
  template: `
    <template v-if="chip">
      <a v-if="variant === 'banner'" :href="target.href" class="ui-banner is-live ui-only-phone ui-page-banner" @click="open">
        <span class="ui-dot is-live"></span>
        <span class="ui-banner-text is-stacked">
          <span class="ui-banner-title">{{ chip.bannerTitle }}</span>
          <span v-if="chip.bannerDetail" class="ui-banner-detail">{{ chip.bannerDetail }}</span>
        </span>
      </a>
      <a v-else :href="target.href" class="ui-header-chip is-live ui-only-wide" :title="chip.detail || null" @click="open">
        <span class="ui-dot is-live"></span><span>{{ chip.label }}</span>
      </a>
    </template>
  `,
  setup() {
    const chip = computed(() => recordingChipOf({ active: recordingNow.value.active, nowMs: now.value.getTime() }))
    const target = computed(() => recordingChipTargetOf({ active: recordingNow.value.active }))
    const open = (event) => {
      const { href, originHash } = recordingChipTargetOf({ active: recordingNow.value.active, currentHash: window.location.hash })
      if (!originHash) return
      event.preventDefault()
      navigateFrom({ hash: href, originHash })
    }
    return { chip, target, open }
  },
}

export const PageHeader = {
  props: {
    title: { type: String, required: true },
    subtitle: { type: String, default: '' },
    subtitleShort: { type: String, default: null },
    brand: { type: Boolean, default: false },
    widgets: { type: Boolean, default: true },
    healthAlert: { type: Boolean, default: false },
  },
  template: `
    <header class="ui-page-header">
      <div class="ui-page-heading">
        <span v-if="brand" class="app-brand-mark is-small ui-only-phone" role="img" aria-label="Freetvarr"><span></span><span></span><span></span></span>
        <h1 class="ui-page-title">{{ title }}</h1><slot name="title-info" />
        <p v-if="subtitle" class="ui-page-subtitle" :class="{ 'ui-only-wide': subtitleShort === '' }">
          <template v-if="subtitleShort"><span class="ui-only-wide ui-page-subtitle-full">{{ subtitle }}</span><span class="ui-only-phone ui-page-subtitle-short">{{ subtitleShort }}</span></template>
          <template v-else>{{ subtitle }}</template>
        </p>
      </div>
      <div v-if="widgets || $slots.actions" class="ui-page-actions">
        <slot name="actions" />
        <template v-if="widgets">
          <health-alert v-if="healthAlert" />
          <recording-chip />
          <clock-label />
          <search-button />
        </template>
      </div>
      <template v-if="widgets">
        <health-alert v-if="healthAlert" variant="banner" />
        <recording-chip variant="banner" />
      </template>
      <slot name="below" />
    </header>
  `,
}
