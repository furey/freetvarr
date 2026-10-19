export const ManualOption = {
  props: {
    href: { type: String, default: '' },
    label: { type: String, required: true },
    disabled: { type: Boolean, default: false },
  },
  emits: ['choose'],
  template: `
    <div class="border-t border-hairline pt-3 space-y-1">
      <p class="field-label">Or, by hand</p>
      <p class="text-sm text-ink-dim leading-relaxed">
        <slot />
        <a v-if="href" class="btn-link" :href="href" target="_blank" rel="noopener">{{ label }}</a>
        <button v-else type="button" class="btn-link" :disabled="disabled" @click="$emit('choose')">{{ label }}</button>
      </p>
    </div>
  `,
}
