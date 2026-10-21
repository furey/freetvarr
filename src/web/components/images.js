import {
  ref,
  computed,
  inject,
  onMounted,
  onUnmounted,
  watch,
  nextTick,
} from '/vendor/vue.esm-browser.prod.js'
import { createRequestGate } from '/shared/request-gate.js'
import { stampedShowImage } from '/shared/artwork-stamps.js'
import { GUIDE_SCROLL_SELECTOR, NEAR_VIEW_MARGIN, observeInScroller, unobserveInScroller } from '/shared/scroll-proximity.js'

export const GUIDE_IMAGES_ON = Symbol('guide-images-on')

export const ChannelLogo = {
  props: { channelId: { type: [String, Number], default: null }, hasLogo: Boolean },
  setup(props) {
    const failed = ref(false)
    watch(() => props.channelId, () => { failed.value = false })
    const showsImage = computed(() => props.hasLogo && props.channelId != null && !failed.value)
    const logoUrl = computed(() => `/api/epg/logo/${encodeURIComponent(props.channelId)}`)
    const src = computed(() => `${logoUrl.value}?w=${CHANNEL_LOGO_WIDTHS[0]}`)
    const srcset = computed(() => densitySrcset({ url: logoUrl.value, widths: CHANNEL_LOGO_WIDTHS }))
    return { failed, showsImage, src, srcset }
  },
  template: `
    <img v-if="showsImage" class="epg-rail-logo" :src="src" :srcset="srcset" alt="" loading="lazy"
      draggable="false" @error="failed = true" />
    <tv-icon v-else class="epg-rail-logo channel-logo-fallback" />
  `,
}

const CHANNEL_LOGO_WIDTHS = [96, 192]

const IMAGE_RETRY_DELAY_MS = 5000
const FALLBACK_CELL_REQUEST_LIMIT = 4
const FALLBACK_CELL_SLOT_MAX_MS = 3000

const fallbackCellGate = createRequestGate({ limit: FALLBACK_CELL_REQUEST_LIMIT })
const TITLE_CARD_DELAY_MS = 500

const PROGRAMME_IMAGE_WIDTHS = {
  thumb: [192],
  cell: [192],
  rec: [384, 768],
  hero: [768],
  info: [384, 768],
}

const withWidth = (url, width) => `${url}${url.includes('?') ? '&' : '?'}w=${width}`

const densitySrcset = ({ url, widths }) => (widths.length > 1
  ? widths.map((width, index) => `${withWidth(url, width)} ${index + 1}x`).join(', ')
  : null)

const imageStatusOf = (img) => {
  if (!img?.complete) return 'loading'
  return img.naturalWidth > 0 ? 'loaded' : 'failed'
}

const titleHueOf = (title) =>
  [...String(title || '')].reduce((hash, char) => (hash * 31 + char.codePointAt(0)) % 360, 7)

const initialsOf = (title) => String(title || '')
  .split(/\s+/)
  .filter((word) => /^[\p{L}\p{N}]/u.test(word) && !MINOR_TITLE_WORDS.has(word.toLowerCase()))
  .slice(0, 2)
  .map((word) => [...word][0].toUpperCase())
  .join('')

const MINOR_TITLE_WORDS = new Set(['the', 'a', 'an', 'of', 'and', 'with', 'in', 'on'])

