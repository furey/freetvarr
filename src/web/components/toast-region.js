import { ref, computed, watch, nextTick, onMounted, onUnmounted } from '/vendor/vue.esm-browser.prod.js'
import { WarningGlyph } from '/components/nav-icons.js'
import { live, playback, playerMini } from '/shared/player-shared.js'
import { currentToast, dismissToast, pauseToast, resumeToast, runToastAction } from '/shared/toast.js'
import { toastPlacementOf } from '/toast-queue.js'

export const ToastRegion = {
  components: { WarningGlyph },
  template: `
    <div ref="regionEl" class="ui-toast-region" aria-live="polite" :style="placementStyle"
      @pointerenter="pauseToast('pointer')" @pointerleave="resumeToast('pointer')"
      @focusin="pauseToast('focus')" @focusout="onFocusOut">
      <transition name="ui-toast">
        <div v-if="shown" :key="shown.id" :class="['ui-toast', 'is-' + shown.kind]" :role="shown.kind === 'error' ? 'alert' : 'status'">
          <span v-if="shown.kind === 'ok'" class="ui-toast-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8 5.7-5.8"/></svg>
          </span>
          <span v-else-if="shown.kind === 'error'" class="ui-toast-icon"><warning-glyph /></span>
          <span class="ui-toast-text">{{ shown.text }}<span v-if="shown.detail" class="ui-toast-detail">{{ shown.detail }}</span></span>
          <button v-if="shown.action" type="button" class="ui-toast-action" @click="runToastAction">{{ shown.action.label }}</button>
          <button v-if="closable" type="button" class="ui-icon-button is-plain ui-toast-close" aria-label="Dismiss"
            @click="dismissToast(shown.id)"><close-glyph /></button>
        </div>
      </transition>
    </div>
  `,
  setup() {
    const regionEl = ref(null)
    const placement = ref({ clearBottom: 0, maxWidth: null })
    let settleTimer = null

    const shown = currentToast
    const closable = computed(() => shown.value?.kind === 'error' || Boolean(shown.value?.persist))
    const placementStyle = computed(() => ({
      '--toast-clear': `${placement.value.clearBottom}px`,
      ...(placement.value.maxWidth ? { '--toast-max-w': `${placement.value.maxWidth}px` } : {}),
    }))

    const measure = () => {
      if (!regionEl.value) return
      placement.value = toastPlacementOf({
        phone: window.matchMedia(PHONE_QUERY).matches,
        viewportHeight: window.innerHeight,
        toastLeft: regionEl.value.getBoundingClientRect().left,
        obstacles: visibleObstacles(),
      })
    }
    const measureSoon = async () => {
      await nextTick()
      measure()
      clearTimeout(settleTimer)
      settleTimer = setTimeout(measure, SETTLE_MS)
    }
    const onFocusOut = (e) => {
      if (!regionEl.value?.contains(e.relatedTarget)) resumeToast('focus')
    }
    const onVisibility = () => (document.hidden ? pauseToast('hidden') : resumeToast('hidden'))

    watch(shown, (next) => { if (next) measureSoon() })
    watch([playerMini, () => live.open, () => playback.open], measureSoon)
    onMounted(() => {
      window.addEventListener('resize', measureSoon)
      document.addEventListener('visibilitychange', onVisibility)
    })
    onUnmounted(() => {
      clearTimeout(settleTimer)
      window.removeEventListener('resize', measureSoon)
      document.removeEventListener('visibilitychange', onVisibility)
    })

    return { regionEl, shown, closable, placementStyle, onFocusOut, pauseToast, resumeToast, dismissToast, runToastAction }
  },
}

const PHONE_QUERY = '(max-width: 767px)'
const SETTLE_MS = 400
const OBSTACLES = [
  { selector: '.pl-backdrop.is-mini', gap: 8 },
  { selector: '.update-card', gap: 12 },
]

const visibleObstacles = () => OBSTACLES.flatMap(({ selector, gap }) => [...document.querySelectorAll(selector)]
  .filter((el) => el.getClientRects().length > 0)
  .map((el) => {
    const { top, left } = el.getBoundingClientRect()
    return { top, left, gap }
  }))
