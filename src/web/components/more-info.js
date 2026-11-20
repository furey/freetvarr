import { computed, onUnmounted, ref, shallowRef } from '/vendor/vue.esm-browser.prod.js'
import { api } from '/shared/api.js'
import { creditsUrlOf } from '/credits-display.js'
import { MORE_INFO_CLOSED, loadMoreInfoCredits, moreInfoAfterLoadOf, moreInfoOf, moreInfoRequestOf, moreInfoToggledOf } from '/more-info.js'
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
      <div class="more-info-body" :aria-busy="String(loading)">
        <template v-if="loading">
          <section class="more-info-section" aria-hidden="true">
            <h3 class="ui-group-label more-info-title">Cast and crew</h3>
            <ul class="ui-scroller show-cast more-info-skeleton-cast">
              <li v-for="n in 5" :key="n" class="show-cast-person more-info-skeleton-person">
                <span class="ui-skeleton more-info-skeleton-face"></span>
                <span class="ui-skeleton is-line more-info-skeleton-name"></span>
                <span class="ui-skeleton is-line more-info-skeleton-role"></span>
              </li>
            </ul>
            <div class="more-info-facts">
              <span v-for="n in 2" :key="n" class="ui-skeleton is-line more-info-skeleton-fact"></span>
            </div>
          </section>
          <section class="more-info-section" aria-hidden="true">
            <h3 class="ui-group-label more-info-title">Details</h3>
            <div class="more-info-facts">
              <span v-for="n in 5" :key="n" class="ui-skeleton is-line more-info-skeleton-fact"></span>
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
    const answered = ref(false)
    let alive = true

    const load = async () => {
      loading.value = true
      const answer = await loadMoreInfoCredits({
        request: request.value,
        fetchCredits: (wanted) => api('GET', creditsUrlOf(wanted)),
        isCurrent: () => alive,
      })
      if (!alive) return
      credits.value = answer
      opened.value = moreInfoAfterLoadOf(answer).opened
      answered.value = true
      loading.value = false
    }

    const onToggle = (event) => {
      const next = moreInfoToggledOf({ isOpen: event.target.open, opened: opened.value })
      opened.value = next.opened
      if (next.load) load()
    }

    const shown = computed(() => moreInfoOf({ credits: credits.value, kind: request.value?.kind, guide: props.guide }))

    onUnmounted(() => { alive = false })

    return { request, answered, loading, shown, onToggle }
  },
}