export const ProgrammeImage = {
  props: {
    eventId: { type: [String, Number], default: null },
    source: { type: String, default: null },
    variant: { type: String, default: 'thumb' },
    channelId: { type: [String, Number], default: null },
    hasLogo: Boolean,
    title: { type: String, default: null },
  },
  emits: ['settle'],
  setup(props, { emit }) {
    const img = ref(null)
    const status = ref('loading')
    const instant = ref(false)
    const upgrading = ref(false)
    const titleCardShown = ref(false)
    let titleCardTimer = null
    const revealTitleCardLater = () => {
      clearTimeout(titleCardTimer)
      titleCardShown.value = src.value == null
      if (titleCardShown.value) return
      titleCardTimer = setTimeout(() => { titleCardShown.value = status.value !== 'loaded' }, TITLE_CARD_DELAY_MS)
    }
    const guideImageUrl = computed(() => {
      if (props.eventId != null) return `/api/epg/image/${encodeURIComponent(props.eventId)}`
      if (props.title) return stampedShowImage(`/api/epg/show-image?title=${encodeURIComponent(props.title)}`)
      return null
    })
    const guideImageWidths = computed(() => PROGRAMME_IMAGE_WIDTHS[props.variant] || PROGRAMME_IMAGE_WIDTHS.thumb)
    const savedSourceFailed = ref(false)
    watch(() => props.source, () => { savedSourceFailed.value = false })
    const usesSavedSource = computed(() => props.source != null && !savedSourceFailed.value)
    const src = computed(() => {
      if (usesSavedSource.value) return stampedShowImage(props.source)
      return guideImageUrl.value ? withWidth(guideImageUrl.value, guideImageWidths.value[0]) : null
    })
    const srcset = computed(() => (!usesSavedSource.value && guideImageUrl.value
      ? densitySrcset({ url: guideImageUrl.value, widths: guideImageWidths.value })
      : null))
    const settleFromCache = () => {
      if (src.value == null) {
        status.value = 'failed'
        return
      }
      const cached = imageStatusOf(img.value)
      instant.value = cached !== 'loading'
      status.value = cached
    }
    const onLoad = () => { if (status.value === 'loading') status.value = 'loaded' }
    let retryTimer = null
    let retried = false
    const cancelRetry = () => {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    const retryLater = () => {
      if (retried || retryTimer || usesSavedSource.value || src.value == null) return
      const url = src.value
      retryTimer = setTimeout(() => {
        retryTimer = null
        retried = true
        const probe = new Image()
        probe.onload = () => { if (src.value === url) fadeInUpgrade() }
        probe.src = url
      }, IMAGE_RETRY_DELAY_MS)
    }
    const fadeInUpgrade = async () => {
      instant.value = false
      upgrading.value = true
      status.value = 'loading'
      await nextTick()
      if (!img.value?.complete || img.value.naturalWidth === 0) return
      getComputedStyle(img.value).opacity
      status.value = 'loaded'
    }
    const onError = () => {
      if (usesSavedSource.value && guideImageUrl.value) {
        savedSourceFailed.value = true
        return
      }
      status.value = 'failed'
      retryLater()
    }
    const fadeInFromCache = () => {
      const cached = src.value == null ? 'failed' : imageStatusOf(img.value)
      if (cached !== 'loaded') return settleFromCache()
      status.value = 'loaded'
    }
    onMounted(() => {
      revealTitleCardLater()
      fadeInFromCache()
    })
    onUnmounted(() => {
      cancelRetry()
      clearTimeout(titleCardTimer)
    })
    watch(src, async () => {
      cancelRetry()
      revealTitleCardLater()
      retried = false
      upgrading.value = false
      status.value = 'loading'
      instant.value = false
      await nextTick()
      settleFromCache()
    })
    watch(status, (now) => { if (now !== 'loading') emit('settle', now) })
    const titleCardStyle = computed(() => ({ '--title-hue': titleHueOf(props.title) }))
    const titleInitials = computed(() => initialsOf(props.title))
    return { img, status, instant, upgrading, titleCardShown, src, srcset, onLoad, onError, titleCardStyle, titleInitials }
  },
  template: `
    <div :class="['programme-image', variant, 'is-' + status, { 'no-fade': instant, 'is-upgrade': upgrading }]">
      <span v-if="title" :class="['programme-title-card', { 'is-shown': titleCardShown }]" :style="titleCardStyle" aria-hidden="true">
        <span class="programme-title-card-text">{{ title }}</span>
        <span class="programme-title-card-initials">{{ titleInitials }}</span>
      </span>
      <img v-if="src != null && status !== 'failed'" ref="img" :src="src" :srcset="srcset" alt=""
        :loading="variant === 'hero' ? 'eager' : 'lazy'" decoding="async" @load="onLoad" @error="onError" />
      <span v-if="status === 'failed' && !title" class="programme-image-fallback">
        <channel-logo :channel-id="channelId" :has-logo="hasLogo" />
      </span>
    </div>
  `,
}

export const GuideCellImage = {
  props: {
    eventId: { type: [String, Number], default: null },
    channelId: { type: [String, Number], default: null },
    hasLogo: Boolean,
    title: { type: String, default: null },
    fallback: Boolean,
  },
  setup(props) {
    const imagesOn = inject(GUIDE_IMAGES_ON, ref(true))
    const placeholder = ref(null)
    const near = ref(false)
    const granted = ref(!props.fallback)
    let observed = null
    let leaveGate = null
    let slotTimer = null
    const stopObserving = () => {
      if (observed) unobserveInScroller(observed)
      observed = null
    }
    const leaveFallbackGate = () => {
      clearTimeout(slotTimer)
      leaveGate?.()
      leaveGate = null
    }
    const takeFallbackSlot = () => {
      granted.value = true
      slotTimer = setTimeout(leaveFallbackGate, FALLBACK_CELL_SLOT_MAX_MS)
    }
    const askForFallback = () => {
      if (granted.value || leaveGate || !near.value || !imagesOn.value) return
      leaveGate = fallbackCellGate.enter(takeFallbackSlot)
    }
    const showWhenNear = (isNear) => {
      if (!isNear) return
      stopObserving()
      near.value = true
      askForFallback()
    }
    watch(imagesOn, askForFallback)
    onMounted(() => {
      observed = placeholder.value
      observeInScroller({ el: observed, rootSelector: GUIDE_SCROLL_SELECTOR, rootMargin: NEAR_VIEW_MARGIN, onChange: showWhenNear })
    })
    onUnmounted(() => {
      stopObserving()
      leaveFallbackGate()
    })
    return { placeholder, near, granted, leaveFallbackGate }
  },
  template: `
    <programme-image v-if="near && granted" :event-id="eventId" variant="cell" :channel-id="channelId" :has-logo="hasLogo" :title="title"
      @settle="leaveFallbackGate" />
    <div v-else ref="placeholder" class="programme-image cell is-loading"></div>
  `,
}
