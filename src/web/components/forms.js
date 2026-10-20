import { ref, computed, onUnmounted, watch } from '/vendor/vue.esm-browser.prod.js'
import { formatClock, formatDate } from '/time-format.js'

const noAutofillAttrs = {
  'data-1p-ignore': '',
  'data-lpignore': 'true',
  'data-bwignore': '',
  'data-form-type': 'other'
}

export const noAutofill = {
  mounted: (el, { modifiers }) => {
    el.setAttribute('autocomplete', modifiers['new-password'] ? 'new-password' : 'off')
    Object.entries(noAutofillAttrs).forEach(([name, value]) => el.setAttribute(name, value))
  }
}

export const ToggleSwitch = {
  props: { modelValue: Boolean, label: { type: String, default: '' }, pending: Boolean },
  emits: ['update:modelValue'],
  template: `
    <button type="button" role="switch" :class="['toggle', { on: modelValue && !pending, 'is-pending': pending, 'is-instant': settling }]"
      :aria-checked="String(modelValue)" :aria-busy="pending ? 'true' : null" :disabled="pending || null"
      @click="$emit('update:modelValue', !modelValue)">
      <span class="toggle-track" aria-hidden="true"><span class="toggle-knob"></span></span>
      <span class="toggle-label"><slot>{{ label }}</slot></span>
    </button>
  `,
  setup(props) {
    const settling = ref(false)
    watch(() => props.pending, (pending, wasPending) => {
      if (pending || !wasPending) return
      settling.value = true
      requestAnimationFrame(() => requestAnimationFrame(() => { settling.value = false }))
    })
    return { settling }
  },
}

export const TimeZoneField = {
  props: {
    modelValue: { type: String, default: '' },
    source: { type: String, default: 'system' },
    hint: { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
  template: `
    <div class="field-row">
      <label class="field-label" for="time-zone-select">Time zone</label>
      <select id="time-zone-select" class="field-input" :value="modelValue"
        @change="$emit('update:modelValue', $event.target.value)">
        <option v-for="zone in zones" :key="zone" :value="zone">{{ zone }}</option>
      </select>
      <p v-if="modelValue" class="text-xs text-ink-dim mt-2 ui-tabular">Now {{ readout }}</p>
      <p v-if="fromEnv" class="text-xs text-ink-dim mt-2">Pre-filled from <code>TZ</code> in your .env file.</p>
      <p v-else-if="hint" class="text-xs text-ink-dim mt-2">Pre-filled from this browser. Freetvarr uses it for the guide, recordings, and the sync schedule.</p>
    </div>
  `,
  setup(props) {
    const nowMs = ref(Date.now())
    const timer = setInterval(() => (nowMs.value = Date.now()), 15000)
    onUnmounted(() => clearInterval(timer))
    const fromEnv = computed(() => props.source === 'env')
    const zones = computed(() => {
      const known = Intl.supportedValuesOf('timeZone')
      return props.modelValue && !known.includes(props.modelValue)
        ? [props.modelValue, ...known]
        : known
    })
    const readout = computed(() => {
      try {
        return `${formatDate(nowMs.value, props.modelValue)} ${formatClock(nowMs.value, props.modelValue)}`
      } catch {
        return props.modelValue
      }
    })
    return { fromEnv, zones, readout }
  },
}
