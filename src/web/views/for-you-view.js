import { ref, computed, onMounted, watch } from '/vendor/vue.esm-browser.prod.js'
import { ForYouIcon, ForYouOverlays, ForYouRows } from '/components/for-you-parts.js'
import { ForYouPrivacyInfo } from '/components/for-you-privacy.js'
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
import { api, loadedBuild } from '/shared/api.js'
import { forYouHidden, sendShown, useForYouActions } from '/shared/for-you-session.js'
import { recordingChangeTick } from '/shared/recording-now.js'
import { now } from '/shared/time.js'
import { browserStorage } from '/shared/storage.js'
import { viewStoreOf } from '/shared/view-store.js'
import { readHomeCache } from '/home-cache.js'
import { FOR_YOU_CACHE, withoutEndedForYouOf } from '/view-cache.js'

const SKIP_KEY = 'freetvarr.forYouChooserSkippedAt'

export const ForYouView = {
  components: { ForYouIcon, ForYouOverlays, ForYouPrivacyInfo, ForYouRows },
  template: `
    <div v-page-reveal class="ui-page for-you-page">
      <a href="#/home" class="for-you-back"><back-glyph /> Home</a>
      <page-header title="For you" :subtitle="intro" subtitle-short="Picked from this week's guide." :widgets="false" class="for-you-header">
        <template #title-info>
          <for-you-privacy-info :genre-lookup="genreLookup" />
        </template>
        <template #actions>
          <recording-chip />
          <clock-label />
          <a :href="suggestionsHref" class="ui-icon-button" aria-label="For you settings" title="For you settings">
            <for-you-icon name="sliders" />
          </a>
          <search-button />
        </template>
        <template #below>
          <recording-chip variant="banner" />
        </template>
      </page-header>

      <template v-if="!loaded">
        <section v-for="n in 2" :key="n" class="ui-section for-you-skeleton" aria-hidden="true">
          <div class="ui-row-header">
            <h2 class="ui-section-title"><span class="ui-skeleton is-text" style="--skeleton-w: 11em"></span></h2>
            <span v-if="n === 1" class="ui-row-meta ui-only-wide"><span class="ui-skeleton is-text" style="--skeleton-w: 8em"></span></span>
          </div>
          <div class="for-you-rows">
            <div class="ui-scroller for-you-scroller is-card">
              <div v-for="m in 5" :key="m" class="for-you-card ui-card">
                <span class="for-you-card-hit">
                  <span class="ui-card-art ui-skeleton"></span>
                  <span class="home-on-now-text">
                    <span class="home-on-now-logo"></span>
                    <span class="home-on-now-lines">
                      <span class="ui-card-title"><span class="ui-skeleton is-text" style="--skeleton-w: 8em"></span></span>
                      <span class="ui-card-meta"><span class="ui-skeleton is-text" style="--skeleton-w: 9em"></span></span>
                      <span class="for-you-reason"><span class="ui-skeleton is-text" style="--skeleton-w: 12em"></span></span>
                    </span>
                  </span>
                </span>
              </div>
            </div>
          </div>
        </section>
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
    const cached = cachedForYou(Date.now())
    const payload = ref(cached?.payload ?? null)
    const upcoming = ref(cached?.upcoming ?? [])
    const pickable = ref(cached?.pickable ?? [])
    const loaded = ref(Boolean(cached))
    const missing = ref(false)
    const picked = ref(new Set())
    const picksSaved = ref(false)
    const savingPicks = ref(false)
    const skippedAt = ref(readSkippedAt())
    const failedArt = ref({})
    const genreLookup = ref(true)
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
        const fresh = {
          payload: settings.enabled === false ? { ...data, enabled: false } : data,
          upcoming: state.upcomingRecordings ?? [],
          pickable: data?.coldStart ? pickableOf(await api('GET', '/api/for-you/pickable').catch(() => [])) : pickable.value,
        }
        payload.value = fresh.payload
        genreLookup.value = settings.genreLookup !== false
        upcoming.value = fresh.upcoming
        pickable.value = fresh.pickable
        missing.value = false
        forYouStore.keep(fresh)
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
      genreLookup,
    }
  },
}

const forYouStore = viewStoreOf(FOR_YOU_CACHE)

const cachedForYou = (nowMs) => forYouStore.cached(nowMs) ?? fromHomeCache(nowMs)

const fromHomeCache = (nowMs) => {
  const home = readHomeCache({ storage: browserStorage(), build: loadedBuild || 'dev', nowMs })
  const payload = home?.forYouPayload
  if (!payload || payload.coldStart || payload.enabled === false) return null
  return { payload: withoutEndedForYouOf({ payload, nowMs }), upcoming: home.upcoming, pickable: [] }
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
    action: 'Open For you settings',
    href: SUGGESTIONS_HREF,
  },
}
