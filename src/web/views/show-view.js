import { ref, computed, nextTick, onMounted, onUnmounted, watch } from '/vendor/vue.esm-browser.prod.js'
import { artFallbackStyle } from '/art-fallback.js'
import { recordingsPageOf } from '/route-table.js'
import {
  activeRecordingFor,
  episodeById,
  episodeHeading,
  episodeMetaOf,
  heroMetaOf,
  isSeriesShow,
  listedEpisodesOf,
  playButtonLabel,
  ruleStatusOf,
  seasonLabel,
  showsSeasonChips,
  showTitleIn,
  titleFromKey,
} from '/show-page.js'
import { firstEpisodeText, scheduledWhenOf } from '/library-shelves.js'
import {
  allEpisodesOf,
  allSelectedIn,
  isRecordingNow,
  prunedSelection,
  selectAllIn,
  selectionTitle,
  toggledSelection,
} from '/library-menus.js'
import { useLibraryActions } from '/components/library-actions.js'
import { ActionConfirm, DeleteConfirm, LibraryInfoSheet, LibraryMenuSheet, MenuIcon, useLibraryToast } from '/components/library-menus.js'
import { RecordingOptionsSheet } from '/components/recording-options-sheet.js'
import { MoveToShowSheet } from '/components/move-to-show-sheet.js'
import { ArtworkPicker } from '/components/artwork-picker.js'
import { useProgrammeRatings } from '/components/programme-ratings.js'
import { ShowAbout, ShowCast, useProgrammeCredits } from '/components/show-credits.js'
import { crewLinesOf, newestSynopsisOf, overviewOf, shownCastOf } from '/credits-display.js'
import { api, loadedBuild } from '/shared/api.js'
import { browserStorage } from '/shared/storage.js'
import { readHomeCache } from '/home-cache.js'
import { knownShowTitleOf } from '/show-key.js'
import { createResponseOrder } from '/response-order.js'
import { rememberArtworkStamp, stampedShowImage } from '/shared/artwork-stamps.js'
import { showImageUrlOf } from '/artwork-stamps.js'
import { useLongPress } from '/shared/long-press.js'
import { overlayStack } from '/overlay-stack.js'
import { playback } from '/shared/player-shared.js'
import { recordingNow, recordingChangeTick, recordingSetKey } from '/shared/recording-now.js'
import { routeParams, cameFromHash, cameFromHistory, navigate } from '/shared/router.js'
import { backTargetOf } from '/back-target.js'
import { syncStatus } from '/shared/sync-status.js'
import { now, tz } from '/shared/time.js'
import { useProgrammeSheet } from '/shared/programme-sheet-store.js'
import {
  canWatchFromStart,
  episodeBadgeOf,
  inProgressEpisodeLineOf,
  inProgressEpisodeMetaOf,
  inProgressHeroMetaOf,
  isRecordingPhase,
  liveInProgressOf,
  recordedPercentOf,
  recordingCardOf,
} from '/in-progress-display.js'

