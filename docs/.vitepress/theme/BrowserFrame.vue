<script setup>
import { withBase } from 'vitepress'
import { ref, computed, useSlots, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  src: { type: String, default: '/demo.mp4' },
  poster: { type: String, default: '/demo-poster.jpg' },
  label: { type: String, default: 'http://freetvarr.lan' },
  single: { type: Boolean, default: false },
  phone: { type: Boolean, default: false },
  bare: { type: Boolean, default: false },
  ratio: { type: String, default: '1280 / 800' },
  ariaLabel: { type: String, default: 'A walkthrough of the Freetvarr dashboard, live TV, TV guide, series, recordings, syncs, and settings' }
})

const slots = useSlots()
const showsScreenshot = computed(() => Boolean(slots.default))
const oneXSrc = computed(() => props.src.replace(/\.mp4$/, '-1x.mp4'))

const video = ref(null)

const switchSourceKeepingTime = (el, apply) => {
  const time = el.currentTime
  const wasPlaying = !el.paused
  apply()
  el.addEventListener('loadedmetadata', () => {
    el.currentTime = time
    if (wasPlaying) el.play?.().catch(() => {})
  }, { once: true })
}

const useFullResolution = (el) => {
  if (props.single || !el.currentSrc.endsWith('-1x.mp4')) return
  switchSourceKeepingTime(el, () => { el.src = withBase(props.src) })
}

const restoreScreenResolution = (el) => {
  if (!el.hasAttribute('src')) return
  switchSourceKeepingTime(el, () => {
    el.removeAttribute('src')
    el.load()
  })
}

const onFullscreenChange = () => {
  const el = video.value
  if (!el) return
  const isFullscreen = document.fullscreenElement === el
  el.controls = isFullscreen
  if (isFullscreen) return useFullResolution(el)
  restoreScreenResolution(el)
}

const playFullscreen = () => {
  const el = video.value
  if (!el) return
  el.play?.().catch(() => {})
  if (el.requestFullscreen) return el.requestFullscreen().catch(() => {})
  useFullResolution(el)
  el.webkitEnterFullscreen?.()
}

onMounted(() => {
  const el = video.value
  if (!el) return
  el.muted = true
  document.addEventListener('fullscreenchange', onFullscreenChange)
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  if (reduce?.matches) {
    el.removeAttribute('autoplay')
    el.pause()
    return
  }
  el.play?.().catch(() => {})
})

onUnmounted(() => document.removeEventListener('fullscreenchange', onFullscreenChange))
</script>

<template>
  <figure class="browser-frame__figure">
    <div class="browser-frame" :class="{ 'browser-frame--phone': phone, 'browser-frame--bare': bare }">
      <div v-if="!bare" class="browser-frame__bar">
        <span class="browser-frame__dots" aria-hidden="true">
          <span class="browser-frame__dot"></span>
          <span class="browser-frame__dot"></span>
          <span class="browser-frame__dot"></span>
        </span>
        <span class="browser-frame__url" aria-hidden="true">{{ label }}</span>
        <button
          v-if="!showsScreenshot"
          type="button"
          class="browser-frame__fullscreen"
          aria-label="Play the video full screen"
          title="Full screen"
          @click="playFullscreen"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
      <div v-if="showsScreenshot" class="browser-frame__shot">
        <slot />
      </div>
      <div v-else class="browser-frame__screen" :style="{ aspectRatio: ratio }">
        <video
          ref="video"
          :poster="withBase(poster)"
          autoplay
          loop
          muted
          playsinline
          preload="metadata"
          :aria-label="ariaLabel"
          @dblclick="playFullscreen"
        >
          <source v-if="single" :src="withBase(src)" type="video/mp4" />
          <template v-else>
            <source :src="withBase(src)" media="(min-resolution: 2dppx)" type="video/mp4" />
            <source :src="withBase(oneXSrc)" type="video/mp4" />
          </template>
        </video>
      </div>
    </div>
  </figure>
</template>

<style scoped>
.browser-frame.browser-frame--bare {
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.browser-frame--bare .browser-frame__screen {
  background: transparent;
}

.browser-frame__figure {
  margin: 0;
}

.vp-doc .browser-frame__figure {
  margin: 24px 0;
}

.browser-frame {
  position: relative;
  z-index: 1;
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--ftv-hairline);
  background: var(--ftv-surface-1);
}

.browser-frame__bar {
  position: relative;
  display: flex;
  align-items: center;
  padding: 10px 14px;
  background: var(--ftv-surface-1);
  border-bottom: 1px solid var(--ftv-hairline);
}

.browser-frame--phone .browser-frame__dots {
  display: none;
}

.browser-frame--phone .browser-frame__bar {
  justify-content: center;
  padding: 8px 10px;
}

.browser-frame--phone .browser-frame__url {
  position: static;
  transform: none;
  max-width: 100%;
}

.browser-frame__dots {
  display: flex;
  gap: 8px;
}

.browser-frame__dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--ftv-surface-3);
}


.browser-frame__url {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  max-width: 60%;
  padding: 1px 8px;
  color: var(--vp-c-text-3);
  font-family: var(--vp-font-family-mono);
  font-size: 10.5px;
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.browser-frame__fullscreen {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
}

.browser-frame__fullscreen:hover {
  color: var(--vp-c-text-1);
  background: var(--ftv-surface-2);
}

.browser-frame__screen video:fullscreen {
  object-fit: contain;
  background: #000;
}

.browser-frame__screen {
  aspect-ratio: 1280 / 800;
  background: #0b1117;
}

.browser-frame__shot :slotted(img) {
  display: block;
  width: 100%;
  height: auto;
  margin: 0;
}

.browser-frame__screen video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
