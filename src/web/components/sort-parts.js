export const SortGripIcon = {
  template: `
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
      <path d="M4 6h12M4 10h12M4 14h12"/>
    </svg>
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

export const SortUndoToast = {
  props: { toast: { type: Object, default: null } },
  emits: ['undo'],
  template: `
    <div v-if="toast" :class="['ui-toast', 'sort-toast', { 'is-error': toast.error }]" role="status">
      <span class="sort-toast-text">{{ toast.text }}</span>
      <button v-if="toast.previous" type="button" class="sort-toast-undo" @click="$emit('undo')">Undo</button>
    </div>
  `,
}

export const SORT_PART_COMPONENTS = {
  'sort-grip-icon': SortGripIcon,
  'sort-dots-icon': SortDotsIcon,
  'sort-announcer': SortAnnouncer,
  'sort-undo-toast': SortUndoToast,
}
