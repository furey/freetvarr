import { ref, computed, watch } from '/vendor/vue.esm-browser.prod.js'
import { artFallbackStyle } from '/art-fallback.js'

export const TitleArt = {
  props: {
    title: { type: String, default: '' },
    shape: { type: String, default: 'card' },
    src: { type: String, default: '' },
  },
  template: `
    <div :class="[shape === 'poster' ? 'ui-poster-art' : 'ui-card-art', 'ui-art-fallback']" :style="fallbackStyle">
      <img v-if="src && !failed" :src="src" alt="" loading="lazy" decoding="async" @error="failed = true" />
      <span v-else class="ui-art-title">{{ title }}</span>
      <slot />
    </div>
  `,
  setup(props) {
    const failed = ref(false)
    watch(() => props.src, () => { failed.value = false })
    return { failed, fallbackStyle: computed(() => artFallbackStyle(props.title)) }
  },
}
