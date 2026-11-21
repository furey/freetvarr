import { computed, nextTick, onUnmounted, ref, shallowRef, watch } from '/vendor/vue.esm-browser.prod.js'
import { api } from '/shared/api.js'
import { creditsUrlOf } from '/credits-display.js'
import { MORE_INFO_CLOSED, MORE_INFO_MIN_MS, MORE_INFO_SKELETON_AFTER_MS, loadMoreInfoCredits, looksUpCreditsFor, moreInfoAfterLoadOf, moreInfoOf, moreInfoRequestOf, moreInfoSkeletonOf, moreInfoToggledOf } from '/more-info.js'
import { prefersReducedMotion } from '/shared/utils.js'
import { usePlaceholderTiming } from '/shared/placeholder-timing.js'
import { CastScroller } from '/components/show-credits.js'

export const MoreInfo = {
  components: { CastScroller },
  props: {
    title: { type: String, default: '' },
    kind: { type: String, default: '' },
    year: { type: [Number, String], default: null },
    guide: { type: Object, default: () => ({}) },
  },
  template: `
    <details v-if="request" class="more-info" @toggle="onToggle">
      <summary class="ui-disclosure-summary more-info-summary">More info</summary>
      <div ref="bodyEl" :class="['more-info-body', { 'is-placeholder-hidden': placeholderHidden }]" :aria-busy="String(asking)">
        <template v-if="loading">
          <section class="more-info-section" aria-hidden="true">
            <h3 class="ui-group-label more-info-title">Cast and crew</h3>
            <ul v-scroll-fade class="ui-scroller ui-scroll-fade show-cast">
              <li v-for="n in skeleton.cast" :key="n" class="show-cast-person">
                <div class="show-cast-hit">
                  <span class="show-cast-face is-skeleton"><span class="ui-skeleton is-fill"></span></span>
                  <span class="show-cast-name"><template v-for="width in SKELETON_NAME_WIDTHS" :key="width"><span class="ui-skeleton is-text" :style="{ '--skeleton-w': width }"></span><br></template></span>
                  <span class="show-cast-role"><template v-for="width in SKELETON_ROLE_WIDTHS" :key="width"><span class="ui-skeleton is-text" :style="{ '--skeleton-w': width }"></span><br></template></span>
                </div>
              </li>
            </ul>
            <div class="more-info-facts">
              <div v-for="n in skeleton.crew" :key="n" class="more-info-fact">
                <span class="more-info-fact-label"><span class="ui-skeleton is-text" style="--skeleton-w: 5em"></span></span>
                <span class="more-info-fact-value"><span class="ui-skeleton is-text" style="--skeleton-w: 9em"></span></span>
              </div>
            </div>
          </section>
          <section class="more-info-section" aria-hidden="true">
            <h3 class="ui-group-label more-info-title">Details</h3>
            <div class="more-info-facts">
              <div v-for="n in skeleton.details" :key="n" class="more-info-fact">
                <span class="more-info-fact-label"><span class="ui-skeleton is-text" style="--skeleton-w: 5em"></span></span>
                <span class="more-info-fact-value"><span class="ui-skeleton is-text" style="--skeleton-w: 7em"></span></span>
              </div>
            </div>
          </section>
        </template>
        <template v-else-if="answered">
          <section v-if="shown.cast.length || shown.crew.length" class="more-info-section">
            <h3 class="ui-group-label more-info-title">Cast and crew</h3>
            <cast-scroller v-if="shown.cast.length" :cast="shown.cast" />
            <dl v-if="shown.crew.length" class="more-info-facts">
              <div v-for="line in shown.crew" :key="line.job" class="more-info-fact">
                <dt class="more-info-fact-label">{{ line.job }}</dt>
                <dd class="more-info-fact-value">{{ line.names }}</dd>
              </div>
            </dl>
          </section>
          <section v-if="shown.rows.length" class="more-info-section">
            <h3 class="ui-group-label more-info-title">Details</h3>
            <dl class="more-info-facts">
              <div v-for="row in shown.rows" :key="row.label" class="more-info-fact">
                <dt class="more-info-fact-label">{{ row.label }}</dt>
                <dd class="more-info-fact-value">{{ row.value }}</dd>
              </div>
            </dl>
          </section>
          <p v-if="shown.emptyText" class="more-info-empty">{{ shown.emptyText }}</p>
        </template>
      </div>
    </details>
  `,
  setup(props) {
    const request = computed(() => moreInfoRequestOf(props))
    const credits = shallowRef(null)
    const opened = ref(MORE_INFO_CLOSED.opened)
    const loading = ref(false)
    const asking = ref(false)
    const bodyEl = ref(null)
    const skeleton = computed(() => moreInfoSkeletonOf(request.value?.kind))
    const answered = ref(false)
    let alive = true

    const swapEased = async (swap) => {
      const fromHeight = bodyEl.value?.offsetHeight ?? 0
      swap()
      await nextTick()
      easeHeightChange({ el: bodyEl.value, fromHeight })
    }

    const placeholder = usePlaceholderTiming(asking, { delayMs: MORE_INFO_SKELETON_AFTER_MS, minMs: MORE_INFO_MIN_MS })
    const placeholderHidden = computed(() => loading.value && !placeholder.showing.value)

    const lookUp = () => loadMoreInfoCredits({
      request: request.value,
      fetchCredits: (wanted) => api('GET', creditsUrlOf(wanted)),
      isCurrent: () => alive,
      after: NEVER_SLOW,
    })

    const showAnswer = (answer) => {
      credits.value = answer
      opened.value = moreInfoAfterLoadOf(answer).opened
      answered.value = true
      loading.value = false
    }

    const whenPlaceholderDone = () => (placeholder.holding.value
      ? new Promise((resolve) => {
        const stop = watch(placeholder.holding, (holding) => {
          if (holding) return
          stop()
          resolve()
        })
      })
      : Promise.resolve())

    const load = async () => {
      asking.value = true
      loading.value = looksUpCreditsFor(request.value)
      const answer = loading.value ? await lookUp() : null
      if (!alive) return
      asking.value = false
      await nextTick()
      await whenPlaceholderDone()
      if (!alive) return
      if (loading.value) await swapEased(() => showAnswer(answer))
      else showAnswer(answer)
    }

    const onToggle = (event) => {
      const next = moreInfoToggledOf({ isOpen: event.target.open, opened: opened.value })
      opened.value = next.opened
      if (next.load) load()
    }

    const shown = computed(() => moreInfoOf({ credits: credits.value, kind: request.value?.kind, guide: props.guide }))

    onUnmounted(() => { alive = false })

    return { request, answered, asking, loading, placeholderHidden, shown, skeleton, bodyEl, onToggle, SKELETON_NAME_WIDTHS, SKELETON_ROLE_WIDTHS }
  },
}

const easeHeightChange = ({ el, fromHeight }) => {
  if (!el?.animate || !fromHeight || prefersReducedMotion()) return
  const toHeight = el.offsetHeight
  if (Math.abs(toHeight - fromHeight) < 1) return
  const clip = 'inset(0 -100vw)'
  el.animate(
    [{ height: `${fromHeight}px`, clipPath: clip }, { height: `${toHeight}px`, clipPath: clip }],
    { duration: HEIGHT_EASE_MS, easing: HEIGHT_EASING },
  )
}

const NEVER_SLOW = () => () => {}
const SKELETON_NAME_WIDTHS = ['5.5em']
const SKELETON_ROLE_WIDTHS = ['5em']
const HEIGHT_EASE_MS = 240
const HEIGHT_EASING = 'cubic-bezier(0.2, 0, 0, 1)'
