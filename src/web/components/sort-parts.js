import { computed } from '/vendor/vue.esm-browser.prod.js'

export const SortGripIcon = {
  template: `
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
      <path d="M4 6h12M4 10h12M4 14h12"/>
    </svg>
  `,
}

export const SortOrderIcon = {
  template: `
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M6.5 16V4M3.5 7l3-3 3 3M13.5 4v12M10.5 13l3 3 3-3"/>
    </svg>
  `,
}

export const SortEditToggle = {
  components: { 'sort-order-icon': SortOrderIcon },
  props: { on: Boolean, iconOnly: Boolean },
  emits: ['toggle'],
  setup: (props) => ({ label: computed(() => (props.on ? 'Done' : 'Edit order')) }),
  template: `
    <button type="button" :class="['sort-edit-toggle', { 'is-icon': iconOnly, 'is-on': on }]" :aria-pressed="String(on)"
      :aria-label="iconOnly ? label : null" :title="iconOnly ? label : null" @click="$emit('toggle')">
      <template v-if="iconOnly"><check-icon v-if="on" /><sort-order-icon v-else /></template>
      <template v-else-if="on">Done</template>
      <template v-else><sort-order-icon />Edit order</template>
    </button>
  `,
}

export const SortDotsIcon = {
  template: `
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <circle cx="4.5" cy="10" r="1.5"/><circle cx="10" cy="10" r="1.5"/><circle cx="15.5" cy="10" r="1.5"/>
    </svg>
  `,
}

export const SortAnnouncer = {
  props: { message: { type: String, default: '' }, keyboardActive: Boolean },
  template: `
    <div class="ui-visually-hidden" aria-live="assertive" aria-atomic="true">{{ message }}</div>
    <teleport to="body">
      <div v-if="keyboardActive" class="sort-hint" aria-hidden="true">
        <kbd>↑</kbd><kbd>↓</kbd><span>Move</span>
        <kbd>Space</kbd><span>Drop</span>
        <kbd>Esc</kbd><span>Cancel</span>
      </div>
    </teleport>
  `,
}

export const SORT_PART_COMPONENTS = {
  'sort-grip-icon': SortGripIcon,
  'sort-order-icon': SortOrderIcon,
  'sort-edit-toggle': SortEditToggle,
  'sort-dots-icon': SortDotsIcon,
  'sort-announcer': SortAnnouncer,
}
