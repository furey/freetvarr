import { ref, computed, watch, onUnmounted } from '/vendor/vue.esm-browser.prod.js'
import { primeImageFocus, showLoadedImage } from '/shared/image-focus.js'
import { ART_FINAL, ART_PROBE_CANCELLED, ART_PROBE_LOADED, ART_STATE_HEADER, artFallbackStyle, artProbeStateOf } from '/art-fallback.js'
import { artResolvedTickOf, stampedShowImage } from '/shared/artwork-stamps.js'
import { artStreamResets } from '/shared/art-stream.js'

const RETRY_DELAYS_MS = [4000, 12000, 30000]
const finalMisses = new Set()
const artStateProbe = (url) => {
  const controller = new AbortController()
  const done = fetch(url, { method: 'HEAD', cache: 'no-store', signal: controller.signal })
    .then((response) => artProbeStateOf({ ok: response.ok, state: response.headers.get(ART_STATE_HEADER) }))
    .catch(() => (controller.signal.aborted ? ART_PROBE_CANCELLED : 'pending'))
  return { done, cancel: () => controller.abort() }
}

const preloadedPicture = (url) => {
  const image = new Image()
  const done = new Promise((resolve) => {
    image.onload = () => resolve(true)
    image.onerror = () => resolve(false)
  })
  image.src = url
  return { done, cancel: () => { image.src = '' } }
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
    const resolvedTick = computed(() => artResolvedTickOf({ url: props.src, title: props.title, shape: props.shape }))
    const primaryFailed = ref(finalMisses.has(primarySrc.value))
    const fallbackFailed = ref(false)
    const showsFallback = computed(() => primaryFailed.value && Boolean(props.fallbackSrc) && !fallbackFailed.value)
    const shownSrc = computed(() => (showsFallback.value ? stampedShowImage(props.fallbackSrc) : primarySrc.value))
    const failed = computed(() => primaryFailed.value && !showsFallback.value)
    const attempt = ref(0)
    let tickAtAttempt = resolvedTick.value
    let finalSeen = primaryFailed.value
    let retryIndex = 0
    let retryTimer = null
    let probe = null
    let preload = null
    const cancelRetry = () => {
      clearTimeout(retryTimer)
      retryTimer = null
      probe?.cancel()
      probe = null
    }
    const cancelPreload = () => {
      preload?.cancel()
      preload = null
    }
    const showAgain = () => {
      cancelRetry()
      tickAtAttempt = resolvedTick.value
      attempt.value += 1
      primaryFailed.value = false
    }
    const retryLater = () => {
      const delay = RETRY_DELAYS_MS[retryIndex]
      if (delay == null || finalSeen || retryTimer || probe) return
      const url = primarySrc.value
      retryTimer = setTimeout(async () => {
        retryTimer = null
        probe = artStateProbe(url)
        const state = await probe.done
        probe = null
        if (primarySrc.value !== url || state === ART_PROBE_CANCELLED) return
        retryIndex += 1
        if (state === ART_PROBE_LOADED) showAgain()
        else if (state === ART_FINAL) {
          finalSeen = true
          finalMisses.add(url)
        }
        else retryLater()
      }, delay)
    }
    const showWhenLoaded = async () => {
      if (!primaryFailed.value || preload) return
      const url = primarySrc.value
      preload = preloadedPicture(url)
      const loaded = await preload.done
      preload = null
      if (primarySrc.value !== url || !primaryFailed.value) return
      if (loaded) {
        finalMisses.delete(url)
        showAgain()
      } else retryLater()
    }
    const onError = () => {
      if (showsFallback.value) {
        fallbackFailed.value = true
        return
      }
      primaryFailed.value = true
      if (resolvedTick.value !== tickAtAttempt) showWhenLoaded()
      else retryLater()
    }
    watch(primarySrc, (url) => {
      cancelRetry()
      cancelPreload()
      finalSeen = finalMisses.has(url)
      retryIndex = 0
      tickAtAttempt = resolvedTick.value
      primaryFailed.value = finalSeen
    })
    watch(resolvedTick, () => {
      finalSeen = false
      showWhenLoaded()
    })
    watch(artStreamResets, () => { if (!finalSeen) showWhenLoaded() })
    watch(() => props.fallbackSrc, () => { fallbackFailed.value = false })
    watch(shownSrc, (url) => { if (url) primeImageFocus(url) }, { immediate: true })
    const showIfLoaded = (img) => { if (img) showLoadedImage(img) }
    onUnmounted(() => {
      cancelRetry()
      cancelPreload()
    })
    return { shownSrc, failed, attempt, onError, showIfLoaded, fallbackStyle: computed(() => artFallbackStyle(props.title)) }
  },
}
