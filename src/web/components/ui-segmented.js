import { computed } from '/vendor/vue.esm-browser.prod.js'
import { nextSegmentIndex } from '/segment-keys.js'

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
        @click="choose(option, $event)"><slot :option="option" :selected="isSelected(option)">{{ option.label }}</slot></component>
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
    const choose = (option, event) => {
      if (option.replace && opensElsewhere(event)) return
      if (option.replace) event.preventDefault()
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

const opensElsewhere = (event) => Boolean(event?.metaKey || event?.ctrlKey || event?.shiftKey || event?.altKey || event?.button > 0)
