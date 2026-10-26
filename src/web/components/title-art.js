import { ref, computed, watch, onUnmounted } from '/vendor/vue.esm-browser.prod.js'
import { primeImageFocus, showLoadedImage } from '/shared/image-focus.js'
import { artFallbackStyle } from '/art-fallback.js'
import { stampedShowImage } from '/shared/artwork-stamps.js'

const RETRY_DELAYS_MS = [4000, 12000, 30000]

export const TitleArt = {
  props: {
    title: { type: String, default: '' },
    shape: { type: String, default: 'card' },
    src: { type: String, default: '' },
  },
  template: `
    <div :class="[shape === 'poster' ? 'ui-poster-art' : 'ui-card-art', 'ui-art-fallback']" :style="fallbackStyle">
      <img v-if="src && !failed" :key="attempt" :ref="showIfLoaded" :src="shownSrc" alt="" loading="lazy" decoding="async" @error="onError" />
      <span v-else class="ui-art-title">{{ title }}</span>
      <slot />
    </div>
  `,
  setup(props) {
    const shownSrc = computed(() => stampedShowImage(props.src))
    const failed = ref(false)
    const attempt = ref(0)
    let retryTimer = null
    let probe = null
    const cancelRetry = () => {
      clearTimeout(retryTimer)
      retryTimer = null
      if (!probe) return
      probe.onload = null
      probe.onerror = null
      probe.src = ''
      probe = null
    }
    const retryLater = () => {
      const delay = RETRY_DELAYS_MS[attempt.value]
      if (delay == null) return
      const url = shownSrc.value
      retryTimer = setTimeout(() => {
        retryTimer = null
        probe = new Image()
        probe.onload = () => {
          probe = null
          if (shownSrc.value !== url) return
          attempt.value += 1
          failed.value = false
        }
        probe.onerror = () => {
          probe = null
          if (shownSrc.value !== url) return
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
    watch(shownSrc, () => {
      cancelRetry()
      attempt.value = 0
      failed.value = false
    })
    watch(shownSrc, (url) => { if (url) primeImageFocus(url) }, { immediate: true })
    const showIfLoaded = (img) => { if (img) showLoadedImage(img) }
    onUnmounted(cancelRetry)
    return { shownSrc, failed, attempt, onError, showIfLoaded, fallbackStyle: computed(() => artFallbackStyle(props.title)) }
  },
}
