import { ref, computed, watch, onUnmounted } from '/vendor/vue.esm-browser.prod.js'
import { primeImageFocus, showLoadedImage } from '/shared/image-focus.js'
import { ART_FINAL, ART_PROBE_CANCELLED, ART_PROBE_LOADED, ART_STATE_HEADER, artFallbackStyle, artProbeStateOf } from '/art-fallback.js'
import { stampedShowImage } from '/shared/artwork-stamps.js'

const RETRY_DELAYS_MS = [4000, 12000, 30000]
const artStateProbe = (url) => {
  const controller = new AbortController()
  const done = fetch(url, { method: 'HEAD', cache: 'no-store', signal: controller.signal })
    .then((response) => artProbeStateOf({ ok: response.ok, state: response.headers.get(ART_STATE_HEADER) }))
    .catch(() => (controller.signal.aborted ? ART_PROBE_CANCELLED : 'pending'))
  return { done, cancel: () => controller.abort() }
}

export const TitleArt = {
  props: {
    title: { type: String, default: '' },
    shape: { type: String, default: 'card' },
    src: { type: String, default: '' },
    fallbackSrc: { type: String, default: '' },
  },
  template: `
    <div :class="[shape === 'poster' ? 'ui-poster-art' : 'ui-card-art', 'ui-art-fallback']" :style="fallbackStyle">
      <img v-if="src && !failed" :key="attempt" :ref="showIfLoaded" :src="shownSrc" alt="" loading="lazy" decoding="async" @error="onError" />
      <span v-else class="ui-art-title">{{ title }}</span>
      <slot />
    </div>
  `,
  setup(props) {
    const primarySrc = computed(() => stampedShowImage(props.src))
    const primaryFailed = ref(false)
    const fallbackFailed = ref(false)
    const showsFallback = computed(() => primaryFailed.value && Boolean(props.fallbackSrc) && !fallbackFailed.value)
    const shownSrc = computed(() => (showsFallback.value ? stampedShowImage(props.fallbackSrc) : primarySrc.value))
    const failed = computed(() => primaryFailed.value && !showsFallback.value)
    const attempt = ref(0)
    let retryTimer = null
    let probe = null
    const cancelRetry = () => {
      clearTimeout(retryTimer)
      retryTimer = null
      probe?.cancel()
      probe = null
    }
    const retryLater = () => {
      const delay = RETRY_DELAYS_MS[attempt.value]
      if (delay == null) return
      const url = primarySrc.value
      retryTimer = setTimeout(async () => {
        retryTimer = null
        probe = artStateProbe(url)
        const state = await probe.done
        probe = null
        if (primarySrc.value !== url || state === ART_PROBE_CANCELLED) return
        attempt.value += 1
        if (state === ART_PROBE_LOADED) primaryFailed.value = false
        else if (state !== ART_FINAL) retryLater()
      }, delay)
    }
    const onError = () => {
      if (showsFallback.value) {
        fallbackFailed.value = true
        return
      }
      primaryFailed.value = true
      if (!retryTimer && !probe) retryLater()
    }
    watch(primarySrc, () => {
      cancelRetry()
      attempt.value = 0
      primaryFailed.value = false
    })
    watch(() => props.fallbackSrc, () => { fallbackFailed.value = false })
    watch(shownSrc, (url) => { if (url) primeImageFocus(url) }, { immediate: true })
    const showIfLoaded = (img) => { if (img) showLoadedImage(img) }
    onUnmounted(cancelRetry)
    return { shownSrc, failed, attempt, onError, showIfLoaded, fallbackStyle: computed(() => artFallbackStyle(props.title)) }
  },
}
