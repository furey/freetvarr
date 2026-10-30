import { ref, computed, onMounted, onUnmounted, nextTick } from '/vendor/vue.esm-browser.prod.js'
import { TOUR_STEPS, tourFocusOf, tourPanTransform, tourStepView } from '/system-diagram.js'
import { SystemDiagram } from '/components/system-diagram.js'
import { prefersReducedMotion, wait } from '/shared/utils.js'

export const SystemTour = {
  components: { SystemDiagram },
  emits: ['done'],
  template: `
    <section class="sd-tour" aria-labelledby="sd-tour-title">
      <div class="sd-tour-top">
        <span class="ui-meta">{{ view.caption }}</span>
        <button type="button" class="setup-later" @click="$emit('done')">Skip</button>
      </div>
      <div class="sd-tour-progress" aria-hidden="true">
        <span v-for="(item, position) in steps" :key="position" :class="{ 'is-done': position <= shown }"></span>
      </div>
      <div ref="stage" class="sd-tour-stage">
        <div ref="pan" class="sd-tour-pan" :style="panStyle"><system-diagram ref="diagram" :focus="focus" /></div>
      </div>
      <div class="sd-tour-panel">
        <div :class="['sd-tour-text', { 'is-fading': fading }]" aria-live="polite">
          <h1 id="sd-tour-title" ref="heading" tabindex="-1" class="sd-tour-title">{{ view.title }}</h1>
          <div v-if="view.pills.length" class="sd-pills">
            <span v-for="pill in view.pills" :key="pill.text" :class="['sd-pill', { 'is-quiet': pill.quiet }]">{{ pill.text }}</span>
          </div>
          <p class="sd-tour-body">{{ view.text }}</p>
          <p v-if="view.own" class="sd-tour-own"><strong>Existing setup:</strong> {{ view.own }}</p>
        </div>
        <div class="sd-tour-actions">
          <button type="button" class="ui-button ui-button-secondary" aria-label="Back" :disabled="!view.canGoBack" @click="back"><arrow-left-icon /></button>
          <button type="button" class="ui-button ui-button-primary" @click="next">{{ view.nextLabel }}</button>
        </div>
      </div>
    </section>
  `,
  setup(props, { emit }) {
    const steps = TOUR_STEPS
    const index = ref(0)
    const shown = ref(0)
    const fading = ref(false)
    const stage = ref(null)
    const pan = ref(null)
    const diagram = ref(null)
    const heading = ref(null)
    const panStyle = ref({})
    const view = computed(() => tourStepView({ index: shown.value }))
    const focus = computed(() => tourFocusOf(steps[index.value]))
    let showToken = 0

    const wideLayout = () => window.matchMedia(WIDE_QUERY).matches

    const placePan = () => {
      if (!stage.value || !pan.value || wideLayout()) {
        panStyle.value = {}
        return
      }
      const stageHeight = stage.value.offsetHeight
      const panHeight = pan.value.offsetHeight
      panStyle.value = { transform: tourPanTransform({ piece: steps[index.value].piece, stageHeight, panHeight }) }
    }

    const show = async ({ forward }) => {
      const token = ++showToken
      const step = steps[index.value]
      fading.value = true
      placePan()
      if (forward && step.from) await diagram.value?.travel(step.from)
      else await wait(prefersReducedMotion() ? 0 : BACK_FADE_MS)
      if (token !== showToken) return
      shown.value = index.value
      fading.value = false
    }

    const next = () => {
      if (index.value >= steps.length - 1) return emit('done')
      index.value += 1
      show({ forward: true })
    }

    const back = () => {
      if (index.value === 0) return
      index.value -= 1
      show({ forward: false })
    }

    let resizeObserver = null
    onMounted(async () => {
      await nextTick()
      placePan()
      heading.value?.focus({ preventScroll: true })
      resizeObserver = new ResizeObserver(() => placePan())
      if (stage.value) resizeObserver.observe(stage.value)
    })
    onUnmounted(() => {
      showToken += 1
      resizeObserver?.disconnect()
    })

    return { steps, shown, fading, stage, pan, diagram, heading, panStyle, view, focus, next, back }
  },
}

const WIDE_QUERY = '(min-width: 900px) and (min-height: 600px)'
const BACK_FADE_MS = 160
