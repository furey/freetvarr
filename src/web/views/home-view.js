import { ref, shallowRef, computed, onMounted, onUnmounted, watch } from '/vendor/vue.esm-browser.prod.js'
import { api, loadedBuild } from '/shared/api.js'
import { artFallbackStyle } from '/art-fallback.js'
import { ForYouOverlays, ForYouRows } from '/components/for-you-parts.js'
import { HomeHeroCarousel } from '/components/home-hero-carousel.js'
import { useLibraryActions } from '/components/library-actions.js'
import { DeleteConfirm, LibraryInfoSheet, LibraryMenuSheet, useLibraryToast } from '/components/library-menus.js'
import { MenuCard } from '/components/menu-card.js'
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
import {
  guideMatchMenuOf,
  onNowMenuOf,
  programmeArtOf,
  programmeOfRecording,
  recordingNowMenuOf,
  scheduledMenuOf,
  showArtOf,
  skippedTextOf,
  slideLeadItemOf,
  withGoToShow,
  withLeadItem,
} from '/home-menus.js'
import { episodeById, episodeHeading, episodeMetaOf, recordingRowOf } from '/show-page.js'
import { showKeyOf } from '/show-key.js'
import { forYouHidden, sendFeedback, sendShown, useForYouActions } from '/shared/for-you-session.js'
import { heroArtPoolsFor } from '/shared/hero-art-pools.js'
import { loadNowAll } from '/shared/channel-twins.js'
import { browserStorage } from '/shared/storage.js'
import { freshHomeOf, readHomeCache, writeHomeCache } from '/home-cache.js'
import { playRecording } from '/shared/playback-session.js'
import { watchLive, watchRecordingFromStart, liveChannelOf } from '/shared/live-session.js'
import { playback } from '/shared/player-shared.js'
import { recordingNow, recordingChangeTick, refreshAfterRecordingChange } from '/shared/recording-now.js'
import { useProgrammeSheet } from '/shared/programme-sheet-store.js'
import { now, tz, fmtClockTz } from '/shared/time.js'
import { toast } from '/shared/toast.js'

const HERO_POOL_WAIT_MS = 2000
const HOME_BUILD = loadedBuild || 'dev'

const EMPTY_HOME = {
  inProgress: [],
  newRecordings: [],
  nowEntries: [],
  upcoming: [],
  activeProgramIds: [],
  shows: [],
  watchlist: [],
  movies: [],
  forYouPayload: null,
  heroPools: {},
}

const HOME_REQUESTS = [
  { load: () => api('GET', continueWatchingUrl), pick: (r) => ({ inProgress: r.episodes ?? [] }) },
  { load: () => api('GET', newRecordingsUrl), pick: (r) => ({ newRecordings: r.episodes ?? [] }) },
  { load: loadNowAll, pick: (r) => ({ nowEntries: r.entries ?? [] }) },
  {
    load: () => api('GET', '/api/epg/state'),
    pick: (r) => ({ upcoming: r.upcomingRecordings ?? [], activeProgramIds: r.activeRecordingIds ?? [] }),
  },
  { load: () => api('GET', '/api/library/shows'), pick: (r) => ({ shows: r.shows ?? [] }) },
  { load: () => api('GET', '/api/watchlist'), pick: (r) => ({ watchlist: r.items ?? [] }) },
  { load: () => api('GET', MOVIES_URL), pick: (r) => ({ movies: r.episodes ?? [] }) },
  { load: () => api('GET', FOR_YOU_URL), pick: (r) => ({ forYouPayload: r ?? null }) },
]

const homeStore = shallowRef(null)
let latestLoadId = 0

const cachedHome = (nowMs) => {
  const home = homeStore.value ?? readHomeCache({ storage: browserStorage(), build: HOME_BUILD, nowMs })
  return home && freshHomeOf({ home, nowMs })
}

const keepHome = (home) => {
  homeStore.value = home
  writeHomeCache({ storage: browserStorage(), build: HOME_BUILD, home })
}

const fetchHome = async (previous) => {
  const parts = await Promise.all(HOME_REQUESTS.map(({ load, pick }) => load().then(pick).catch(() => ({}))))
  return Object.assign({ ...(previous ?? EMPTY_HOME) }, ...parts)
}

const heroFeedOf = ({ home, nowMs }) => ({
  inProgress: home.inProgress,
  newEpisodes: home.newRecordings,
  shows: home.shows,
  recordingNow: recordingNow.value.active ?? [],
  nowEntries: home.nowEntries,
  upcoming: home.upcoming,
  activeProgramIds: home.activeProgramIds,
  watchlist: home.watchlist,
  movies: home.movies,
  forYou: forYouSlideOf({
    payload: home.forYouPayload,
    scheduledKeys: scheduledKeysOf(home.upcoming),
    hiddenKeys: forYouHidden.value,
    nowMs,
    timeZone: tz.value,
  }),
  nowMs,
  timeZone: tz.value,
})

