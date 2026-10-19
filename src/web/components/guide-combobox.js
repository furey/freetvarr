import {
  ref,
  computed,
  onMounted,
  onUnmounted,
  watch,
  nextTick,
} from '/vendor/vue.esm-browser.prod.js'
import { filterOptions, optionLabel, nextChoosableIndex, isChoosable } from '/typeahead.js'

const COMBOBOX_LIST_MAX_PX = 256
const COMBOBOX_LIST_MIN_PX = 140
const COMBOBOX_VIEWPORT_GAP_PX = 8
let comboboxCount = 0

export const GuideCombobox = {
  props: {
    modelValue: { type: String, default: '' },
    options: { type: Array, default: () => [] },
    noneLabel: { type: String, required: true },
    inputId: { type: String, default: '' },
    label: { type: String, default: '' },
    autofocus: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'confirm'],
  template: `
    <div class="combobox">
      <input v-no-autofill ref="input" :id="inputId || null" type="text" class="field-input combobox-input"
        role="combobox" aria-autocomplete="list" aria-haspopup="listbox"
        :aria-label="label || null" :aria-expanded="open ? 'true' : 'false'" :aria-controls="listId"
        :aria-activedescendant="open && active >= 0 ? optionId(active) : null"
        spellcheck="false" autocapitalize="off" :value="text"
        @input="onInput" @keydown="onKeydown" @click="show" @focus="$event.target.select()" @blur="close" />
      <teleport to="body">
        <ul v-show="open" ref="list" :id="listId" role="listbox" class="combobox-list" :style="listStyle"
          :aria-label="label || null" @mousedown.prevent>
          <li v-for="(o, i) in shown" :key="o.id" :id="optionId(i)" role="option"
            :aria-selected="o.id === modelValue ? 'true' : 'false'" :aria-disabled="o.empty ? 'true' : null"
            :class="['combobox-option', { active: i === active, selected: o.id === modelValue, none: o.id === '', empty: o.empty }]"
            @mousemove="active = i" @click="choose(o)">
            <span class="combobox-option-name">{{ o.name }}<span v-if="o.empty" class="combobox-option-note"> (no shows in this guide)</span></span>
            <span v-if="o.number" class="combobox-option-number">{{ o.number }}</span>
          </li>
          <li v-if="typed && shown.length === 1" class="combobox-empty" role="presentation">No channel matches</li>
        </ul>
      </teleport>
    </div>
  `,
  setup(props, { emit }) {
    comboboxCount += 1
    const listId = `combobox-list-${comboboxCount}`
    const input = ref(null)
    const list = ref(null)
    const open = ref(false)
    const typed = ref(false)
    const active = ref(-1)
    const listStyle = ref({})
    const currentLabel = computed(() =>
      optionLabel({ options: props.options, value: props.modelValue, noneLabel: props.noneLabel }))
    const text = ref(currentLabel.value)
    const noneOption = computed(() => ({ id: '', name: props.noneLabel }))
    const shown = computed(() => [
      noneOption.value,
      ...(typed.value ? filterOptions({ options: props.options, query: text.value }) : props.options),
    ])

    const optionId = (i) => `${listId}-option-${i}`

    const placeList = () => {
      const box = input.value?.getBoundingClientRect()
      if (!box) return
      const below = window.innerHeight - box.bottom - COMBOBOX_VIEWPORT_GAP_PX
      const above = box.top - COMBOBOX_VIEWPORT_GAP_PX
      const goesBelow = below >= COMBOBOX_LIST_MIN_PX || below >= above
      const room = goesBelow ? below : above
      listStyle.value = {
        left: `${box.left}px`,
        width: `${box.width}px`,
        maxHeight: `${Math.max(80, Math.min(COMBOBOX_LIST_MAX_PX, room))}px`,
        ...(goesBelow
          ? { top: `${box.bottom + 2}px` }
          : { bottom: `${window.innerHeight - box.top + 2}px` }),
      }
    }

    const scrollActiveIntoView = async () => {
      await nextTick()
      document.getElementById(optionId(active.value))?.scrollIntoView({ block: 'nearest' })
    }

    const setActive = (index) => {
      active.value = index
      scrollActiveIntoView()
    }

    const currentIndex = () => Math.max(0, shown.value.findIndex((o) => o.id === props.modelValue))

    const show = () => {
      if (open.value) return
      open.value = true
      placeList()
      setActive(currentIndex())
    }

    const close = () => {
      open.value = false
      typed.value = false
      text.value = currentLabel.value
      active.value = -1
    }

    const choose = (option) => {
      if (!isChoosable(option)) return
      emit('update:modelValue', option.id)
      open.value = false
      typed.value = false
      text.value = option.id === '' ? props.noneLabel : option.name
      active.value = -1
    }

    const onInput = (e) => {
      text.value = e.target.value
      typed.value = true
      if (!open.value) {
        open.value = true
        placeList()
      }
      setActive(shown.value.length > 1 ? 1 : 0)
    }

    const move = (delta) => {
      if (!open.value) return show()
      setActive(nextChoosableIndex({ options: shown.value, current: active.value, delta }))
    }

    const onEnter = (e) => {
      e.preventDefault()
      if (!open.value) return emit('confirm')
      const option = shown.value[active.value]
      if (option) choose(option)
    }

    const onEscape = (e) => {
      if (!open.value) return
      e.preventDefault()
      e.stopPropagation()
      close()
    }

    const keyHandlers = {
      ArrowDown: (e) => { e.preventDefault(); move(1) },
      ArrowUp: (e) => { e.preventDefault(); move(-1) },
      Enter: onEnter,
      Escape: onEscape,
      Tab: close,
    }

    const onKeydown = (e) => keyHandlers[e.key]?.(e)

    watch(currentLabel, (label) => {
      if (!typed.value) text.value = label
    })

    watch(open, (isOpen) => {
      const method = isOpen ? 'addEventListener' : 'removeEventListener'
      window[method]('scroll', placeList, true)
      window[method]('resize', placeList)
    })

    onMounted(() => {
      if (!props.autofocus) return
      input.value?.focus()
    })
    onUnmounted(() => {
      window.removeEventListener('scroll', placeList, true)
      window.removeEventListener('resize', placeList)
    })

    return {
      input, list, listId, open, typed, active, text, shown, listStyle,
      optionId, show, close, choose, onInput, onKeydown,
    }
  },
}
