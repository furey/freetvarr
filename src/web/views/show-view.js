import { ref, computed, nextTick, onMounted, onUnmounted, watch } from '/vendor/vue.esm-browser.prod.js'
import { artFallbackStyle } from '/art-fallback.js'
import { recordingsPageOf } from '/route-table.js'
import {
  activeRecordingFor,
  episodeById,
  episodeHeading,
  episodeMetaOf,
  heroMetaOf,
  playButtonLabel,
  ruleStatusOf,
  seasonLabel,
} from '/show-page.js'
import { firstEpisodeText } from '/library-shelves.js'
import {
  allSelectedIn,
  isRecordingNow,
  prunedSelection,
  selectAllIn,
  selectionTitle,
  toggledSelection,
} from '/library-menus.js'
import { useLibraryActions } from '/components/library-actions.js'
import { DeleteConfirm, LibraryInfoSheet, LibraryMenuSheet, MenuIcon, useLibraryToast } from '/components/library-menus.js'
import { RecordingOptionsSheet } from '/components/recording-options-sheet.js'
import { api } from '/shared/api.js'
import { overlayStack } from '/overlay-stack.js'
import { playback } from '/shared/player-shared.js'
import { recordingNow, recordingChangeTick } from '/shared/recording-now.js'
import { routeParams, cameFromHash, navigate } from '/shared/router.js'
import { backTargetOf } from '/back-target.js'
import { syncStatus } from '/shared/sync-status.js'
import { tz } from '/shared/time.js'