const heroPoolsWithin = (pools) =>
  Promise.race([pools, new Promise((resolve) => setTimeout(() => resolve(null), HERO_POOL_WAIT_MS))])

export const HomeView = {
  components: { DeleteConfirm, ForYouOverlays, ForYouRows, HomeHeroCarousel, LibraryInfoSheet, LibraryMenuSheet, MenuCard, RecordingOptionsSheet },
  template: `
    <div class="ui-page home-page">
      <page-header :title="greeting" brand health-alert />
      <template v-if="!loaded">
        <div class="ui-skeleton is-hero home-hero-skeleton"></div>
        <div class="ui-scroller home-skeleton-row">
          <div v-for="n in 4" :key="n" class="ui-skeleton is-card"></div>
        </div>
      </template>
      <template v-else>
        <home-hero-carousel v-if="heroSlides.length" :slides="heroSlides" @action="runSlideAction" @menu="openSlideMenu" />

        <section v-if="newRecordingsRow.length" class="ui-section" aria-labelledby="home-new-title">
          <div class="ui-row-header">
            <h2 id="home-new-title" class="ui-section-title"><a href="#/recordings" class="ui-row-title-link">New recordings<chevron-glyph class="ui-row-chevron" /></a></h2>
            <a href="#/recordings" class="ui-row-link" tabindex="-1" aria-hidden="true">See all</a>
          </div>
          <div class="ui-scroller">
            <menu-card v-for="r in newRecordingsRow" :key="r.recordingId" class="ui-card" :href="showHref(r)"
              :label="newCardLabel(r)" :more-label="'More for ' + r.title" @menu="openEpisodeMenu(r)">
              <span class="ui-card-art ui-art-fallback" :style="fallbackStyleOf(r.title)">
                <programme-image :source="r.image" :title="r.title" variant="info" />
                <span class="ui-art-badge ui-new-badge">NEW</span>
              </span>
              <span class="ui-card-title">{{ r.title }}</span>
              <span class="ui-card-meta">{{ newCardMeta(r) }}</span>
            </menu-card>
          </div>
        </section>

        <section v-if="!inProgress.length && !newRecordings.length" class="ui-empty" aria-label="Nothing recorded yet">
          <h2 class="ui-empty-title">Nothing recorded yet</h2>
          <p class="ui-empty-text">Find a show in the TV guide and record it. New recordings show up here.</p>
          <a href="#/guide" class="ui-button ui-button-primary">Find a show in the TV guide</a>
        </section>

        <section v-if="forYouRow" ref="forYouSection" class="ui-section home-for-you" aria-labelledby="home-for-you-title">
          <div class="ui-row-header">
            <h2 id="home-for-you-title" class="ui-section-title"><a :href="forYouHref" class="ui-row-title-link">{{ forYouRow.title }}<chevron-glyph class="ui-row-chevron" /></a></h2>
            <a :href="forYouHref" class="ui-row-link" tabindex="-1" aria-hidden="true">See all</a>
          </div>
          <for-you-rows :rows="[{ shape: 'card', items: forYouRow.items }]" :ctl="forYou" with-lead />
        </section>

        <section v-if="onNow.length" class="ui-section" aria-labelledby="home-on-now-title">
          <div class="ui-row-header">
            <h2 id="home-on-now-title" class="ui-section-title"><a href="#/live" class="ui-row-title-link">On now<chevron-glyph class="ui-row-chevron" /></a></h2>
            <a href="#/live" class="ui-row-link" tabindex="-1" aria-hidden="true">Live TV</a>
          </div>
          <div class="ui-scroller">
            <menu-card v-for="item in onNow" :key="item.channel.id" class="ui-card home-on-now-card"
              :label="'Watch ' + item.channel.name + ' live, ' + item.program.title + ' on now'"
              :more-label="'More for ' + item.program.title" @open="watchChannel(item)" @menu="openOnNowMenu(item)">
              <span class="ui-card-art ui-art-fallback" :style="fallbackStyleOf(item.program.title)">
                <programme-image :event-id="item.program.has_image ? item.program.program_id : null"
                  :channel-id="item.channel.id" :has-logo="item.channel.hasLogo"
                  :title="item.program.title" variant="info" />
                <span class="ui-art-bar ui-progress is-live" role="progressbar" :aria-label="'Progress of ' + item.program.title"
                  :aria-valuenow="item.percent" aria-valuemin="0" aria-valuemax="100">
                  <span class="ui-progress-fill" :style="{ width: item.percent + '%' }"></span>
                </span>
              </span>
              <span class="home-on-now-text">
                <span class="home-on-now-logo"><channel-logo :channel-id="item.channel.id" :has-logo="item.channel.hasLogo" /><channel-twin-tag :channel-id="item.channel.id" /></span>
                <span class="home-on-now-lines">
                  <span class="ui-card-title">{{ item.program.title }}</span>
                  <span class="ui-card-meta">{{ onNowMetaOf({ item }) }}</span>
                </span>
              </span>
            </menu-card>
          </div>
        </section>

        <section v-if="tonight.length" class="ui-section" aria-labelledby="home-tonight-title">
          <div class="ui-row-header">
            <h2 id="home-tonight-title" class="ui-section-title"><a href="#/recordings/scheduled" class="ui-row-title-link">Recording tonight<chevron-glyph class="ui-row-chevron" /></a></h2>
            <a href="#/recordings/scheduled" class="ui-row-link" tabindex="-1" aria-hidden="true">Scheduled</a>
          </div>
          <ul class="home-tonight">
            <li v-for="item in tonight" :key="item.programId">
              <menu-card class="home-tonight-entry" href="#/recordings/scheduled" :more-label="'More for ' + item.name"
                @menu="openTonightMenu(item)">
                <span class="home-tonight-item">
                  <span class="home-tonight-time">
                    <span class="home-tonight-clock ui-tabular">{{ clockOf(item).time }}</span>
                    <span class="home-tonight-period">{{ clockOf(item).period }}</span>
                  </span>
                  <span class="home-tonight-text">
                    <span class="home-tonight-title">{{ item.name }}</span>
                    <span class="ui-meta">{{ tonightMeta(item) }}</span>
                  </span>
                </span>
              </menu-card>
            </li>
          </ul>
        </section>
      </template>
      <recording-options-sheet v-if="optionsShow" :open="optionsOpen" :show="optionsShow" @close="optionsOpen = false"
        @changed="load" @stopped="onOptionsStopped" />
      <for-you-overlays :ctl="forYou" />
      <library-menu-sheet :open="Boolean(homeMenu)" :title="homeMenu?.title || ''" :subtitle="homeMenu?.subtitle || ''"
        :art-src="homeMenu?.art || ''" :groups="homeMenu?.groups || []" @close="homeMenu = null" @choose="chooseHomeAction" />
      <library-menu-sheet :open="Boolean(menuEpisode)" :title="menuEpisode ? episodeHeading(menuEpisode) : ''"
        :subtitle="episodeMenuSubtitle" :art-src="menuEpisode?.image || ''" :groups="episodeGroups" :busy="libraryBusy"
        :pending-key="libraryPendingKey" @close="closeEpisodeMenu" @choose="chooseEpisodeAction" />
      <library-info-sheet :open="Boolean(episodeInfo)" :info="episodeInfo" @close="closeEpisodeInfo" />
      <delete-confirm :request="deleteRequest" @cancel="cancelDelete" @done="onDeleted" />
    </div>
  `,
  setup() {
    homeStore.value = cachedHome(Date.now())
    const home = computed(() => homeStore.value ?? EMPTY_HOME)
    const inProgress = computed(() => home.value.inProgress)
    const newRecordings = computed(() => home.value.newRecordings)
    const shows = computed(() => home.value.shows)
    const forYouPayload = computed(() => home.value.forYouPayload)
    const nowEntries = computed(() => home.value.nowEntries)
    const upcoming = computed(() => home.value.upcoming)
    const activeProgramIds = computed(() => home.value.activeProgramIds)
    const loaded = computed(() => Boolean(homeStore.value))
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
    const heroFeed = computed(() => heroFeedOf({ home: home.value, nowMs: nowMs.value }))
    const forYouSlide = computed(() => heroFeed.value.forYou)
    const heroSlides = computed(() => heroSlidesOf({ ...heroFeed.value, pools: home.value.heroPools }))
    const heroRecordingIds = computed(() => heroRecordingIdsOf(heroSlides.value))
    const heroProgramIds = computed(() => heroProgramIdsOf(heroSlides.value))
    const newRecordingsRow = computed(() => newRecordings.value.filter((r) => !heroRecordingIds.value.has(r.recordingId)))
    const tonight = computed(() => tonightOf({
      upcoming: upcoming.value.filter((u) => !heroProgramIds.value.has(String(u.programId))),
      activeProgramIds: activeProgramIds.value,
      nowMs: nowMs.value,
      timeZone: tz.value,
    }))

    const load = async () => {
      const loadId = ++latestLoadId
      const isLatest = () => loadId === latestLoadId
      const fresh = await fetchHome(homeStore.value)
      if (!isLatest()) return
      const pools = heroArtPoolsFor(heroCandidatesOf(heroFeedOf({ home: fresh, nowMs: Date.now() })))
      const poolsInTime = await heroPoolsWithin(pools)
      if (!isLatest()) return
      keepHome({ ...fresh, heroPools: poolsInTime ?? fresh.heroPools })
      if (poolsInTime) return
      const found = await pools
      if (isLatest()) keepHome({ ...homeStore.value, heroPools: found })
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

    const { openProgramme, openUpcoming } = useProgrammeSheet()

    const openSlideProgramme = ({ target }, focus = '') => openProgramme({
      channelId: target.channel.id,
      channelHint: target.channel,
      programme: target.program,
      focus,
      dayOffset: target.dayOffset,
    })

    const SLIDE_ACTIONS = {
      play: ({ target }) => playRecording(recordingRowOf(target.episode)),
      'watch-live': (slide) => watchLive({ channel: slide.target.channel, nowTitle: slide.title }),
      'from-start': ({ target, title }) => watchRecordingFromStart({
        channel: target.channel,
        recording: target.recording,
        nowTitle: title,
      }),
      record: (slide) => openSlideProgramme(slide),
      'record-series': (slide) => openSlideProgramme(slide, 'series'),
      guide: (slide) => openSlideProgramme(slide),
      upcoming: ({ target }) => openUpcoming(target.upcoming),
      options: ({ target }) => openRecordingOptions(target.showKey),
    }

    const homeMenu = ref(null)

    const chooseHomeAction = (key) => {
      const action = homeMenu.value?.actions[key]
      homeMenu.value = null
      action?.()
    }

    const goToShow = (showKey) => { window.location.hash = showHrefOf({ showKey }) }

    const skipUpcoming = async (upcoming) => {
      try {
        await api('POST', '/api/epg/cancel', { program_id: upcoming.programId })
        toast({ text: skippedTextOf(upcoming.name, hasRuleFor(showKeyOf(upcoming.name)) ? 'series' : upcoming.kind) })
        refreshAfterRecordingChange()
      } catch (err) {
        toast({ text: 'TVHeadend did not skip that episode', detail: err.message, kind: 'error' })
      }
    }

    const hasRuleFor = (showKey) => shows.value.some((show) => show.key === showKey && show.rule)

    const scheduledMenu = ({ upcoming, subtitle }) => {
      const showKey = showKeyOf(upcoming.name)
      return {
        title: upcoming.name,
        subtitle,
        art: showArtOf(upcoming.name),
        groups: scheduledMenuOf({ hasRule: hasRuleFor(showKey), kind: upcoming.kind }),
        actions: {
          'programme-info': () => openUpcoming(upcoming),
          show: () => goToShow(showKey),
          options: () => openRecordingOptions(showKey),
          skip: () => skipUpcoming(upcoming),
        },
      }
    }

    const SLIDE_MENUS = {
      'on-now': (slide) => ({
        groups: onNowMenuOf({ channelName: slide.target.channel.name, seriesLink: Boolean(slide.target.program.series_link), kind: slide.target.program.kind }),
        actions: {
          'watch-live': () => SLIDE_ACTIONS['watch-live'](slide),
          'record-episode': () => openSlideProgramme(slide, 'episode'),
          'record-series': () => openSlideProgramme(slide, 'series'),
          'programme-info': () => openSlideProgramme(slide),
        },
      }),
      recording: (slide) => {
        const { recording, channel } = slide.target
        return {
          groups: recordingNowMenuOf({ channelName: recording.channelName, canStartOver: slide.primary.action === 'from-start' }),
          actions: {
            'from-start': () => SLIDE_ACTIONS['from-start'](slide),
            'watch-live': () => SLIDE_ACTIONS['watch-live'](slide),
            'programme-info': () => openProgramme({ channelId: recording.channelId, channelHint: channel, programme: programmeOfRecording(recording) }),
            show: () => goToShow(showKeyOf(recording.title)),
          },
        }
      },
      upcoming: (slide) => scheduledMenu({ upcoming: slide.target.upcoming, subtitle: slide.metaShort }),
      watchlist: (slide) => ({
        groups: guideMatchMenuOf({ seriesLink: Boolean(slide.target.program.series_link), kind: slide.target.program.kind }),
        actions: {
          'record-episode': () => openSlideProgramme(slide, 'episode'),
          'record-series': () => openSlideProgramme(slide, 'series'),
          'programme-info': () => openSlideProgramme(slide),
        },
      }),
    }

    const openSlideMenu = (slide) => {
      if (slide.type === 'for-you') return forYou.openMenu(slide.target.item)
      if (slide.recordingId) return openEpisodeMenu({ showKey: slide.showKey, recordingId: slide.recordingId })
      const menu = SLIDE_MENUS[slide.type]?.(slide)
      if (!menu) return
      homeMenu.value = {
        title: slide.title,
        subtitle: slide.metaShort,
        art: slide.art.image,
        groups: withLeadItem({ groups: menu.groups, item: slideLeadItemOf(slide.secondary) }),
        actions: { 'secondary-link': () => { window.location.hash = slide.secondary.href }, ...menu.actions },
      }
    }

    const openOnNow = (item, focus = '') => openProgramme({
      channelId: item.channel.id,
      channelHint: item.channel,
      programme: { ...item.program, channelId: item.channel.id },
      focus,
    })

    const openOnNowMenu = (item) => {
      homeMenu.value = {
        title: item.program.title,
        subtitle: onNowMetaOf({ item }),
        art: programmeArtOf(item.program),
        groups: onNowMenuOf({ channelName: item.channel.name, seriesLink: Boolean(item.program.series_link), kind: item.program.kind }),
        actions: {
          'watch-live': () => watchChannel(item),
          'record-episode': () => openOnNow(item, 'episode'),
          'record-series': () => openOnNow(item, 'series'),
          'programme-info': () => openOnNow(item),
        },
      }
    }

    const openTonightMenu = (item) => {
      const clock = clockOf(item)
      homeMenu.value = scheduledMenu({ upcoming: item, subtitle: [`${clock.time}${clock.period}`, tonightMetaOf(item)].filter(Boolean).join(' · ') })
    }

    const episodeShow = ref(null)
    const { showToast } = useLibraryToast()
    const library = useLibraryActions({
      show: episodeShow,
      reload: load,
      showToast,
      openOptions: () => openRecordingOptions(episodeShow.value.key),
      selectTip: '',
    })
    const episodeGroups = computed(() => withGoToShow(library.episodeGroups.value))
    const episodeMenuSubtitle = computed(() => {
      const episode = library.menuEpisode.value
      return episode ? [episodeShow.value?.title, episodeMetaOf({ episode, timeZone: tz.value })].filter(Boolean).join(' · ') : ''
    })

    const openEpisodeMenu = async (episode) => {
      try {
        const show = await api('GET', `/api/library/shows/${encodeURIComponent(episode.showKey)}`)
        const found = episodeById({ show, recordingId: episode.recordingId })
        if (!found) return goToShow(episode.showKey)
        episodeShow.value = show
        library.openEpisodeMenu(found)
      } catch {
        goToShow(episode.showKey)
      }
    }

    const chooseEpisodeAction = (key) => {
      if (key !== 'show') return library.chooseEpisodeAction(key)
      library.closeMenus()
      goToShow(episodeShow.value.key)
    }

    const runSlideAction = ({ slide, action }) => {
      if (slide.type === 'for-you') sendFeedback(feedbackOf({ kind: 'suggestion_accepted', item: slide.target.item, source: 'carousel' }))
      SLIDE_ACTIONS[action]?.(slide)
    }

    const forYou = useForYouActions({
      source: 'home',
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
    const clockOf = (item) => splitClock(fmtClockTz(item.startDate))
    const fallbackStyleOf = (title) => artFallbackStyle(title)

    return {
      loaded, greeting, heroSlides, runSlideAction, inProgress, newRecordings, newRecordingsRow, onNow, tonight,
      optionsShow, optionsOpen, load, onOptionsStopped, watchChannel, showHref, newCardMeta, newCardLabel,
      clockOf, fallbackStyleOf, onNowMetaOf, tonightMeta: tonightMetaOf,
      forYou, forYouRow, forYouSection, forYouHref: FOR_YOU_HREF,
      homeMenu, chooseHomeAction, openSlideMenu, openOnNowMenu, openTonightMenu, openEpisodeMenu, chooseEpisodeAction,
      episodeGroups, episodeMenuSubtitle, episodeHeading,
      menuEpisode: library.menuEpisode, libraryBusy: library.busy, libraryPendingKey: library.pendingKey,
      closeEpisodeMenu: library.closeMenus, episodeInfo: library.info, closeEpisodeInfo: () => { library.info.value = null },
      deleteRequest: library.deleteRequest, cancelDelete: library.cancelDelete, onDeleted: library.onDeleted,
    }
  },
}
