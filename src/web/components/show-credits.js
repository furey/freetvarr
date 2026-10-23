import { onUnmounted, ref, shallowRef, watch } from '/vendor/vue.esm-browser.prod.js'
import { api } from '/shared/api.js'
import { artFallbackStyle } from '/art-fallback.js'
import { creditsKeyOf, creditsUrlOf, isSettledCredits } from '/credits-display.js'
import { retryDelayOf } from '/ratings-display.js'
import { ProgrammeReviewCard } from '/components/programme-ratings.js'
import { boundedMap } from '/bounded-cache.js'

export const useProgrammeCredits = (programme) => {
  const credits = shallowRef(null)
  const answered = ref(false)
  let token = 0
  let retryTimer = null

  const stop = () => {
    clearTimeout(retryTimer)
    retryTimer = null
    token += 1
  }

  const load = async ({ request, attempt }) => {
    const result = await api('GET', creditsUrlOf(request)).catch(() => null)
    if (request.token !== token) return
    answered.value = true
    if (isSettledCredits(result)) {
      creditsCache.set(request.key, result)
      credits.value = result
      return
    }
    const delay = result?.status === 'pending' ? retryDelayOf(attempt) : null
    if (delay == null) return
    retryTimer = setTimeout(() => load({ request, attempt: attempt + 1 }), delay)
  }

  const start = (program) => {
    stop()
    credits.value = null
    answered.value = false
    const key = creditsKeyOf(program || {})
    if (!key) return
    const cached = creditsCache.get(key)
    if (cached) {
      credits.value = cached
      answered.value = true
      return
    }
    load({ request: { key, title: program.title, kind: program.kind, year: program.year, token }, attempt: 0 })
  }

  watch(() => creditsKeyOf(programme.value || {}), () => start(programme.value), { immediate: true })
  onUnmounted(stop)

  return { credits, answered }
}

export const ShowAbout = {
  components: { ProgrammeReviewCard },
  props: {
    synopsis: { type: String, default: '' },
    review: { type: Object, default: null },
  },
  template: `
    <section v-if="synopsis || review" class="show-about show-late-section" aria-labelledby="show-about-title">
      <h2 id="show-about-title" class="ui-section-title">About</h2>
      <p v-if="synopsis" class="show-about-synopsis">{{ synopsis }}</p>
      <programme-review-card v-if="review" :review="review" />
    </section>
  `,
}

export const ShowCast = {
  props: {
    cast: { type: Array, default: () => [] },
    crew: { type: Array, default: () => [] },
  },
  template: `
    <section v-if="cast.length || crew.length" class="show-credits show-late-section" aria-labelledby="show-credits-title">
      <h2 id="show-credits-title" class="ui-section-title">Cast and crew</h2>
      <ul v-if="cast.length" class="ui-scroller show-cast" aria-label="Cast">
        <li v-for="(person, index) in cast" :key="index + person.name" class="show-cast-person">
          <component :is="person.url ? 'a' : 'div'" class="show-cast-hit" :href="person.url || undefined"
            :target="person.url ? '_blank' : undefined" :rel="person.url ? 'noopener noreferrer' : undefined">
            <span class="show-cast-face" :style="faceStyle(person.name)" aria-hidden="true">
              <span class="show-cast-initials">{{ person.initials }}</span>
              <img v-if="person.image && !failedImages.has(person.image)" :class="['show-cast-photo', { 'is-loaded': loadedImages.has(person.image) }]"
                :src="person.image" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"
                @load="markLoaded(person.image)" @error="markFailed(person.image)" />
            </span>
            <span class="show-cast-name">{{ person.name }}</span>
            <span v-if="person.character" class="show-cast-role">{{ person.character }}</span>
          </component>
        </li>
      </ul>
      <div v-if="crew.length" class="show-crew">
        <p v-for="line in crew" :key="line.job" class="show-crew-line"><span class="show-crew-job">{{ line.job }}:</span> {{ line.names }}</p>
      </div>
    </section>
  `,
  setup() {
    const loadedImages = ref(new Set())
    const failedImages = ref(new Set())
    const markLoaded = (src) => { loadedImages.value = new Set(loadedImages.value).add(src) }
    const markFailed = (src) => { failedImages.value = new Set(failedImages.value).add(src) }
    return { loadedImages, failedImages, markLoaded, markFailed, faceStyle: artFallbackStyle }
  },
}

const creditsCache = boundedMap(500)
