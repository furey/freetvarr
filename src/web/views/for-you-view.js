import { ref, computed, onMounted, watch } from '/vendor/vue.esm-browser.prod.js'
import { ForYouIcon, ForYouOverlays, ForYouRows } from '/components/for-you-parts.js'
import {
  FOR_YOU_URL,
  SUGGESTIONS_HREF,
  chooserShownOf,
  doneLabelOf,
  isScheduled,
  pageIntroOf,
  pickableOf,
  scheduledKeysOf,
  sectionsOf,
} from '/for-you.js'
import { artFallbackStyle } from '/art-fallback.js'
import { api } from '/shared/api.js'
import { forYouHidden, sendShown, useForYouActions } from '/shared/for-you-session.js'
import { recordingChangeTick } from '/shared/recording-now.js'
import { now } from '/shared/time.js'

const SKIP_KEY = 'freetvarr.forYouChooserSkippedAt'

export const ForYouView = {
  components: { ForYouIcon, ForYouOverlays, ForYouRows },
  template: `
    <div class="ui-page for-you-page">
      <a href="#/home" class="for-you-back"><back-glyph /> Home</a>
      <header class="ui-page-header for-you-header">
        <div class="ui-page-heading">
          <h1 class="ui-page-title">For you</h1>
          <p class="ui-page-subtitle">{{ intro }}</p>
        </div>
        <a :href="suggestionsHref" class="ui-icon-button for-you-tune-button" aria-label="Suggestion settings">
          <for-you-icon name="sliders" />
        </a>
      </header>

      <template v-if="!loaded">
        <div v-for="n in 2" :key="n" class="ui-section">
          <div class="ui-skeleton is-row for-you-skeleton-title"></div>
          <div class="ui-scroller"><div v-for="m in 4" :key="m" class="ui-skeleton is-card"></div></div>
        </div>
      </template>

      <section v-else-if="unavailable" class="ui-empty" aria-label="For you">
        <h2 class="ui-empty-title">{{ unavailable.title }}</h2>
        <p class="ui-empty-text">{{ unavailable.text }}</p>
        <a :href="unavailable.href" class="ui-button ui-button-primary">{{ unavailable.action }}</a>
      </section>

      <template v-else>
        <section v-if="chooserShown" class="for-you-chooser" aria-labelledby="for-you-chooser-title">
          <div class="for-you-chooser-head">
            <div>
              <h2 id="for-you-chooser-title" class="ui-section-title">Pick a few shows you like</h2>
              <p class="ui-meta for-you-chooser-intro"><span class="ui-only-wide">Optional. Shows from this week's guide; pick as many as you like.</span><span class="ui-only-phone">Optional. Pick as many as you like.</span></p>
            </div>
            <div class="for-you-chooser-actions ui-only-wide">
              <button type="button" class="ui-button ui-button-secondary" @click="skipChooser">Skip</button>
              <button type="button" class="ui-button ui-button-primary" :disabled="!picked.size || savingPicks" @click="savePicks">{{ doneLabel }}</button>
            </div>
          </div>
          <div class="for-you-picks" role="group" aria-label="Shows from this week's guide">
            <button v-for="show in pickable" :key="show.seriesKey" type="button" class="for-you-pick"
              :aria-pressed="String(picked.has(show.seriesKey))" @click="togglePick(show.seriesKey)">
              <span class="ui-poster-art ui-art-fallback for-you-pick-art" :style="fallbackStyleOf(show.title)">
                <img v-if="show.image && !failedArt[show.seriesKey]" :src="show.image" alt="" loading="lazy" @error="markFailed(show.seriesKey)" />
                <span class="ui-art-title for-you-pick-title">{{ show.title }}</span>
                <span class="for-you-pick-check" aria-hidden="true"><for-you-icon name="check" /></span>
              </span>
            </button>
          </div>
          <div class="for-you-chooser-actions ui-only-phone">
            <button type="button" class="ui-button ui-button-secondary" @click="skipChooser">Skip</button>
            <button type="button" class="ui-button ui-button-primary" :disabled="!picked.size || savingPicks" @click="savePicks">{{ doneLabel }}</button>
          </div>
        </section>

        <section v-for="section in sections" :key="section.key" class="ui-section" :aria-labelledby="'for-you-' + section.key">
          <div class="ui-row-header">
            <h2 :id="'for-you-' + section.key" class="ui-section-title">{{ section.title }}</h2>
            <span v-if="section.sortedByAirTime" class="ui-row-meta ui-only-wide">Sorted by air time</span>
          </div>
          <for-you-rows :rows="section.rows" :ctl="ctl" />
        </section>

        <section v-if="!sections.length" class="ui-empty" aria-label="Nothing to suggest">
          <h2 class="ui-empty-title">Nothing to suggest right now</h2>
          <p class="ui-empty-text">Suggestions come from the next 7 days of the guide. Check back after the next guide update.</p>
        </section>

        <a v-if="!payload?.coldStart" :href="suggestionsHref" class="for-you-tune">
          <span class="for-you-tune-icon"><for-you-icon name="sliders" /></span>
          <span class="for-you-tune-text">
            <span class="for-you-tune-title">Tune your suggestions</span>
            <span class="ui-meta">Hidden shows, TVmaze genres, viewing history</span>
          </span>
          <chevron-glyph class="for-you-tune-chevron" />
        </a>
      </template>

      <for-you-overlays :ctl="ctl" />
    </div>
  `,
  setup() {
    const payload = ref(null)
    const upcoming = ref([])
    const pickable = ref([])
    const loaded = ref(false)
    const missing = ref(false)
    const picked = ref(new Set())
    const picksSaved = ref(false)
    const savingPicks = ref(false)
    const skippedAt = ref(readSkippedAt())
    const failedArt = ref({})
    let shownSent = false

    const scheduledKeys = computed(() => scheduledKeysOf(upcoming.value))
    const sections = computed(() => sectionsOf({ payload: payload.value, scheduledKeys: scheduledKeys.value, hiddenKeys: forYouHidden.value }))
    const intro = computed(() => pageIntroOf({ coldStart: Boolean(payload.value?.coldStart) }))
    const chooserShown = computed(() => chooserShownOf({
      coldStart: Boolean(payload.value?.coldStart),
      pickable: pickable.value,
      skippedAt: skippedAt.value,
      picked: picksSaved.value,
      nowMs: now.value.getTime(),
    }))
    const doneLabel = computed(() => doneLabelOf(picked.value.size))
    const unavailable = computed(() => {
      if (missing.value) return UNAVAILABLE.missing
      if (payload.value?.enabled === false) return UNAVAILABLE.off
      return null
    })

    const load = async () => {
      try {
        const [data, state, settings] = await Promise.all([
          api('GET', FOR_YOU_URL),
          api('GET', '/api/epg/state').catch(() => ({ upcomingRecordings: [] })),
          api('GET', '/api/for-you/settings').catch(() => ({})),
        ])
        payload.value = settings.enabled === false ? { ...data, enabled: false } : data
        upcoming.value = state.upcomingRecordings ?? []
        missing.value = false
        if (data?.coldStart) pickable.value = pickableOf(await api('GET', '/api/for-you/pickable').catch(() => []))
      } catch {
        missing.value = true
      } finally {
        loaded.value = true
      }
      reportShown()
    }

    const reportShown = () => {
      if (shownSent || !sections.value.length) return
      shownSent = true
      sendShown({ items: sections.value.flatMap((section) => section.rows.flatMap((row) => row.items)), source: 'for-you' })
    }

    const ctl = useForYouActions({
      source: 'for-you',
      isScheduled: (item) => isScheduled({ item, scheduledKeys: scheduledKeys.value }),
      onChanged: load,
    })

    const togglePick = (key) => {
      const next = new Set(picked.value)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      picked.value = next
    }

    const skipChooser = () => {
      skippedAt.value = Date.now()
      try { localStorage.setItem(SKIP_KEY, String(skippedAt.value)) } catch {}
    }

    const savePicks = async () => {
      savingPicks.value = true
      try {
        await api('POST', '/api/for-you/picks', { seriesKeys: [...picked.value] })
        picksSaved.value = true
        await load()
      } catch {
        savingPicks.value = false
        return
      }
      savingPicks.value = false
    }

    const fallbackStyleOf = (title) => artFallbackStyle(title)
    const markFailed = (key) => { failedArt.value = { ...failedArt.value, [key]: true } }

    onMounted(load)
    watch(recordingChangeTick, load)

    return {
      payload, loaded, unavailable, sections, intro, chooserShown, pickable, picked, doneLabel, savingPicks, failedArt,
      ctl, togglePick, skipChooser, savePicks, fallbackStyleOf, markFailed, suggestionsHref: SUGGESTIONS_HREF,
    }
  },
}

const readSkippedAt = () => {
  try {
    return Number(localStorage.getItem(SKIP_KEY)) || null
  } catch {
    return null
  }
}

const UNAVAILABLE = {
  missing: {
    title: 'For you is not ready yet',
    text: 'This box has not started making suggestions. Check back after the next update.',
    action: 'Back to Home',
    href: '#/home',
  },
  off: {
    title: 'For you is off',
    text: 'Turn on Show For you to get suggestions from the guide.',
    action: 'Open Suggestions',
    href: SUGGESTIONS_HREF,
  },
}
