<script setup>
import { ref, computed, nextTick } from 'vue'

const props = defineProps({
  id: { type: String, required: true },
  title: { type: String, required: true },
  duration: { type: String, default: '' },
  start: { type: Number, default: 0 }
})

const posterSizes = ['maxresdefault', 'hqdefault']

const isPlaying = ref(false)
const posterIndex = ref(0)
const player = ref(null)

const posterSrc = computed(() => `https://i.ytimg.com/vi/${props.id}/${posterSizes[posterIndex.value]}.jpg`)

const embedSrc = computed(() => {
  const startParam = props.start > 0 ? `&start=${props.start}` : ''
  return `https://www.youtube-nocookie.com/embed/${props.id}?autoplay=1&rel=0${startParam}`
})

const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

const caption = computed(() => {
  const details = [
    props.duration,
    props.start > 0 ? `from ${formatTime(props.start)}` : ''
  ].filter(Boolean).join(', ')
  return details ? `Video: ${props.title} (${details})` : `Video: ${props.title}`
})

const usePosterFallback = () => {
  if (posterIndex.value < posterSizes.length - 1) posterIndex.value += 1
}

const play = async () => {
  isPlaying.value = true
  await nextTick()
  player.value?.focus()
}
</script>

<template>
  <figure class="youtube-video">
    <iframe
      v-if="isPlaying"
      ref="player"
      class="youtube-video__frame"
      :src="embedSrc"
      :title="title"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerpolicy="strict-origin-when-cross-origin"
      allowfullscreen
    ></iframe>
    <button
      v-else
      type="button"
      class="youtube-video__frame youtube-video__poster"
      :aria-label="`Play video: ${title}`"
      @click="play"
    >
      <img :src="posterSrc" alt="" loading="lazy" decoding="async" @error="usePosterFallback" />
      <span class="youtube-video__play" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="28" height="28">
          <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
        </svg>
      </span>
    </button>
    <figcaption>{{ caption }}</figcaption>
  </figure>
</template>

<style scoped>
.youtube-video {
  margin: 0;
}

.vp-doc .youtube-video {
  margin: 24px 0;
}

.youtube-video__frame {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  border: 1px solid var(--ftv-hairline);
  border-radius: 12px;
  background: #0b1117;
}

.youtube-video__poster {
  position: relative;
  padding: 0;
  overflow: hidden;
  cursor: pointer;
}

.youtube-video__poster img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  object-fit: cover;
}

.youtube-video__play {
  position: absolute;
  top: 50%;
  left: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: #f2f5f7;
  color: #0b1117;
  transform: translate(-50%, -50%);
  transition: background var(--ftv-motion) var(--ftv-ease), color var(--ftv-motion) var(--ftv-ease);
}

.youtube-video__poster:hover .youtube-video__play,
.youtube-video__poster:focus-visible .youtube-video__play {
  background: var(--ftv-primary);
  color: var(--ftv-on-primary);
}

.youtube-video__poster:focus-visible,
.youtube-video__frame:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 3px;
}

.youtube-video figcaption {
  margin-top: 8px;
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 18px;
  font-weight: 500;
  text-align: center;
}

@media (max-width: 640px) {
  .youtube-video__play {
    width: 52px;
    height: 52px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .youtube-video__play {
    transition: none;
  }
}
</style>