export const ShowView = {
  components: { ActionConfirm, RecordingOptionsSheet, ArtworkPicker, LibraryMenuSheet, LibraryInfoSheet, DeleteConfirm, MenuIcon, ShowAbout, ShowCast, MoveToShowSheet },
  template: `
    <div v-page-reveal :class="['ui-page', 'show-page', { 'is-selecting': selecting }]">
      <section class="show-hero ui-art-fallback" :style="heroStyle" :aria-label="title">
        <img v-if="heroSrc && !heroFailed" class="show-hero-art" :src="heroSrc" alt="" @error="heroFailed = true" />
        <span class="show-hero-scrim"></span>
        <a :href="backTarget.route" class="show-back" @click.prevent="goBack"><back-glyph /> {{ backTarget.label }}</a>
        <div v-if="show" class="show-hero-badges">
          <programme-art-badges :classification="show.classification || null" :score="ratingScore" :loading="ratingLoading" v-model:open="ratingCardOpen" />
        </div>
        <div class="show-hero-body">
          <h1 class="show-title"><template v-if="title">{{ title }}</template><span v-else class="ui-skeleton is-text show-title-skeleton" aria-hidden="true"></span></h1>
          <p class="show-hero-meta"><template v-if="show">{{ shownHeroMeta }}</template><span v-else-if="!loaded" class="ui-skeleton is-text show-meta-skeleton" aria-hidden="true"></span></p>
          <div v-if="!loaded" class="show-actions ui-only-wide" aria-hidden="true">
            <span class="ui-button ui-button-secondary show-options-button ui-skeleton show-skeleton-button"></span>
            <span class="ui-icon-button show-more-button ui-skeleton"></span>
          </div>
          <div v-else-if="show && heroFromStart" class="show-actions ui-only-wide">
            <button type="button" class="ui-button ui-button-primary show-from-start" @click="watchFromStart(currentEpisode)"><play-glyph /> Watch from the start</button>
            <button type="button" class="ui-button ui-button-secondary show-options-button" @click="watchRecordingLive(currentEpisode)"><tv-icon /> Watch live</button>
            <button type="button" class="ui-icon-button show-more-button" :aria-label="'More actions for ' + title" aria-haspopup="dialog" @click="openShowMenu"><more-glyph /></button>
          </div>
          <div v-else-if="show && hasShowActions" class="show-actions ui-only-wide">
            <button v-if="playLabel" type="button" class="ui-button ui-button-primary" @click="playNext"><play-glyph /> {{ playLabel }}</button>
            <button v-if="show.rule" type="button" class="ui-button ui-button-secondary show-options-button" @click="optionsOpen = true"><sliders-icon /> Recording options</button>
            <button type="button" class="ui-icon-button show-more-button" :aria-label="'More actions for ' + title" aria-haspopup="dialog" @click="openShowMenu"><more-glyph /></button>
          </div>
        </div>
      </section>

      <div v-if="!loaded" class="show-body" aria-busy="true">
        <div class="show-actions ui-only-phone" aria-hidden="true">
          <span class="ui-button ui-button-secondary show-options-button ui-skeleton"></span>
          <span class="ui-icon-button show-more-button ui-skeleton"></span>
        </div>
        <div class="show-rule is-static ui-skeleton-surface" aria-hidden="true">
          <span class="show-rule-mark is-idle"><span></span></span>
          <span class="show-rule-text">
            <span class="show-rule-headline"><span class="ui-skeleton is-text" style="--skeleton-w: 12em"></span></span>
            <span class="show-rule-detail"><span class="ui-skeleton is-text ui-only-wide" style="--skeleton-w: 18em"></span><span class="ui-skeleton is-text ui-only-phone" style="--skeleton-w: 100%"></span><span class="ui-skeleton is-text ui-only-phone" style="--skeleton-w: 100%"></span><span class="ui-skeleton is-text ui-only-phone" style="--skeleton-w: 40%"></span></span>
          </span>
        </div>
        <section class="show-episodes" aria-hidden="true">
          <div class="show-episodes-header">
            <h2 class="ui-section-title"><span class="ui-skeleton is-text" style="--skeleton-w: 4.5em"></span></h2>
            <div class="show-seasons"><span class="ui-chip show-season-only"><span class="ui-skeleton is-text" style="--skeleton-w: 4em"></span></span></div>
            <span class="show-select-button"><span class="ui-skeleton is-text" style="--skeleton-w: 3em"></span></span>
          </div>
          <ul class="show-episode-list">
            <li v-for="n in 3" :key="n" class="show-episode">
              <div class="show-episode-thumb"><span class="ui-skeleton is-fill"></span></div>
              <div class="show-episode-text">
                <h3 class="show-episode-title"><span class="ui-skeleton is-text" style="--skeleton-w: 9em"></span></h3>
                <p class="show-episode-meta"><span class="ui-skeleton is-text ui-only-wide" style="--skeleton-w: 13em"></span><span class="ui-skeleton is-text ui-only-phone" style="--skeleton-w: 100%"></span><span class="ui-skeleton is-text ui-only-phone" style="--skeleton-w: 40%"></span></p>
                <p class="show-episode-synopsis"><span class="ui-skeleton is-text ui-only-wide" style="--skeleton-w: 24em"></span><span class="ui-skeleton is-text ui-only-phone" style="--skeleton-w: 100%"></span><span class="ui-skeleton is-text ui-only-phone" style="--skeleton-w: 70%"></span></p>
              </div>
            </li>
          </ul>
        </section>
      </div>

      <section v-else-if="missing" class="ui-empty show-missing" aria-label="Show not found">
        <h2 class="ui-empty-title">This show is not in your library</h2>
        <p class="ui-empty-text">It may have been removed, or the link is out of date.</p>
        <a :href="backTarget.route" class="ui-button" @click.prevent="goBack">{{ backTarget.label === 'Back' ? 'Back' : 'Back to ' + backTarget.label }}</a>
      </section>

      <p v-else-if="error && !show" class="ui-banner is-error" role="alert">Cannot load this show: {{ error }}</p>

      <div v-else-if="show" class="show-body">
        <div v-if="heroFromStart" class="show-actions ui-only-phone">
          <button type="button" class="ui-button ui-button-primary show-from-start" @click="watchFromStart(currentEpisode)"><play-glyph /> Watch from the start</button>
          <button type="button" class="ui-button ui-button-secondary show-options-button" @click="watchRecordingLive(currentEpisode)"><tv-icon /> Watch live</button>
          <button type="button" class="ui-icon-button show-more-button" :aria-label="'More actions for ' + title" aria-haspopup="dialog" @click="openShowMenu"><more-glyph /></button>
        </div>
        <div v-else-if="hasShowActions" class="show-actions ui-only-phone">
          <button v-if="playLabel" type="button" class="ui-button ui-button-primary" @click="playNext"><play-glyph /> {{ playLabel }}</button>
          <button v-if="show.rule" type="button" class="ui-button ui-button-secondary show-options-button" @click="optionsOpen = true"><sliders-icon /> Recording options</button>
          <button type="button" class="ui-icon-button show-more-button" :aria-label="'More actions for ' + title" aria-haspopup="dialog" @click="openShowMenu"><more-glyph /></button>
        </div>

        <button v-if="show.rule" type="button" class="show-rule" @click="optionsOpen = true" aria-haspopup="dialog">
          <span :class="['show-rule-mark', 'is-' + shownRuleStatus.tone]" aria-hidden="true"><span></span></span>
          <span class="show-rule-text">
            <span class="show-rule-headline">{{ shownRuleStatus.headline }}</span>
            <span class="show-rule-detail">{{ shownRuleStatus.detail }}</span>
          </span>
        </button>
        <div v-else-if="recordingCard" class="show-rule is-static show-recording">
          <span :class="['show-rule-mark', 'is-' + recordingCard.tone]" aria-hidden="true"><span></span></span>
          <span class="show-rule-text">
            <span class="show-rule-headline">{{ recordingCard.headline }}</span>
            <span class="show-rule-detail">{{ recordingCard.detail }}</span>
          </span>
          <button v-if="cardFromStart" type="button" class="ui-button ui-button-sm" @click="watchFromStart(currentEpisode)">Watch from the start</button>
        </div>
        <div v-else class="show-rule is-static">
          <span :class="['show-rule-mark', 'is-' + ruleStatus.tone]" aria-hidden="true"><span></span></span>
          <span class="show-rule-text">
            <span class="show-rule-headline">{{ ruleStatus.headline }}</span>
            <span class="show-rule-detail">{{ ruleStatus.detail }}</span>
          </span>
          <a href="#/guide" class="ui-button ui-button-sm">TV guide</a>
        </div>

        <section v-if="show.seasons.length" ref="episodesSection" class="show-episodes" aria-labelledby="show-episodes-title">
          <div class="show-episodes-header">
            <h2 id="show-episodes-title" :class="['ui-section-title', { 'ui-visually-hidden': !seriesShow }]">{{ seriesShow ? 'Episodes' : 'Recordings' }}</h2>
            <template v-if="seasonChips">
              <div v-if="show.seasons.length > 1" class="ui-chip-row is-scroll show-seasons" role="group" aria-label="Season">
                <button v-for="s in show.seasons" :key="String(s.season)" type="button" class="ui-chip"
                  :aria-pressed="String(s.season === selectedSeason)" @click="selectedSeason = s.season">{{ seasonLabel(s.season, show.title) }}</button>
              </div>
              <div v-else class="show-seasons"><span class="ui-chip is-selected show-season-only">{{ seasonLabel(show.seasons[0].season, show.title) }}</span></div>
            </template>
            <button v-if="!selecting && anySelectable" type="button" class="show-select-button" @click="startSelecting">Select</button>
          </div>
          <ul class="show-episode-list">
            <li v-for="e in visibleEpisodes" :key="e.recordingId"
              :class="['show-episode', { 'is-failed': e.failed, 'is-scheduled': e.scheduled, 'is-playable': (isTappable(e) || e.scheduled) && !selecting, 'is-selected': selecting && selected.has(e.recordingId), 'is-locked': selecting && isLocked(e) }]"
              @click="onEpisodeRowClick(e)" @contextmenu="episodePress.onContextMenu($event, e)" @pointerdown="episodePress.onPointerDown($event, e)"
              @pointermove="episodePress.onPointerMove" @pointerup="episodePress.onPointerEnd" @pointercancel="episodePress.onPointerEnd"
              @pointerleave="episodePress.onPointerEnd">
              <button v-if="selecting" type="button" role="checkbox" :class="['show-episode-check', { 'is-on': selected.has(e.recordingId) }]"
                :aria-checked="String(selected.has(e.recordingId))" :aria-disabled="String(isLocked(e))"
                :aria-label="checkLabel(e)" @click.stop="toggleEpisode(e)">
                <menu-icon v-if="selected.has(e.recordingId)" name="check" />
              </button>
              <button v-if="isTappable(e) && !selecting" type="button" class="show-episode-thumb ui-art-fallback" :style="artStyle" @click.stop="openEpisode(e)"
                :aria-label="(e.inProgress ? 'Watch from the start: ' : 'Play ') + episodeHeading(e)">
                <img v-if="episodeImage(e) && !failedImages[e.recordingId]" :src="episodeImage(e)" alt="" loading="lazy" @error="markImageFailed(e)" />
                <span v-else class="ui-art-title">{{ title }}</span>
                <span class="show-episode-play" aria-hidden="true"><play-glyph /></span>
                <span v-if="recordedPercent(e) != null" class="ui-progress is-live show-episode-bar"><span class="ui-progress-fill" :style="{ width: recordedPercent(e) + '%' }"></span></span>
                <span v-else-if="!e.inProgress && e.watchedPercent" class="ui-progress show-episode-bar"><span class="ui-progress-fill" :style="{ width: e.watchedPercent + '%' }"></span></span>
              </button>
              <div v-else :class="['show-episode-thumb', 'ui-art-fallback', { 'is-unplayable': !selecting }]" :style="artStyle">
                <img v-if="episodeImage(e) && !failedImages[e.recordingId]" :src="episodeImage(e)" alt="" loading="lazy" @error="markImageFailed(e)" />
                <span v-else class="ui-art-title">{{ title }}</span>
                <span v-if="recordedPercent(e) != null" class="ui-progress is-live show-episode-bar"><span class="ui-progress-fill" :style="{ width: recordedPercent(e) + '%' }"></span></span>
                <span v-else-if="!e.inProgress && e.watchedPercent" class="ui-progress show-episode-bar"><span class="ui-progress-fill" :style="{ width: e.watchedPercent + '%' }"></span></span>
              </div>
              <div class="show-episode-text">
                <h3 class="show-episode-title">{{ episodeHeading(e) }} <span v-if="episodeBadge(e) === 'rec'" class="ui-live-badge"><span class="ui-live-dot"></span>Rec</span><span v-else-if="episodeBadge(e) === 'new'" class="ui-new-badge">New</span></h3>
                <p v-if="e.scheduled" class="show-episode-when"><span class="ui-chip is-small show-scheduled-chip">{{ scheduledWhen(e) }}</span></p>
                <p class="show-episode-meta"><meta-line :text="episodeMeta(e)" /></p>
                <p v-if="episodeLine(e)" class="show-episode-synopsis">{{ episodeLine(e) }}</p>
              </div>
              <button v-if="!selecting && !e.scheduled" type="button" class="ui-icon-button is-plain show-episode-more" :aria-label="'Actions for ' + episodeHeading(e)"
                aria-haspopup="dialog" @click.stop="openEpisodeMenu(e)"><more-glyph /></button>
            </li>
          </ul>
        </section>

        <section v-else class="ui-empty" aria-label="Episodes">
          <h2 class="ui-empty-title">No episodes yet</h2>
          <p class="ui-empty-text">{{ firstEpisodeLine }}</p>
        </section>

        <show-about :synopsis="aboutSynopsis" :review="ratingReview" />
        <show-cast :cast="castList" :crew="crewLines" />
      </div>

      <template v-if="selecting">
        <header class="show-select-bar">
          <button type="button" class="show-select-bar-button" @click="stopSelecting">Cancel</button>
          <span class="show-select-count" aria-live="polite">{{ selectionTitle(selected.size) }}</span>
          <button type="button" class="show-select-bar-button is-end" :disabled="!seasonSelectable" @click="selectSeason">{{ seasonAllSelected ? 'Deselect all' : 'Select all' }}</button>
        </header>
        <div class="show-select-actions" role="toolbar" :aria-label="selected.size ? 'Actions for ' + selectionTitle(selected.size) + ' episodes' : 'Actions'">
          <button type="button" :class="['show-select-action', { 'is-pending': pendingKey === 'select-watched' }]" :disabled="!selected.size || busy"
            :aria-busy="pendingKey === 'select-watched'" @click="markSelected(true)">
            <span v-if="pendingKey === 'select-watched'" class="spinner" aria-hidden="true"></span><menu-icon v-else name="check" />{{ pendingKey === 'select-watched' ? 'Marking…' : 'Mark watched' }}
          </button>
          <button type="button" :class="['show-select-action', { 'is-pending': pendingKey === 'select-unwatched' }]" :disabled="!selected.size || busy"
            :aria-busy="pendingKey === 'select-unwatched'" @click="markSelected(false)">
            <span v-if="pendingKey === 'select-unwatched'" class="spinner" aria-hidden="true"></span><menu-icon v-else name="unwatched" />{{ pendingKey === 'select-unwatched' ? 'Marking…' : 'Mark unwatched' }}
          </button>
          <button type="button" class="show-select-action is-danger" :disabled="!selected.size || busy" @click="deleteSelected"><menu-icon name="trash" />Delete</button>
        </div>
      </template>

      <library-menu-sheet :open="showMenuOpen" :title="title" :subtitle="showMenuSubtitle" :art-src="posterSrc" :art-title="title" art-shape="poster"
        :groups="showGroups" :busy="busy" :pending-key="pendingKey" @close="closeMenus" @choose="chooseShowAction" />

      <library-menu-sheet :open="Boolean(menuEpisode)" :title="menuEpisode ? episodeHeading(menuEpisode) : ''" :subtitle="menuEpisode ? episodeMeta(menuEpisode) : ''"
        :art-src="menuEpisode?.image || ''" :fallback-src="episodeFallbackSrc" :art-title="title" :groups="episodeGroups" :tip="menuEpisode?.inProgress ? '' : episodeTip" :busy="busy" :pending-key="pendingKey"
        @close="closeMenus" @choose="chooseEpisodeAction" />

      <library-info-sheet :open="Boolean(info)" :info="info" @close="info = null" />

      <move-to-show-sheet :request="moveRequest" :busy="busy" @close="closeMove" @move="moveToShow" />

      <artwork-picker :open="pictureOpen" :show="show" @close="closePicture" @changed="onPictureChanged" />

      <delete-confirm :request="deleteRequest" @cancel="cancelDelete" @done="onDeletedHere" />
      <action-confirm :request="actionRequest" @cancel="cancelAction" @done="onActionDone" />

      <recording-options-sheet v-if="show?.rule" :open="optionsOpen" :show="show" @close="optionsOpen = false"
        @changed="load" @stopped="onStopped" @flash="flash" />

    </div>
  `,
  setup() {
    const { showToast, showFlash: flash } = useLibraryToast()
    const { openUpcoming } = useProgrammeSheet()
    const key = computed(() => recordingsPageOf(routeParams.value).showKey || '')
    const show = ref(cachedDetails.get(key.value) || null)
    const loaded = ref(Boolean(show.value))
    const missing = ref(false)
    const error = ref('')
    const heroFailed = ref(false)
    const failedImages = ref({})
    const selectedSeason = ref(firstSeasonOf(show.value))
    const optionsOpen = ref(false)
    const selecting = ref(false)
    const selected = ref(new Set())
    const episodesSection = ref(null)

    const onEpisodeRowClick = (episode) => {
      if (selecting.value) return toggleEpisode(episode)
      if (episode.scheduled) return openUpcoming(episode.scheduled)
      if (isTappable(episode)) openEpisode(episode)
    }
    const backTarget = computed(() => backTargetOf({
      previousHash: cameFromHash.value,
      currentHash: window.location.hash,
      inHistory: cameFromHistory.value,
    }))
    const goBack = () => {
      if (backTarget.value.usesHistory) return history.back()
      navigate(backTarget.value.route)
    }

    const loads = createResponseOrder()
    const load = async () => {
      const requestedKey = key.value
      const ticket = loads.issue()
      const isStale = () => requestedKey !== key.value || !loads.accept(ticket)
      try {
        const detail = await api('GET', `/api/library/shows/${encodeURIComponent(requestedKey)}`)
        if (isStale()) return
        cachedDetails.set(requestedKey, detail)
        show.value = detail
        rememberShowStamps(detail)
        missing.value = false
        error.value = ''
        const seasons = detail.seasons.map((s) => s.season)
        if (!seasons.includes(selectedSeason.value)) selectedSeason.value = seasons[0]
      } catch (err) {
        if (isStale()) return
        if (err.status === 404) {
          cachedDetails.delete(requestedKey)
          missing.value = true
          show.value = null
        } else {
          error.value = err.message
        }
      } finally {
        if (requestedKey === key.value) loaded.value = true
      }
    }


    const actions = useLibraryActions({ show, reload: load, showToast, openOptions: () => { optionsOpen.value = true }, canMove: true })
    const { activeIds, artworkVersion } = actions

    const titleHint = computed(() => show.value?.title || titleHintFor(key.value))
    const title = computed(() => titleHint.value || (loaded.value ? titleFromKey(key.value) : ''))
    const heroStyle = computed(() => artFallbackStyle(titleHint.value))
    const artStyle = heroStyle
    const versionSuffix = computed(() => (artworkVersion.value ? `&v=${artworkVersion.value}` : ''))
    const heroSrc = computed(() => (show.value ? `${stampedShowImage(showImageUrlOf({ title: show.value.title, width: 768 }))}${versionSuffix.value}` : ''))
    const episodeFallbackSrc = computed(() => (show.value ? stampedShowImage(showImageUrlOf({ title: show.value.title, width: 384 })) : ''))
    const posterSrc = computed(() => (show.value ? `${stampedShowImage(`${show.value.poster}&w=192`)}${versionSuffix.value}` : ''))
    const heroMeta = computed(() => (show.value ? heroMetaOf({ show: show.value }) : ''))
    const playLabel = computed(() => (show.value ? playButtonLabel({ show: show.value }) : ''))
    const activeRecording = computed(() => activeRecordingFor({ active: recordingNow.value.active, key: key.value }))
    const ruleStatus = computed(() => ruleStatusOf({ show: show.value, activeRecording: activeRecording.value, timeZone: tz.value, nowMs: nowMs.value }))
    const hasShowActions = computed(() => Boolean(playLabel.value || show.value?.rule || allEpisodes.value.length))
    const shownRuleStatus = computed(() => (recordingCard.value && isRecordingPhase(currentItem.value)
      ? { ...ruleStatus.value, tone: 'live', headline: recordingCard.value.headline }
      : ruleStatus.value))
    const firstEpisodeLine = computed(() => firstEpisodeText({ nextAiring: show.value?.nextAiring, timeZone: tz.value }))
    const seriesShow = computed(() => isSeriesShow(show.value))
    const seasonChips = computed(() => Boolean(show.value) && showsSeasonChips(show.value))
    const visibleEpisodes = computed(() => listedEpisodesOf({ show: show.value, season: selectedSeason.value }))
    const programmeInfo = computed(() => (show.value
      ? { title: show.value.title, kind: show.value.kind === 'movie' ? 'movie' : '', year: show.value.year ?? null }
      : null))
    const { score: ratingScore, review: ratingReview, cardOpen: ratingCardOpen, loading: ratingLoading } = useProgrammeRatings(programmeInfo, { lateReviews: true })
    const { credits, answered: creditsAnswered } = useProgrammeCredits(programmeInfo)
    const castList = computed(() => shownCastOf(credits.value))
    const crewLines = computed(() => crewLinesOf(credits.value))
    const aboutSynopsis = ref('')
    const settleAboutSynopsis = () => {
      if (aboutSynopsis.value || !creditsAnswered.value) return
      aboutSynopsis.value = overviewOf(credits.value) || newestSynopsisOf(show.value)
    }
    const allEpisodes = computed(() => allEpisodesOf(show.value))
    const selectedEpisodes = computed(() => allEpisodes.value.filter((e) => selected.value.has(e.recordingId)))
    const seasonAllSelected = computed(() => allSelectedIn({ episodes: visibleEpisodes.value, selected: selected.value, activeIds: activeIds.value }))
    const seasonSelectable = computed(() => visibleEpisodes.value.some((e) => !isLocked(e)))
    const anySelectable = computed(() => allEpisodes.value.some((e) => !isLocked(e)))

    const playEpisode = (episode) => actions.play(episode)

    const nowMs = computed(() => now.value.getTime())
    const itemOf = (episode) => liveInProgressOf({ episode, active: recordingNow.value.active })
    const inProgressEpisodes = computed(() => allEpisodes.value.filter((e) => e.inProgress))
    const currentEpisode = computed(() => inProgressEpisodes.value.find((e) => isRecordingPhase(itemOf(e))) || inProgressEpisodes.value[0] || null)
    const currentItem = computed(() => (currentEpisode.value ? itemOf(currentEpisode.value) : null))
    const onlyInProgress = computed(() => allEpisodes.value.length > 0 && inProgressEpisodes.value.length === allEpisodes.value.length)
    const heroFromStart = computed(() => canWatchFromStart(currentItem.value) && !playLabel.value)
    const cardFromStart = computed(() => canWatchFromStart(currentItem.value) && !heroFromStart.value)
    const recordingCard = computed(() => (currentItem.value ? recordingCardOf({ item: currentItem.value, nowMs: nowMs.value, timeZone: tz.value }) : null))
    const shownHeroMeta = computed(() => (show.value && onlyInProgress.value && currentItem.value
      ? inProgressHeroMetaOf({ show: show.value, item: currentItem.value })
      : heroMeta.value))
    const isTappable = (episode) => (episode.inProgress ? canWatchFromStart(itemOf(episode)) : episode.playable)
    const openEpisode = (episode) => (episode.inProgress ? actions.watchFromStart(episode) : playEpisode(episode))
    const recordedPercent = (episode) => {
      const item = itemOf(episode)
      return isRecordingPhase(item) ? recordedPercentOf({ start: item.start, stop: item.stop, nowMs: nowMs.value }) : null
    }

    const playNext = () => {
      const episode = episodeById({ show: show.value, recordingId: show.value.resumeNext?.recordingId })
      if (episode) playEpisode(episode)
    }

    const isLocked = (episode) => Boolean(episode.scheduled) || isRecordingNow({ episode, activeIds: activeIds.value })
    const checkLabel = (episode) => (isLocked(episode)
      ? `${episodeHeading(episode)} is recording now, so it cannot be selected`
      : `Select ${episodeHeading(episode)}`)

    const startSelecting = async () => {
      selected.value = new Set()
      selecting.value = true
      await nextTick()
      episodesSection.value?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
    }
    const stopSelecting = () => {
      selecting.value = false
      selected.value = new Set()
    }
    const toggleEpisode = (episode) => {
      if (isLocked(episode)) return
      selected.value = toggledSelection({ selected: selected.value, recordingId: episode.recordingId })
    }
    const selectSeason = () => {
      selected.value = selectAllIn({ episodes: visibleEpisodes.value, selected: selected.value, activeIds: activeIds.value })
    }
    const markSelected = async (watched) => {
      await actions.runPending(watched ? 'select-watched' : 'select-unwatched', () => actions.setEpisodesWatched(selectedEpisodes.value, watched))
      stopSelecting()
    }
    const deleteSelected = () => actions.askDelete({ variant: 'selected', list: selectedEpisodes.value })
    const onDeletedHere = async (outcome) => {
      if (selecting.value) stopSelecting()
      await actions.onDeleted(outcome)
    }

    const episodePress = useLongPress((episode) => {
      if (!selecting.value) actions.openEpisodeMenu(episode)
    })

    const onSelectKeydown = (event) => {
      if (event.key !== 'Escape' || overlayStack.size() > 0) return
      if (ratingCardOpen.value) ratingCardOpen.value = false
      else if (selecting.value) stopSelecting()
    }

    const onStopped = async (message) => {
      optionsOpen.value = false
      showToast({ title: message })
      await load()
    }

    const markImageFailed = (episode) => {
      failedImages.value = { ...failedImages.value, [episode.recordingId]: true }
    }

    onMounted(() => {
      load()
      window.addEventListener('keydown', onSelectKeydown)
    })
    onUnmounted(() => {
      window.removeEventListener('keydown', onSelectKeydown)
      document.body.classList.remove('library-selecting')
    })
    watch([credits, creditsAnswered, show], settleAboutSynopsis)
    watch(selecting, (on) => document.body.classList.toggle('library-selecting', on))
    watch(heroSrc, () => { heroFailed.value = false })
    watch(key, () => {
      show.value = cachedDetails.get(key.value) || null
      loaded.value = Boolean(show.value)
      selectedSeason.value = firstSeasonOf(show.value)
      missing.value = false
      error.value = ''
      heroFailed.value = false
      aboutSynopsis.value = ''
      stopSelecting()
      load()
    })
    watch([allEpisodes, activeIds], () => {
      selected.value = prunedSelection({ selected: selected.value, episodes: allEpisodes.value, activeIds: activeIds.value })
    })
    watch(() => playback.open, (open, wasOpen) => {
      if (wasOpen && !open) load()
    })
    watch(recordingChangeTick, load)
    watch(recordingSetKey, (current, previous) => {
      if (current !== previous) load()
    })
    watch(() => syncStatus.value.activeSyncId, (current, previous) => {
      if (previous && !current) load()
    })

    return {
      ...actions,
      show, loaded, missing, error, title, heroStyle, artStyle, heroSrc, posterSrc, heroFailed, heroMeta, playLabel,
      ruleStatus, shownRuleStatus, firstEpisodeLine, currentEpisode, heroFromStart, cardFromStart, recordingCard, shownHeroMeta,
      isTappable, openEpisode, recordedPercent, hasShowActions, visibleEpisodes, selectedSeason, seriesShow, seasonChips, optionsOpen, failedImages,
      flash, selecting, selected, episodesSection, seasonAllSelected, seasonSelectable, anySelectable,
      backTarget, goBack, onEpisodeRowClick, load, playEpisode, playNext, onStopped, markImageFailed,
      startSelecting, stopSelecting, toggleEpisode, selectSeason, markSelected, deleteSelected, onDeletedHere,
      episodePress, isLocked, checkLabel, isRecordingNow, selectionTitle,
      episodeHeading, seasonLabel, ratingScore, ratingReview, ratingCardOpen, ratingLoading, aboutSynopsis, castList, crewLines,
      episodeMeta: (episode) => (episode.inProgress
        ? inProgressEpisodeMetaOf({ episode, item: itemOf(episode), nowMs: nowMs.value, timeZone: tz.value })
        : episodeMetaOf({ episode, timeZone: tz.value })),
      episodeLine: (episode) => (episode.inProgress ? inProgressEpisodeLineOf({ item: itemOf(episode), timeZone: tz.value }) : episode.synopsis),
      episodeBadge: (episode) => episodeBadgeOf({ episode, activeIds: activeIds.value }),
      episodeFallbackSrc,
      scheduledWhen: (episode) => scheduledWhenOf({ ms: episode.airedAt, nowMs: nowMs.value, timeZone: tz.value }),
      episodeImage: (episode) => episode.image || episodeFallbackSrc.value,
    }
  },
}

const rememberShowStamps = (detail) => ['background', 'poster'].forEach((kind) =>
  rememberArtworkStamp({ key: detail.key, kind, stamp: detail.artworkStamps?.[kind] ?? null }))

const cachedDetails = new Map()

const firstSeasonOf = (detail) => detail?.seasons[0]?.season

const titleHintFor = (key) => knownShowTitleOf(key) || showTitleIn({ key, shows: homeCachedShows() })

const homeCachedShows = () => readHomeCache({ storage: browserStorage(), build: loadedBuild || 'dev' })?.shows ?? []
