import { ref, watch, nextTick, onMounted, onUnmounted } from '/vendor/vue.esm-browser.prod.js'

let sheetCount = 0

export const UiSheet = {
  props: {
    open: Boolean,
    title: { type: String, required: true },
    subtitle: { type: String, default: '' },
  },
  emits: ['close'],
  template: `
    <teleport to="body">
      <transition name="ui-sheet">
        <div v-if="open" class="ui-sheet-backdrop" @click.self="$emit('close')">
          <section ref="sheet" class="ui-sheet" role="dialog" aria-modal="true" :aria-labelledby="titleId" tabindex="-1">
            <span class="ui-sheet-grab" aria-hidden="true"></span>
            <header class="ui-sheet-header">
              <h2 :id="titleId" class="ui-sheet-title">{{ title }}</h2>
              <slot name="header-actions" />
            </header>
            <p v-if="subtitle" class="ui-sheet-subtitle">{{ subtitle }}</p>
            <slot />
            <div v-if="$slots.footer" class="ui-sheet-footer"><slot name="footer" /></div>
          </section>
        </div>
      </transition>
    </teleport>
  `,
  setup(props, { emit }) {
    const sheet = ref(null)
    const titleId = `ui-sheet-title-${++sheetCount}`
    let returnFocus = null
    const onKeydown = (event) => {
      if (event.key !== 'Escape') return
      event.stopImmediatePropagation()
      emit('close')
    }
    const setOpen = async (isOpen) => {
      try { document.body.classList.toggle('sheet-open', isOpen) } catch {}
      window.removeEventListener('keydown', onKeydown, true)
      if (!isOpen) {
        returnFocus?.focus?.()
        return
      }
      returnFocus = document.activeElement
      window.addEventListener('keydown', onKeydown, true)
      await nextTick()
      sheet.value?.focus()
    }
    watch(() => props.open, setOpen)
    onMounted(() => {
      if (props.open) setOpen(true)
    })
    onUnmounted(() => {
      if (props.open) setOpen(false)
    })
    return { sheet, titleId }
  },
}
