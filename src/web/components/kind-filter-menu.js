import { computed, onUnmounted, ref, watch } from '/vendor/vue.esm-browser.prod.js'
import { kindFilterChoicesOf, kindOfQuery } from '/kind-filter.js'

let kindFilterCount = 0

export const useKindFilter = ({ query, nameLabel }) => {
  kindFilterCount += 1
  const listId = `kind-filter-${kindFilterCount}`
  const nameMode = ref(false)
  const focused = ref(false)
  const dismissed = ref(false)
  const highlighted = ref(0)
  const anchorEl = ref(null)
  const choices = computed(() => kindFilterChoicesOf({ query: query.value, nameLabel }))
  const queryKind = computed(() => kindOfQuery(query.value))
  const activeKind = computed(() => (nameMode.value ? null : queryKind.value))
  const open = computed(() => choices.value.length > 0 && focused.value && !dismissed.value)

  watch(query, () => {
    nameMode.value = false
    dismissed.value = false
    highlighted.value = 0
  })

  const optionId = (key) => `${listId}-${key}`

  const fieldAttrs = computed(() => ({
    role: 'combobox',
    'aria-autocomplete': 'list',
    'aria-controls': listId,
    'aria-expanded': String(open.value),
    'aria-activedescendant': open.value ? optionId(choices.value[highlighted.value]?.key) : null,
  }))

  const choose = (key) => {
    nameMode.value = key === 'name'
    highlighted.value = nameMode.value ? 1 : 0
    dismissed.value = true
  }

  const onFocus = (event) => {
    anchorEl.value = event.currentTarget.closest('[data-kind-filter-anchor]') || event.currentTarget
    focused.value = true
  }

  const onBlur = () => {
    focused.value = false
    dismissed.value = false
  }

  const moveHighlight = (step) => {
    if (!open.value) {
      dismissed.value = false
      return
    }
    const count = choices.value.length
    highlighted.value = (highlighted.value + step + count) % count
  }

  const KEY_ACTIONS = {
    ArrowDown: () => moveHighlight(1),
    ArrowUp: () => moveHighlight(-1),
    Enter: () => choose(choices.value[highlighted.value].key),
    Escape: () => { dismissed.value = true },
  }

  const handlesKey = (key) => choices.value.length > 0 && key in KEY_ACTIONS && (open.value || key.startsWith('Arrow'))

  const onKeydown = (event) => {
    if (!handlesKey(event.key)) return false
    event.preventDefault()
    event.stopPropagation()
    KEY_ACTIONS[event.key]()
    return true
  }

  return {
    listId, choices, activeKind, nameMode, open, highlighted, anchorEl, fieldAttrs, optionId,
    choose, onFocus, onBlur, onKeydown,
  }
}

const FilmGlyph = {
  template: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 7.5h4M3 12h18M3 16.5h4M17 7.5h4M17 16.5h4"/></svg>
  `,
}

export const KindFilterMenu = {
  components: { FilmGlyph },
  props: {
    filter: { type: Object, required: true },
  },
  template: `
    <teleport to="body">
      <ul v-if="filter.open.value" :id="filter.listId" role="listbox" class="kind-filter-menu" :style="placement"
        aria-label="Filter by" @mousedown.prevent>
        <li v-for="(choice, i) in filter.choices.value" :key="choice.key" :id="filter.optionId(choice.key)" role="option"
          :aria-selected="String(i === filter.highlighted.value)"
          :class="['kind-filter-option', { 'is-active': i === filter.highlighted.value }]"
          @pointermove="filter.highlighted.value = i" @click="filter.choose(choice.key)">
          <film-glyph v-if="choice.icon === 'kind'" /><search-glyph v-else />
          <span class="kind-filter-option-label">{{ choice.label }}</span>
        </li>
      </ul>
    </teleport>
  `,
  setup(props) {
    const placement = ref({})

    const place = () => {
      const box = props.filter.anchorEl.value?.getBoundingClientRect()
      if (!box) return
      const room = window.innerWidth - MENU_GUTTER_PX * 2
      const width = Math.min(Math.max(box.width, MENU_MIN_WIDTH_PX), room)
      const left = Math.max(MENU_GUTTER_PX, Math.min(box.left, window.innerWidth - MENU_GUTTER_PX - width))
      placement.value = { top: `${Math.round(box.bottom + MENU_GAP_PX)}px`, left: `${Math.round(left)}px`, width: `${Math.round(width)}px` }
    }

    const follow = (on) => {
      const method = on ? 'addEventListener' : 'removeEventListener'
      window[method]('resize', place)
      window[method]('scroll', place, { capture: true, passive: true })
    }

    watch(props.filter.open, (open) => {
      follow(open)
      if (open) place()
    }, { immediate: true })
    onUnmounted(() => follow(false))

    return { placement }
  },
}

const MENU_GUTTER_PX = 8
const MENU_GAP_PX = 6
const MENU_MIN_WIDTH_PX = 340
