import { computed } from '/vendor/vue.esm-browser.prod.js'
import { recordingsPageOf } from '/route-table.js'
import { routeParams } from '/shared/router.js'

export const ShowView = {
  template: `
    <div class="ui-page show-page">
      <a href="#/recordings" class="ui-row-link show-back"><back-glyph class="ui-group-row-chevron" /> Recordings</a>
      <page-header :title="title" :widgets="false" />
      <section class="ui-empty" aria-label="Episodes">
        <h2 class="ui-empty-title">No episodes yet</h2>
        <p class="ui-empty-text">Episodes of this show appear here once they record.</p>
        <a href="#/recordings" class="ui-button">Back to Recordings</a>
      </section>
    </div>
  `,
  setup() {
    const showKey = computed(() => recordingsPageOf(routeParams.value).showKey || '')
    const title = computed(() => showKey.value.replace(/-/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase()))
    return { title }
  },
}
