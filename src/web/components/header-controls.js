import { useMediaQuery } from '/shared/composables.js'
import { EPG_NARROW_QUERY } from '/shared/constants.js'

export const HeaderButton = {
  props: { label: { type: String, required: true } },
  template: `
    <button type="button" :class="['btn', 'btn-sm', { 'btn-icon': narrow }]"
      :aria-label="narrow ? label : null" :title="narrow ? label : null">
      <slot /><template v-if="!narrow">{{ label.toUpperCase() }}</template>
    </button>
  `,
  setup() {
    return { narrow: useMediaQuery(EPG_NARROW_QUERY) }
  },
}

export const ZoomControl = {
  props: {
    index: { type: Number, required: true },
    count: { type: Number, required: true },
    showLabel: { type: Boolean, default: true },
  },
  emits: ['step'],
  template: `
    <div class="flex items-center gap-2" role="group" aria-label="Zoom">
      <span v-if="showLabel" class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim">ZOOM</span>
      <div class="chip-row">
        <button type="button" class="btn btn-sm btn-icon epg-zoom-btn" aria-label="Zoom out"
          :disabled="index === 0" @click="$emit('step', -1)"><minus-icon /></button>
        <button type="button" class="btn btn-sm btn-icon epg-zoom-btn" aria-label="Zoom in"
          :disabled="index === count - 1" @click="$emit('step', 1)"><plus-icon /></button>
      </div>
    </div>
  `,
}
