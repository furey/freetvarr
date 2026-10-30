<script setup>
import { useData, withBase } from 'vitepress'
import { ref, computed, watch, nextTick, onMounted } from 'vue'

const { isDark } = useData()
const mounted = ref(false)
const video = ref(null)
const theme = computed(() => (isDark.value ? 'dark' : 'light'))
const mediaFor = (name) => withBase(`/devices-${theme.value}${name}`)

const playUnlessReducedMotion = () => {
  const el = video.value
  if (!el) return
  el.muted = true
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return el.pause()
  el.play?.().catch(() => {})
}

onMounted(() => {
  mounted.value = true
  nextTick(playUnlessReducedMotion)
})

watch(theme, () => nextTick(playUnlessReducedMotion))
</script>

<template>
  <figure class="devices-hero">
    <video
      v-if="mounted"
      ref="video"
      :key="theme"
      :poster="mediaFor('-poster.jpg')"
      autoplay
      loop
      muted
      playsinline
      preload="metadata"
      aria-label="Freetvarr on an iPad: Home, live TV playing, and the TV guide"
    >
      <source :src="mediaFor('.mp4')" media="(min-resolution: 2dppx)" type="video/mp4" />
      <source :src="mediaFor('-1x.mp4')" type="video/mp4" />
    </video>
  </figure>
</template>

<style scoped>
.devices-hero {
  margin: 0;
  width: 100%;
  aspect-ratio: 1148 / 900;
}

.devices-hero video {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
