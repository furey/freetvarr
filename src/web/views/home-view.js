import { ref, computed, onMounted, onUnmounted, watch } from '/vendor/vue.esm-browser.prod.js'
import { api } from '/shared/api.js'
import { artFallbackStyle } from '/art-fallback.js'
import { ForYouOverlays, ForYouRows } from '/components/for-you-parts.js'
import { HomeHeroCarousel } from '/components/home-hero-carousel.js'
import { RecordingOptionsSheet } from '/components/recording-options-sheet.js'
import { MOVIES_URL, heroCandidatesOf, heroSlidesOf, heroRecordingIdsOf, heroProgramIdsOf } from '/home-hero.js'
import {
  continueWatchingUrl,
  newRecordingsUrl,
  favouriteOnNowOf,
  tonightOf,
  tonightMetaOf,
  newCardMetaOf,
  onNowMetaOf,
  greetingFor,
  showHrefOf,
  splitClock,
} from '/home-feed.js'
import { FOR_YOU_HREF, FOR_YOU_URL, feedbackOf, forYouSlideOf, homeRowOf, isScheduled, scheduledKeysOf } from '/for-you.js'
import { recordingRowOf } from '/show-page.js'
import { forYouHidden, sendFeedback, sendShown, useForYouActions } from '/shared/for-you-session.js'
import { heroArtPoolsFor } from '/shared/hero-art-pools.js'
import { playRecording } from '/shared/playback-session.js'
import { watchLive, watchRecordingFromStart, liveChannelOf } from '/shared/live-session.js'
import { playback } from '/shared/player-shared.js'
import { recordingNow, recordingChangeTick } from '/shared/recording-now.js'
import { openInGuide } from '/shared/store.js'
import { now, tz, fmtClockTz } from '/shared/time.js'

const HERO_POOL_WAIT_MS = 2000

