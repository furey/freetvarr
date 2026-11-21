import { ref, watch, onUnmounted } from '/vendor/vue.esm-browser.prod.js'
import { infoPanelScrollsOf } from '/live-info.js'

export const PlayerInfoPanel = {
  props: {
    open: Boolean,
    panelId: { type: String, required: true },
  },
  setup() {
    const bodyEl = ref(null)
    const textEl = ref(null)
    const scrolls = useScrollingPanel({ bodyEl, textEl })
    return { bodyEl, textEl, scrolls }
  },
  template: `
    <transition name="live-info">
    <section v-if="open" :id="panelId" class="live-info" role="region" aria-label="Programme info">
      <div ref="bodyEl" :class="['live-info-body', { 'is-scrolling': scrolls }]">
        <slot name="image" />
        <div ref="textEl" class="live-info-text"><slot /></div>
      </div>
    </section>
    </transition>
  `,
}

const useScrollingPanel = ({ bodyEl, textEl }) => {
  const scrolls = ref(false)
  const measure = () => {
    const body = bodyEl.value
    if (!body) return
    scrolls.value = infoPanelScrollsOf({
      scrollHeight: body.scrollHeight,
      clientHeight: body.clientHeight,
      reservedBand: parseFloat(getComputedStyle(body).marginBottom) || 0,
    })
  }
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
  watch([bodyEl, textEl], ([body, text]) => {
    observer?.disconnect()
    if (!body) {
      scrolls.value = false
      return
    }
    observer?.observe(body)
    if (text) observer?.observe(text)
    measure()
  }, { flush: 'post', immediate: true })
  onUnmounted(() => observer?.disconnect())
  return scrolls
}
