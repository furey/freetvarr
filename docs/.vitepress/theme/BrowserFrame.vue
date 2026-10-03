<script setup>
import { withBase } from 'vitepress'
import { ref, computed, useSlots, onMounted } from 'vue'

const props = defineProps({
  src: { type: String, default: '/demo.mp4' },
  poster: { type: String, default: '/demo-poster.jpg' },
  label: { type: String, default: 'http://freetvarr.lan' },
  credit: { type: String, default: null }
})

const VIDEO_CREDIT = 'Demo video: Big Buck Bunny, © Blender Foundation, CC BY 3.0'
const slots = useSlots()
const showsScreenshot = computed(() => Boolean(slots.default))
const creditText = computed(() => props.credit ?? (showsScreenshot.value ? '' : VIDEO_CREDIT))

const video = ref(null)

onMounted(() => {
  const el = video.value
  if (!el) return
  el.muted = true
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  if (reduce?.matches) {
    el.removeAttribute('autoplay')
    el.pause()
    return
  }
  el.play?.().catch(() => {})
})
</script>

<template>
  <figure class="browser-frame__figure">
    <div class="browser-frame">
      <div class="browser-frame__bar" aria-hidden="true">
        <span class="browser-frame__dots">
          <span class="browser-frame__dot browser-frame__dot--blue"></span>
          <span class="browser-frame__dot browser-frame__dot--orange"></span>
          <span class="browser-frame__dot browser-frame__dot--yellow"></span>
        </span>
        <span class="browser-frame__url">{{ label }}</span>
      </div>
      <div v-if="showsScreenshot" class="browser-frame__shot">
        <slot />
      </div>
      <div v-else class="browser-frame__screen">
        <video
          ref="video"
          :poster="withBase(poster)"
          autoplay
          loop
          muted
          playsinline
          preload="metadata"
          aria-label="A walkthrough of the Freetvarr dashboard, live TV, TV guide, shows, recordings, syncs, and settings"
        >
          <source :src="withBase(src)" type="video/mp4" />
        </video>
      </div>
    </div>
    <figcaption v-if="creditText" class="browser-frame__credit">{{ creditText }}</figcaption>
  </figure>
</template>

<style scoped>
.browser-frame__figure {
  margin: 0;
}

.vp-doc .browser-frame__figure {
  margin: 24px 0;
}

.browser-frame__credit {
  margin-top: 8px;
  color: var(--vp-c-text-3);
  font-size: 11px;
  text-align: right;
  white-space: nowrap;
}

@media (max-width: 639px) {
  .browser-frame__credit {
    font-size: 10px;
  }
}

.browser-frame {
  position: relative;
  z-index: 1;
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  box-shadow:
    0 24px 48px -24px rgba(0, 0, 0, 0.7),
    0 8px 20px -12px rgba(0, 0, 0, 0.5);
}

.browser-frame__bar {
  position: relative;
  display: flex;
  align-items: center;
  padding: 10px 14px;
  background: var(--vp-c-bg-elv);
  border-bottom: 1px solid var(--vp-c-divider);
}

.browser-frame__dots {
  display: flex;
  gap: 8px;
}

.browser-frame__dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
}

.browser-frame__dot--blue { background: #1eb6ff; }
.browser-frame__dot--orange { background: #ff8a00; }
.browser-frame__dot--yellow { background: #e2b03c; }

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

.browser-frame__screen {
  aspect-ratio: 1280 / 800;
  background: #1a1611;
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