export const HomeView = {
  components: { ForYouOverlays, ForYouRows, HomeHeroCarousel, RecordingOptionsSheet },
  template: `
    <div class="ui-page home-page">
      <page-header :title="greeting" brand />
      <template v-if="!loaded">
        <div class="ui-skeleton is-hero home-hero-skeleton"></div>
        <div class="ui-scroller home-skeleton-row">
          <div v-for="n in 4" :key="n" class="ui-skeleton is-card"></div>
        </div>
      </template>
      <template v-else>
        <home-hero-carousel v-if="heroSlides.length" :slides="heroSlides" @action="runSlideAction" />

        <section v-if="newRecordingsRow.length" class="ui-section" aria-labelledby="home-new-title">
          <div class="ui-row-header">
            <h2 id="home-new-title" class="ui-section-title">New recordings</h2>
            <a href="#/recordings" class="ui-row-link">See all</a>
          </div>
          <div class="ui-scroller">
            <a v-for="r in newRecordingsRow" :key="r.recordingId" :href="showHref(r)" class="ui-card"
              :aria-label="newCardLabel(r)">
              <div class="ui-card-art ui-art-fallback" :style="fallbackStyleOf(r.title)">
                <programme-image :source="r.image" :title="r.title" variant="info" />
                <span class="ui-art-badge ui-new-badge">NEW</span>
              </div>
              <div class="ui-card-title">{{ r.title }}</div>
              <div class="ui-card-meta">{{ newCardMeta(r) }}</div>
            </a>
          </div>
        </section>

        <section v-if="!inProgress.length && !newRecordings.length" class="ui-empty" aria-label="Nothing recorded yet">
          <h2 class="ui-empty-title">Nothing recorded yet</h2>
          <p class="ui-empty-text">Find a show in the Guide and record it. New recordings show up here.</p>
          <a href="#/guide" class="ui-button ui-button-primary">Find a show in the Guide</a>
        </section>

        <section v-if="forYouRow" ref="forYouSection" class="ui-section home-for-you" aria-labelledby="home-for-you-title">
          <div class="ui-row-header">
            <h2 id="home-for-you-title" class="ui-section-title">{{ forYouRow.title }}</h2>
            <a :href="forYouHref" class="ui-row-link">See all</a>
          </div>
          <for-you-rows :rows="[{ shape: 'card', items: forYouRow.items }]" :ctl="forYou" with-lead />
        </section>

        <section v-if="onNow.length" class="ui-section" aria-labelledby="home-on-now-title">
          <div class="ui-row-header">
            <h2 id="home-on-now-title" class="ui-section-title">On now</h2>
            <a href="#/live" class="ui-row-link">Live TV</a>
          </div>
          <div class="ui-scroller">
            <button v-for="item in onNow" :key="item.channel.id" type="button" class="ui-card home-card-button"
              :aria-label="'Watch ' + item.channel.name + ' live, ' + item.program.title + ' on now'"
              @click="watchChannel(item)">
              <div class="ui-card-art ui-art-fallback" :style="fallbackStyleOf(item.program.title)">
                <programme-image :event-id="item.program.has_image ? item.program.program_id : null"
                  :channel-id="item.channel.id" :has-logo="item.channel.hasLogo"
                  :title="item.program.title" variant="info" />
                <span class="ui-art-badge ui-channel-tag is-end">{{ channelTag(item.channel) }}</span>
                <span class="ui-art-bar ui-progress is-live" role="progressbar" :aria-label="'Progress of ' + item.program.title"
                  :aria-valuenow="item.percent" aria-valuemin="0" aria-valuemax="100">
                  <span class="ui-progress-fill" :style="{ width: item.percent + '%' }"></span>
                </span>
              </div>
              <div class="ui-card-title">{{ item.program.title }}</div>
              <div class="ui-card-meta">{{ onNowMetaOf({ item }) }}</div>
            </button>
          </div>
        </section>

        <section v-if="tonight.length" class="ui-section" aria-labelledby="home-tonight-title">
          <div class="ui-row-header">
            <h2 id="home-tonight-title" class="ui-section-title">Recording tonight</h2>
            <a href="#/recordings/scheduled" class="ui-row-link">Scheduled</a>
          </div>
          <ul class="home-tonight">
            <li v-for="item in tonight" :key="item.programId">
              <a :href="'#/recordings/scheduled'" class="home-tonight-item">
                <span class="home-tonight-time">
                  <span class="home-tonight-clock ui-tabular">{{ clockOf(item).time }}</span>
                  <span class="home-tonight-period">{{ clockOf(item).period }}</span>
                </span>
                <span class="home-tonight-text">
                  <span class="home-tonight-title">{{ item.name }}</span>
                  <span class="ui-meta">{{ tonightMeta(item) }}</span>
                </span>
              </a>
            </li>
          </ul>
        </section>
      </template>
      <recording-options-sheet v-if="optionsShow" :open="optionsOpen" :show="optionsShow" @close="optionsOpen = false"
        @changed="load" @stopped="onOptionsStopped" />
      <for-you-overlays :ctl="forYou" />
    </div>
  `,
  setup() {
    const inProgress = ref([])
    const newRecordings = ref([])
    const shows = ref([])
    const watchlist = ref([])
    const movies = ref([])
    const forYouPayload = ref(null)
    const nowEntries = ref([])
    const upcoming = ref([])
    const activeProgramIds = ref([])
    const loaded = ref(false)
    const optionsShow = ref(null)
    const optionsOpen = ref(false)

    const nowMs = computed(() => now.value.getTime())
    const greeting = computed(() => greetingFor({ nowMs: nowMs.value, timeZone: tz.value }))
    const onNow = computed(() => favouriteOnNowOf({ entries: nowEntries.value, nowMs: nowMs.value }))

    const scheduledKeys = computed(() => scheduledKeysOf(upcoming.value))
    const forYouRow = computed(() => homeRowOf({
      payload: forYouPayload.value,
      scheduledKeys: scheduledKeys.value,
      hiddenKeys: forYouHidden.value,
    }))
    const forYouSlide = computed(() => forYouSlideOf({
      payload: forYouPayload.value,
      scheduledKeys: scheduledKeys.value,
      hiddenKeys: forYouHidden.value,
      nowMs: nowMs.value,
      timeZone: tz.value,
    }))

    const heroFeed = computed(() => ({
      inProgress: inProgress.value,
      newEpisodes: newRecordings.value,
      shows: shows.value,
      recordingNow: recordingNow.value.active ?? [],
      nowEntries: nowEntries.value,
      upcoming: upcoming.value,
      activeProgramIds: activeProgramIds.value,
      watchlist: watchlist.value,
      movies: movies.value,
      forYou: forYouSlide.value,
      nowMs: nowMs.value,
      timeZone: tz.value,
    }))
    const heroPools = ref({})
    const heroSlides = computed(() => heroSlidesOf({ ...heroFeed.value, pools: heroPools.value }))
    const heroRecordingIds = computed(() => heroRecordingIdsOf(heroSlides.value))
    const heroProgramIds = computed(() => heroProgramIdsOf(heroSlides.value))
    const newRecordingsRow = computed(() => newRecordings.value.filter((r) => !heroRecordingIds.value.has(r.recordingId)))
    const tonight = computed(() => tonightOf({
      upcoming: upcoming.value.filter((u) => !heroProgramIds.value.has(String(u.programId))),
      activeProgramIds: activeProgramIds.value,
      nowMs: nowMs.value,
      timeZone: tz.value,
    }))

    const settled = (promise, fallback) => promise.catch(() => fallback)

    const load = async () => {
      const [resumable, unplayed, nowData, state, library, watching, unwatchedMovies, suggestions] = await Promise.all([
        settled(api('GET', continueWatchingUrl), { episodes: [] }),
        settled(api('GET', newRecordingsUrl), { episodes: [] }),
        settled(api('GET', '/api/epg/now?all=1'), { entries: [] }),
        settled(api('GET', '/api/epg/state'), { upcomingRecordings: [], activeRecordingIds: [] }),
        settled(api('GET', '/api/library/shows'), { shows: [] }),
        settled(api('GET', '/api/watchlist'), { items: [] }),
        settled(api('GET', MOVIES_URL), { episodes: [] }),
        settled(api('GET', FOR_YOU_URL), null),
      ])
      inProgress.value = resumable.episodes ?? []
      newRecordings.value = unplayed.episodes ?? []
      nowEntries.value = nowData.entries ?? []
      upcoming.value = state.upcomingRecordings ?? []
      activeProgramIds.value = state.activeRecordingIds ?? []
      shows.value = library.shows ?? []
      watchlist.value = watching.items ?? []
      movies.value = unwatchedMovies.episodes ?? []
      forYouPayload.value = suggestions
      await loadHeroPools()
      loaded.value = true
    }

    const loadHeroPools = () => {
      const pools = heroArtPoolsFor(heroCandidatesOf(heroFeed.value)).then((found) => { heroPools.value = found })
      return Promise.race([pools, new Promise((resolve) => setTimeout(resolve, HERO_POOL_WAIT_MS))])
    }

    onMounted(load)
    watch(recordingChangeTick, load)
    const stopWatchingPlayer = watch(() => playback.open, (open, wasOpen) => { if (wasOpen && !open) load() })
    onUnmounted(stopWatchingPlayer)

    const openRecordingOptions = async (showKey) => {
      try {
        optionsShow.value = await api('GET', `/api/library/shows/${encodeURIComponent(showKey)}`)
        optionsOpen.value = true
      } catch {
        window.location.hash = '#/recordings/scheduled'
      }
    }

    const onOptionsStopped = () => {
      optionsOpen.value = false
      load()
    }

    const guideHandoff = ({ target }, focus = '') => openInGuide({
      channelId: target.channel.id,
      program: target.program,
      focus,
      dayOffset: target.dayOffset,
      returnTo: '#/home',
    })

    const SLIDE_ACTIONS = {
      play: ({ target }) => playRecording(recordingRowOf(target.episode)),
      'watch-live': (slide) => watchLive({ channel: slide.target.channel, nowTitle: slide.title }),
      'from-start': ({ target, title }) => watchRecordingFromStart({
        channel: target.channel,
        recording: target.recording,
        nowTitle: title,
      }),
      record: (slide) => guideHandoff(slide),
      'record-series': (slide) => guideHandoff(slide, 'series'),
      guide: (slide) => guideHandoff(slide),
      upcoming: ({ target }) => openInGuide({ upcoming: target.upcoming, returnTo: '#/home' }),
      options: ({ target }) => openRecordingOptions(target.showKey),
    }

    const runSlideAction = ({ slide, action }) => {
      if (slide.type === 'for-you') sendFeedback(feedbackOf({ kind: 'suggestion_accepted', item: slide.target.item, source: 'carousel' }))
      SLIDE_ACTIONS[action]?.(slide)
    }

    const forYou = useForYouActions({
      source: 'home',
      returnTo: '#/home',
      isScheduled: (item) => isScheduled({ item, scheduledKeys: scheduledKeys.value }),
      onChanged: load,
    })

    let forYouShownSent = false
    const reportForYouShown = () => {
      if (forYouShownSent || !forYouRow.value) return
      forYouShownSent = true
      sendShown({ items: forYouRow.value.items, source: 'home' })
      if (forYouSlide.value) sendShown({ items: [forYouSlide.value.target.item], source: 'carousel' })
    }
    const forYouSection = ref(null)
    let forYouObserver = null
    watch(forYouSection, (el) => {
      forYouObserver?.disconnect()
      if (!el || forYouShownSent) return
      if (!('IntersectionObserver' in window)) return reportForYouShown()
      forYouObserver = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        forYouObserver.disconnect()
        reportForYouShown()
      }, { threshold: 0.25 })
      forYouObserver.observe(el)
    })
    onUnmounted(() => forYouObserver?.disconnect())

    const watchChannel = (item) => watchLive({
      channel: liveChannelOf(item.channel),
      nowTitle: item.program.title || '',
    })

    const showHref = (episode) => showHrefOf(episode)
    const newCardMeta = (episode) => newCardMetaOf({ episode, nowMs: nowMs.value, timeZone: tz.value })
    const newCardLabel = (episode) => `${episode.title}, new recording, ${newCardMeta(episode)}`
    const channelTag = (channel) => channel.number != null ? String(channel.number) : channel.name
    const clockOf = (item) => splitClock(fmtClockTz(item.startDate))
    const fallbackStyleOf = (title) => artFallbackStyle(title)

    return {
      loaded, greeting, heroSlides, runSlideAction, inProgress, newRecordings, newRecordingsRow, onNow, tonight,
      optionsShow, optionsOpen, load, onOptionsStopped, watchChannel, showHref, newCardMeta, newCardLabel,
      channelTag, clockOf, fallbackStyleOf, onNowMetaOf, tonightMeta: tonightMetaOf,
      forYou, forYouRow, forYouSection, forYouHref: FOR_YOU_HREF,
    }
  },
}
