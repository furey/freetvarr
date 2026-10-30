import { ref, watch, nextTick, onMounted, onUnmounted } from '/vendor/vue.esm-browser.prod.js'
import { overlayStack } from '/overlay-stack.js'
import { useSheetDrag } from '/shared/sheet-drag.js'

let sheetCount = 0

export const UiSheet = {
  props: {
    open: Boolean,
    title: { type: String, required: true },
    subtitle: { type: String, default: '' },
  },
  emits: ['close', 'height'],
  template: `
    <teleport to="body">
      <transition name="ui-sheet">
        <div v-if="open" class="ui-sheet-backdrop" :style="{ zIndex }" @click.self="$emit('close')">
          <section ref="sheet" class="ui-sheet" role="dialog" aria-modal="true" :aria-labelledby="titleId" tabindex="-1"
            @touchstart.passive="drag.onTouchStart" @touchmove="drag.onTouchMove" @touchend="drag.onTouchEnd" @touchcancel="drag.onTouchCancel">
            <button type="button" class="ui-sheet-grab" aria-label="Close" @click="drag.onHandleClick"></button>
            <header class="ui-sheet-header">
              <template v-if="$slots['header-lead']">
                <slot name="header-lead" />
                <div class="ui-sheet-heading">
                  <h2 :id="titleId" class="ui-sheet-title">{{ title }}</h2>
                  <p v-if="subtitle" class="ui-sheet-heading-subtitle">{{ subtitle }}</p>
                </div>
              </template>
              <h2 v-else :id="titleId" class="ui-sheet-title">{{ title }}</h2>
              <slot name="header-actions" />
            </header>
            <p v-if="subtitle && !$slots['header-lead']" class="ui-sheet-subtitle">{{ subtitle }}</p>
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
    const zIndex = ref(null)
    let returnFocus = null
    let layerId = null
    const onKeydown = (event) => {
      if (!overlayStack.isTop(layerId)) return
      if (event.key === 'Tab') return keepFocusInside({ event, root: sheet.value })
      if (event.key !== 'Escape') return
      event.stopImmediatePropagation()
      emit('close')
    }
    const heightWatcher = new ResizeObserver(() => emit('height', sheet.value?.offsetHeight ?? 0))
    const setOpen = async (isOpen) => {
      window.removeEventListener('keydown', onKeydown, true)
      heightWatcher.disconnect()
      if (!isOpen) {
        emit('height', 0)
        overlayStack.remove(layerId)
        layerId = null
        try { document.body.classList.toggle('sheet-open', overlayStack.size() > 0) } catch {}
        returnFocus?.focus?.()
        return
      }
      const layer = overlayStack.push({ onBack: () => emit('close') })
      layerId = layer.id
      zIndex.value = layer.zIndex
      try { document.body.classList.add('sheet-open') } catch {}
      returnFocus = document.activeElement
      window.addEventListener('keydown', onKeydown, true)
      await nextTick()
      if (sheet.value) heightWatcher.observe(sheet.value)
      sheet.value?.focus()
    }
    const drag = useSheetDrag({ sheet, onClose: () => emit('close') })
    watch(() => props.open, setOpen)
    onMounted(() => {
      if (props.open) setOpen(true)
    })
    onUnmounted(() => {
      if (props.open) setOpen(false)
      heightWatcher.disconnect()
    })
    return { sheet, titleId, zIndex, drag }
  },
}

export const keepFocusInside = ({ event, root }) => {
  const focusable = focusableIn(root)
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable.at(-1)
  const active = document.activeElement
  const leavingStart = event.shiftKey && (active === first || active === root)
  const leavingEnd = !event.shiftKey && active === last
  if (!leavingStart && !leavingEnd && root.contains(active)) return
  event.preventDefault()
  const target = event.shiftKey ? last : first
  target.focus()
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

const focusableIn = (root) => (root ? [...root.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null) : [])