export const ShowView = {
  components: { RecordingOptionsSheet, LibraryMenuSheet, LibraryInfoSheet, DeleteConfirm, MenuIcon },
  template: `
    <div :class="['ui-page', 'show-page', { 'is-selecting': selecting }]">
      <section class="show-hero ui-art-fallback" :style="heroStyle" :aria-label="title">
        <img v-if="heroSrc && !heroFailed" class="show-hero-art" :src="heroSrc" alt="" @error="heroFailed = true" />
        <span class="show-hero-scrim"></span>
        <a :href="backTarget.route" class="show-back" @click.prevent="goBack"><back-glyph /> {{ backTarget.label }}</a>
        <div class="show-hero-body">
          <h1 class="show-title">{{ title }}</h1>
          <p v-if="heroMeta" class="show-hero-meta">{{ heroMeta }}</p>
          <div v-if="show" class="show-actions ui-only-wide">
            <button v-if="playLabel" type="button" class="ui-button ui-button-primary" @click="playNext"><play-glyph /> {{ playLabel }}</button>
            <button v-if="show.rule" type="button" class="ui-button ui-button-secondary show-options-button" @click="optionsOpen = true"><sliders-icon /> Recording options</button>
            <button type="button" class="ui-icon-button show-more-button" :aria-label="'More actions for ' + title" aria-haspopup="dialog" @click="openShowMenu"><more-glyph /></button>
          </div>
        </div>
      </section>

      <div v-if="!loaded" class="show-body" aria-busy="true">
        <span class="ui-skeleton is-row show-skeleton-status"></span>
        <span v-for="n in 3" :key="n" class="ui-skeleton is-row show-skeleton-row"></span>
      </div>

      <section v-else-if="missing" class="ui-empty show-missing" aria-label="Show not found">
        <h2 class="ui-empty-title">This show is not in your library</h2>
        <p class="ui-empty-text">It may have been removed, or the link is out of date.</p>
        <a :href="backTarget.route" class="ui-button" @click.prevent="goBack">{{ backTarget.label === 'Back' ? 'Back' : 'Back to ' + backTarget.label }}</a>
      </section>

      <p v-else-if="error && !show" class="ui-banner is-error" role="alert">Cannot load this show: {{ error }}</p>

      <div v-else-if="show" class="show-body">
        <div class="show-actions ui-only-phone">
          <button v-if="playLabel" type="button" class="ui-button ui-button-primary" @click="playNext"><play-glyph /> {{ playLabel }}</button>
          <button v-if="show.rule" type="button" class="ui-button ui-button-secondary show-options-button" @click="optionsOpen = true"><sliders-icon /> Recording options</button>
          <button type="button" class="ui-icon-button show-more-button" :aria-label="'More actions for ' + title" aria-haspopup="dialog" @click="openShowMenu"><more-glyph /></button>
        </div>

        <button v-if="show.rule" type="button" class="show-rule" @click="optionsOpen = true" aria-haspopup="dialog">
          <span :class="['show-rule-mark', 'is-' + ruleStatus.tone]" aria-hidden="true"><span></span></span>
          <span class="show-rule-text">
            <span class="show-rule-headline">{{ ruleStatus.headline }}</span>
            <span class="show-rule-detail">{{ ruleStatus.detail }}</span>
          </span>
          <chevron-glyph class="ui-group-row-chevron" />
        </button>
        <div v-else class="show-rule is-static">
          <span class="show-rule-mark is-idle" aria-hidden="true"><span></span></span>
          <span class="show-rule-text">
            <span class="show-rule-headline">{{ ruleStatus.headline }}</span>
            <span class="show-rule-detail">{{ ruleStatus.detail }}</span>
          </span>
          <a href="#/guide" class="ui-button ui-button-sm">Guide</a>
        </div>

        <section v-if="show.seasons.length" ref="episodesSection" class="show-episodes" aria-labelledby="show-episodes-title">
          <div class="show-episodes-header">
            <h2 id="show-episodes-title" class="ui-section-title">Episodes</h2>
            <div v-if="show.seasons.length > 1" class="ui-chip-row is-scroll show-seasons" role="group" aria-label="Season">
              <button v-for="s in show.seasons" :key="String(s.season)" type="button" class="ui-chip"
                :aria-pressed="String(s.season === selectedSeason)" @click="selectedSeason = s.season">{{ seasonLabel(s.season) }}</button>
            </div>
            <div v-else class="show-seasons"><span class="ui-chip is-selected show-season-only">{{ seasonLabel(show.seasons[0].season) }}</span></div>
            <button v-if="!selecting" type="button" class="show-select-button" @click="startSelecting">Select</button>
          </div>
          <ul class="show-episode-list">
            <li v-for="e in visibleEpisodes" :key="e.recordingId"
              :class="['show-episode', { 'is-failed': e.failed, 'is-playable': e.playable && !selecting, 'is-selected': selecting && selected.has(e.recordingId), 'is-locked': selecting && isLocked(e) }]"
              @click="onEpisodeRowClick(e)" @contextmenu="onEpisodeHold($event, e)">
              <button v-if="selecting" type="button" role="checkbox" :class="['show-episode-check', { 'is-on': selected.has(e.recordingId) }]"
                :aria-checked="String(selected.has(e.recordingId))" :aria-disabled="String(isLocked(e))"
                :aria-label="checkLabel(e)" @click.stop="toggleEpisode(e)">
                <menu-icon v-if="selected.has(e.recordingId)" name="check" />
              </button>
              <button v-if="e.playable && !selecting" type="button" class="show-episode-thumb ui-art-fallback" :style="artStyle" @click.stop="playEpisode(e)"
                :aria-label="'Play ' + episodeHeading(e)">
                <img v-if="episodeImage(e) && !failedImages[e.recordingId]" :src="episodeImage(e)" alt="" loading="lazy" @error="markImageFailed(e)" />
                <span v-else class="ui-art-title">{{ title }}</span>
                <span class="show-episode-play" aria-hidden="true"><play-glyph /></span>
                <span v-if="e.watchedPercent" class="ui-progress show-episode-bar"><span class="ui-progress-fill" :style="{ width: e.watchedPercent + '%' }"></span></span>
              </button>
              <div v-else :class="['show-episode-thumb', 'ui-art-fallback', { 'is-unplayable': !selecting }]" :style="artStyle">
                <img v-if="episodeImage(e) && !failedImages[e.recordingId]" :src="episodeImage(e)" alt="" loading="lazy" @error="markImageFailed(e)" />
                <span v-else class="ui-art-title">{{ title }}</span>
                <span v-if="e.watchedPercent" class="ui-progress show-episode-bar"><span class="ui-progress-fill" :style="{ width: e.watchedPercent + '%' }"></span></span>
              </div>
              <div class="show-episode-text">
                <h3 class="show-episode-title">{{ episodeHeading(e) }} <span v-if="isRecordingNow({ episode: e, activeIds })" class="ui-live-badge"><span class="ui-live-dot"></span>Rec</span><span v-else-if="e.new" class="ui-new-badge">New</span></h3>
                <p class="show-episode-meta">{{ episodeMeta(e) }}</p>
                <p v-if="e.synopsis" class="show-episode-synopsis">{{ e.synopsis }}</p>
              </div>
              <button v-if="!selecting" type="button" class="ui-icon-button is-plain show-episode-more" :aria-label="'Actions for ' + episodeHeading(e)"
                aria-haspopup="dialog" @click.stop="openEpisodeMenu(e)"><more-glyph /></button>
            </li>
          </ul>
        </section>

        <section v-else class="ui-empty" aria-label="Episodes">
          <h2 class="ui-empty-title">No episodes yet</h2>
          <p class="ui-empty-text">{{ firstEpisodeLine }}</p>
        </section>
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

      <library-menu-sheet :open="showMenuOpen" :title="title" :subtitle="showMenuSubtitle" :art-src="posterSrc" art-shape="poster"
        :groups="showGroups" :busy="busy" :pending-key="pendingKey" @close="closeMenus" @choose="chooseShowAction" />

      <library-menu-sheet :open="Boolean(menuEpisode)" :title="menuEpisode ? episodeHeading(menuEpisode) : ''" :subtitle="menuEpisode ? episodeMeta(menuEpisode) : ''"
        :art-src="menuEpisode ? episodeImage(menuEpisode) || '' : ''" :groups="episodeGroups" :tip="episodeTip" :busy="busy" :pending-key="pendingKey"
        @close="closeMenus" @choose="chooseEpisodeAction" />

      <library-info-sheet :open="Boolean(info)" :info="info" @close="info = null" />

      <delete-confirm :request="deleteRequest" @cancel="cancelDelete" @done="onDeletedHere" />

      <recording-options-sheet v-if="show?.rule" :open="optionsOpen" :show="show" @close="optionsOpen = false"
        @changed="load" @stopped="onStopped" @flash="flash" />

    </div>
  `,
  setup() {
    const { showToast } = useLibraryToast()
    const key = computed(() => recordingsPageOf(routeParams.value).showKey || '')
    const show = ref(null)
    const loaded = ref(false)
    const missing = ref(false)
    const error = ref('')
    const heroFailed = ref(false)
    const failedImages = ref({})
    const selectedSeason = ref(undefined)
    const optionsOpen = ref(false)
    const selecting = ref(false)
    const selected = ref(new Set())
    const episodesSection = ref(null)

    const onEpisodeRowClick = (episode) => {
      if (selecting.value) return toggleEpisode(episode)
      if (episode.playable) playEpisode(episode)
    }
    const backTarget = computed(() => backTargetOf({
      previousHash: cameFromHash.value,
      currentHash: window.location.hash,
    }))
    const goBack = () => {
      if (backTarget.value.usesHistory) return history.back()
      navigate(backTarget.value.route)
    }

    const load = async () => {
      try {
        const detail = await api('GET', `/api/library/shows/${encodeURIComponent(key.value)}`)
        show.value = detail
        missing.value = false
        error.value = ''
        const seasons = detail.seasons.map((s) => s.season)
        if (!seasons.includes(selectedSeason.value)) selectedSeason.value = seasons[0]
      } catch (err) {
        if (err.status === 404) {
          missing.value = true
          show.value = null
        } else {
          error.value = err.message
        }
      } finally {
        loaded.value = true
      }
    }

    const flash = ({ msg, kind = 'ok' }) => showToast({ kind: kind === 'err' ? 'error' : 'ok', title: msg })

    const actions = useLibraryActions({ show, reload: load, showToast, openOptions: () => { optionsOpen.value = true } })
    const { activeIds, artworkVersion } = actions

    const title = computed(() => show.value?.title || titleFromKey(key.value))
    const heroStyle = computed(() => artFallbackStyle(title.value))
    const artStyle = heroStyle
    const versionSuffix = computed(() => (artworkVersion.value ? `&v=${artworkVersion.value}` : ''))
    const heroSrc = computed(() => (show.value ? `/api/epg/show-image?title=${encodeURIComponent(show.value.title)}&w=768${versionSuffix.value}` : ''))
    const posterSrc = computed(() => (show.value ? `${show.value.poster}&w=192${versionSuffix.value}` : ''))
    const heroMeta = computed(() => (show.value ? heroMetaOf({ show: show.value }) : ''))
    const playLabel = computed(() => (show.value ? playButtonLabel({ show: show.value }) : ''))
    const activeRecording = computed(() => activeRecordingFor({ active: recordingNow.value.active, key: key.value }))
    const ruleStatus = computed(() => ruleStatusOf({ show: show.value, activeRecording: activeRecording.value, timeZone: tz.value }))
    const firstEpisodeLine = computed(() => firstEpisodeText({ nextAiring: show.value?.nextAiring, timeZone: tz.value }))
    const visibleEpisodes = computed(() => {
      const seasons = show.value?.seasons || []
      return (seasons.find((s) => s.season === selectedSeason.value) || seasons[0])?.episodes || []
    })
    const allEpisodes = computed(() => (show.value?.seasons || []).flatMap((s) => s.episodes))
    const selectedEpisodes = computed(() => allEpisodes.value.filter((e) => selected.value.has(e.recordingId)))
    const seasonAllSelected = computed(() => allSelectedIn({ episodes: visibleEpisodes.value, selected: selected.value, activeIds: activeIds.value }))
    const seasonSelectable = computed(() => visibleEpisodes.value.some((e) => !isRecordingNow({ episode: e, activeIds: activeIds.value })))

    const playEpisode = (episode) => actions.play(episode)

    const playNext = () => {
      const episode = episodeById({ show: show.value, recordingId: show.value.resumeNext?.recordingId })
      if (episode) playEpisode(episode)
    }

    const isLocked = (episode) => isRecordingNow({ episode, activeIds: activeIds.value })
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

    const onEpisodeHold = (event, episode) => {
      if (selecting.value) return
      event.preventDefault()
      actions.openEpisodeMenu(episode)
    }

    const onSelectKeydown = (event) => {
      if (event.key === 'Escape' && selecting.value && overlayStack.size() === 0) stopSelecting()
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
    watch(selecting, (on) => document.body.classList.toggle('library-selecting', on))
    watch(key, () => {
      loaded.value = false
      show.value = null
      heroFailed.value = false
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
    watch(() => syncStatus.value.activeSyncId, (current, previous) => {
      if (previous && !current) load()
    })

    return {
      ...actions,
      show, loaded, missing, error, title, heroStyle, artStyle, heroSrc, posterSrc, heroFailed, heroMeta, playLabel,
      ruleStatus, firstEpisodeLine, visibleEpisodes, selectedSeason, optionsOpen, failedImages,
      flash, selecting, selected, episodesSection, seasonAllSelected, seasonSelectable,
      backTarget, goBack, onEpisodeRowClick, load, playEpisode, playNext, onStopped, markImageFailed,
      startSelecting, stopSelecting, toggleEpisode, selectSeason, markSelected, deleteSelected, onDeletedHere,
      onEpisodeHold, isLocked, checkLabel, isRecordingNow, selectionTitle,
      episodeHeading, seasonLabel,
      episodeMeta: (episode) => episodeMetaOf({ episode, timeZone: tz.value }),
      episodeImage: (episode) => episode.image,
    }
  },
}

const titleFromKey = (key) => key.replace(/-/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase())
