import { computed } from '/vendor/vue.esm-browser.prod.js'

const STEP_KEYS = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }

export const nextSegmentIndex = ({ key, from, enabled }) => {
  const usable = enabled.flatMap((isEnabled, index) => (isEnabled ? [index] : []))
  if (!usable.length) return -1
  if (key === 'Home') return usable[0]
  if (key === 'End') return usable.at(-1)
  const step = STEP_KEYS[key]
  if (!step) return -1
  const position = usable.indexOf(from)
  if (position === -1) return usable[0]
  return usable[(position + step + usable.length) % usable.length]
}

export const UiSegmented = {
  props: {
    modelValue: { type: [String, Number, Boolean], default: null },
    options: { type: Array, required: true },
    tabs: Boolean,
    fill: Boolean,
    compact: Boolean,
    label: { type: String, default: '' },
    disabled: Boolean,
  },
  emits: ['update:modelValue'],
  template: `
    <div :class="['ui-segmented', { 'is-fill': fill, 'is-compact': compact }]" :role="tabs ? 'tablist' : 'radiogroup'" @keydown="onKeydown">
      <span v-if="label" class="ui-segmented-label" aria-hidden="true">{{ label }}</span>
      <component :is="option.href ? 'a' : 'button'" v-for="(option, index) in options" :key="String(option.value)"
        :type="option.href ? null : 'button'" :href="option.href || null"
        :class="['ui-segment', option.class]" :role="tabs ? 'tab' : 'radio'"
        :aria-selected="tabs ? String(isSelected(option)) : null"
        :aria-checked="tabs ? null : String(isSelected(option))"
        :aria-label="option.ariaLabel || null" :title="option.title || null"
        :tabindex="index === focusIndex ? 0 : -1"
        :disabled="option.href ? null : isDisabled(option) || null"
        @click="choose(option)"><slot :option="option" :selected="isSelected(option)">{{ option.label }}</slot></component>
    </div>
  `,
  setup(props, { emit }) {
    const isSelected = (option) => props.modelValue !== null && option.value === props.modelValue
    const isDisabled = (option) => props.disabled || Boolean(option.disabled)
    const focusIndex = computed(() => {
      const selected = props.options.findIndex(isSelected)
      if (selected !== -1) return selected
      return Math.max(0, props.options.findIndex((option) => !isDisabled(option)))
    })
    const choose = (option) => {
      if (isDisabled(option) || isSelected(option)) return
      emit('update:modelValue', option.value)
    }
    const onKeydown = (event) => {
      const segments = [...event.currentTarget.querySelectorAll(':scope > .ui-segment')]
      const target = nextSegmentIndex({
        key: event.key,
        from: segments.indexOf(document.activeElement),
        enabled: props.options.map((option) => !isDisabled(option)),
      })
      if (target === -1) return
      event.preventDefault()
      segments[target].focus()
      segments[target].click()
    }
    return { isSelected, isDisabled, focusIndex, choose, onKeydown }
  },
}
