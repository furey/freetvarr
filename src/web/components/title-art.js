import { ref, computed, watch, onUnmounted } from '/vendor/vue.esm-browser.prod.js'
import { artFallbackStyle } from '/art-fallback.js'

const RETRY_DELAYS_MS = [4000, 12000, 30000]

export const TitleArt = {
  props: {
    title: { type: String, default: '' },
    shape: { type: String, default: 'card' },
    src: { type: String, default: '' },
  },
  template: `
    <div :class="[shape === 'poster' ? 'ui-poster-art' : 'ui-card-art', 'ui-art-fallback']" :style="fallbackStyle">
      <img v-if="src && !failed" :key="attempt" :src="src" alt="" loading="lazy" decoding="async" @error="onError" />
      <span v-else class="ui-art-title">{{ title }}</span>
      <slot />
    </div>
  `,
  setup(props) {
    const failed = ref(false)
    const attempt = ref(0)
    let retryTimer = null
    const cancelRetry = () => {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    const retryLater = () => {
      const delay = RETRY_DELAYS_MS[attempt.value]
      if (delay == null) return
      const url = props.src
      retryTimer = setTimeout(() => {
        retryTimer = null
        const probe = new Image()
        probe.onload = () => {
          if (props.src !== url) return
          attempt.value += 1
          failed.value = false
        }
        probe.onerror = () => {
          if (props.src !== url) return
          attempt.value += 1
          retryLater()
        }
        probe.src = url
      }, delay)
    }
    const onError = () => {
      failed.value = true
      if (!retryTimer) retryLater()
    }
    watch(() => props.src, () => {
      cancelRetry()
      attempt.value = 0
      failed.value = false
    })
    onUnmounted(cancelRetry)
    return { failed, attempt, onError, fallbackStyle: computed(() => artFallbackStyle(props.title)) }
  },
}
