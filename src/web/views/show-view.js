import { ref, computed, onMounted, onUnmounted, watch } from '/vendor/vue.esm-browser.prod.js'
import { artFallbackStyle } from '/art-fallback.js'
import { clearRowConfirm, removeFromTvhConfirm } from '/recording-confirm.js'
import { recordingsPageOf } from '/route-table.js'
import {
  activeRecordingFor,
  episodeActionsOf,
  episodeById,
  episodeHeading,
  episodeMetaOf,
  heroMetaOf,
  playButtonLabel,
  recordingRowOf,
  ruleStatusOf,
  seasonLabel,
} from '/show-page.js'
import { firstEpisodeText } from '/library-shelves.js'
import { useConfirm } from '/components/dialogs.js'
import { RecordingOptionsSheet } from '/components/recording-options-sheet.js'
import { api } from '/shared/api.js'
import { useFlash, FLASH_DEFAULT_MS } from '/shared/composables.js'
import { playRecording } from '/shared/playback-session.js'
import { playback } from '/shared/player-shared.js'
import { recordingNow, recordingChangeTick } from '/shared/recording-now.js'
import { routeParams, cameFromHash, navigate } from '/shared/router.js'
import { backTargetOf } from '/back-target.js'
import { syncStatus } from '/shared/sync-status.js'
import { tz } from '/shared/time.js'

const UNDO_WINDOW_MS = 10_000

export const ShowView = {
  components: { RecordingOptionsSheet },
  template: `
    <div class="ui-page show-page">
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
        <div v-if="playLabel || show.rule" class="show-actions ui-only-phone">
          <button v-if="playLabel" type="button" class="ui-button ui-button-primary" @click="playNext"><play-glyph /> {{ playLabel }}</button>
          <button v-if="show.rule" type="button" class="ui-button ui-button-secondary show-options-button" @click="optionsOpen = true"><sliders-icon /> Recording options</button>
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

        <section v-if="show.seasons.length" class="show-episodes" aria-labelledby="show-episodes-title">
          <div class="show-episodes-header">
            <h2 id="show-episodes-title" class="ui-section-title">Episodes</h2>
            <div v-if="show.seasons.length > 1" class="ui-chip-row is-scroll show-seasons" role="group" aria-label="Season">
              <button v-for="s in show.seasons" :key="String(s.season)" type="button" class="ui-chip"
                :aria-pressed="String(s.season === selectedSeason)" @click="selectedSeason = s.season">{{ seasonLabel(s.season) }}</button>
            </div>
            <span v-else class="ui-chip is-selected show-season-only">{{ seasonLabel(show.seasons[0].season) }}</span>
          </div>
          <ul class="show-episode-list">
            <li v-for="e in visibleEpisodes" :key="e.recordingId" :class="['show-episode', { 'is-failed': e.failed }]">
              <button v-if="e.playable" type="button" class="show-episode-thumb ui-art-fallback" :style="artStyle" @click="playEpisode(e)"
                :aria-label="'Play ' + episodeHeading(e)">
                <img v-if="episodeImage(e) && !failedImages[e.recordingId]" :src="episodeImage(e)" alt="" loading="lazy" @error="markImageFailed(e)" />
                <span v-else class="ui-art-title">{{ title }}</span>
                <span class="show-episode-play" aria-hidden="true"><play-glyph /></span>
                <span v-if="e.watchedPercent" class="ui-progress show-episode-bar"><span class="ui-progress-fill" :style="{ width: e.watchedPercent + '%' }"></span></span>
              </button>
              <div v-else class="show-episode-thumb ui-art-fallback is-unplayable" :style="artStyle">
                <img v-if="episodeImage(e) && !failedImages[e.recordingId]" :src="episodeImage(e)" alt="" loading="lazy" @error="markImageFailed(e)" />
                <span v-else class="ui-art-title">{{ title }}</span>
              </div>
              <div class="show-episode-text">
                <h3 class="show-episode-title">{{ episodeHeading(e) }} <span v-if="e.new" class="ui-new-badge">New</span></h3>
                <p class="show-episode-meta">{{ episodeMeta(e) }}</p>
                <p v-if="e.synopsis" class="show-episode-synopsis">{{ e.synopsis }}</p>
              </div>
              <button type="button" class="ui-icon-button is-plain show-episode-more" :aria-label="'Actions for ' + episodeHeading(e)"
                aria-haspopup="dialog" @click="openActions(e)"><more-glyph /></button>
            </li>
          </ul>
        </section>

        <section v-else class="ui-empty" aria-label="Episodes">
          <h2 class="ui-empty-title">No episodes yet</h2>
          <p class="ui-empty-text">{{ firstEpisodeLine }}</p>
        </section>
      </div>

      <ui-sheet :open="Boolean(actionsFor)" :title="actionsFor ? episodeHeading(actionsFor) : ''" :subtitle="actionsFor ? episodeMeta(actionsFor) : ''" @close="actionsFor = null">
        <div v-if="actionsFor" class="ui-group show-action-group">
          <button v-for="action in episodeActionsOf(actionsFor)" :key="action.key" type="button"
            :class="['ui-group-row', 'show-action', { 'is-danger': action.danger }]" :disabled="busyId === actionsFor.recordingId"
            @click="runAction(action.key, actionsFor)">{{ action.label }}</button>
        </div>
        <template #footer>
          <button type="button" class="ui-button ui-button-block" @click="actionsFor = null">Cancel</button>
        </template>
      </ui-sheet>

      <recording-options-sheet v-if="show?.rule" :open="optionsOpen" :show="show" @close="optionsOpen = false"
        @changed="load" @stopped="onStopped" @flash="flash" />

      <confirm-dialog :open="Boolean(confirming)" :dialog="confirming?.dialog" :icon="confirming?.icon"
        :busy="confirmBusy" @confirm="runConfirmed" @cancel="closeConfirm" />

      <div class="ui-toast-region" aria-live="polite">
        <div v-if="flashText" :class="['ui-toast', 'show-toast', { 'is-error': flashKind === 'err' }]">
          <span>{{ flashText }}</span>
          <button v-if="undoIds.length" type="button" class="show-toast-action" @click="undoClear">Undo</button>
        </div>
      </div>
    </div>
  `,
  setup() {
    const { flashText, flashKind, flash } = useFlash()
    const { confirming, confirmBusy, askConfirm, closeConfirm, runConfirmed } = useConfirm()
    const key = computed(() => recordingsPageOf(routeParams.value).showKey || '')
    const show = ref(null)
    const loaded = ref(false)
    const missing = ref(false)
    const error = ref('')
    const heroFailed = ref(false)
    const failedImages = ref({})
    const selectedSeason = ref(undefined)
    const actionsFor = ref(null)
    const optionsOpen = ref(false)
    const busyId = ref(null)
    const undoIds = ref([])

    const backTarget = computed(() => backTargetOf({
      previousHash: cameFromHash.value,
      currentHash: window.location.hash,
    }))
    const goBack = () => {
      if (backTarget.value.usesHistory) return history.back()
      navigate(backTarget.value.route)
    }

    const title = computed(() => show.value?.title || titleFromKey(key.value))
    const heroStyle = computed(() => artFallbackStyle(title.value))
    const artStyle = heroStyle
    const heroSrc = computed(() => (show.value ? `/api/epg/show-image?title=${encodeURIComponent(show.value.title)}&w=768` : ''))
    const heroMeta = computed(() => (show.value ? heroMetaOf({ show: show.value }) : ''))
    const playLabel = computed(() => (show.value ? playButtonLabel({ show: show.value }) : ''))
    const activeRecording = computed(() => activeRecordingFor({ active: recordingNow.value.active, key: key.value }))
    const ruleStatus = computed(() => ruleStatusOf({ show: show.value, activeRecording: activeRecording.value, timeZone: tz.value }))
    const firstEpisodeLine = computed(() => firstEpisodeText({ nextAiring: show.value?.nextAiring, timeZone: tz.value }))
    const visibleEpisodes = computed(() => {
      const seasons = show.value?.seasons || []
      return (seasons.find((s) => s.season === selectedSeason.value) || seasons[0])?.episodes || []
    })

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

    const playEpisode = (episode) => playRecording(recordingRowOf(episode))

    const playNext = () => {
      const episode = episodeById({ show: show.value, recordingId: show.value.resumeNext?.recordingId })
      if (episode) playEpisode(episode)
    }

    const openActions = (episode) => { actionsFor.value = episode }

    const setWatched = async (episode, watched) => {
      busyId.value = episode.recordingId
      try {
        await api('POST', `/api/recordings/${encodeURIComponent(episode.recordingId)}/watched`, { watched })
        flash({ msg: watched ? `Marked "${episodeHeading(episode)}" as watched.` : `Marked "${episodeHeading(episode)}" as unwatched.` })
        await load()
      } catch (err) {
        flash({ msg: `Could not change watched: ${err.message}`, kind: 'err', ms: 6000 })
      } finally {
        busyId.value = null
      }
    }

    const importEpisode = async (episode) => {
      busyId.value = episode.recordingId
      try {
        await api('POST', `/api/recordings/${encodeURIComponent(episode.recordingId)}/library`, { choice: 'include' })
        flash({ msg: `Importing "${episodeHeading(episode)}".` })
        await load()
      } catch (err) {
        flash({ msg: `Import failed: ${err.message}`, kind: 'err', ms: 6000 })
      } finally {
        busyId.value = null
      }
    }

    const removeFromTvh = async (episode) => {
      try {
        const result = await api('POST', `/api/recordings/${encodeURIComponent(episode.recordingId)}/delete-from-tvh`)
        if (!result.ok) throw new Error(result.error)
        flash({ msg: `Removed "${episodeHeading(episode)}" from TVHeadend.` })
        await load()
      } catch (err) {
        flash({ msg: `TVHeadend remove failed: ${err.message}`, kind: 'err', ms: 8000 })
      }
    }

    const clearRow = async (episode) => {
      try {
        await api('DELETE', `/api/recordings/${encodeURIComponent(episode.recordingId)}`)
        const undoable = Boolean(episode.deletedFromTvhAt)
        flash({ msg: `Cleared "${episodeHeading(episode)}" from the list.`, ms: undoable ? UNDO_WINDOW_MS : FLASH_DEFAULT_MS })
        if (undoable) offerUndo([episode.recordingId])
        await load()
      } catch (err) {
        flash({ msg: `Clear failed: ${err.message}`, kind: 'err', ms: 6000 })
      }
    }

    let undoTimer = null
    const offerUndo = (ids) => {
      clearTimeout(undoTimer)
      undoIds.value = ids
      undoTimer = setTimeout(() => (undoIds.value = []), UNDO_WINDOW_MS)
    }

    const undoClear = async () => {
      try {
        await api('POST', '/api/recordings/restore', { ids: undoIds.value })
        offerUndo([])
        flash({ msg: 'Put the episode back.' })
        await load()
      } catch (err) {
        flash({ msg: `Undo failed: ${err.message}`, kind: 'err', ms: 6000 })
      }
    }

    const runAction = (actionKey, episode) => {
      actionsFor.value = null
      if (actionKey === 'watched') return setWatched(episode, true)
      if (actionKey === 'unwatched') return setWatched(episode, false)
      if (actionKey === 'import') return importEpisode(episode)
      if (actionKey === 'remove-from-tvh') {
        return askConfirm({
          dialog: removeFromTvhConfirm({ recording: recordingRowOf(episode) }),
          icon: 'trash-icon',
          run: () => removeFromTvh(episode),
        })
      }
      if (actionKey === 'clear') {
        return askConfirm({
          dialog: clearRowConfirm({ recording: recordingRowOf(episode), undoSeconds: UNDO_WINDOW_MS / 1000 }),
          icon: 'trash-icon',
          run: () => clearRow(episode),
        })
      }
    }

    const onStopped = async (message) => {
      optionsOpen.value = false
      flash({ msg: message })
      await load()
    }

    const markImageFailed = (episode) => {
      failedImages.value = { ...failedImages.value, [episode.recordingId]: true }
    }

    onMounted(load)
    onUnmounted(() => clearTimeout(undoTimer))
    watch(key, () => {
      loaded.value = false
      show.value = null
      heroFailed.value = false
      load()
    })
    watch(() => playback.open, (open, wasOpen) => {
      if (wasOpen && !open) load()
    })
    watch(recordingChangeTick, load)
    watch(() => syncStatus.value.activeSyncId, (current, previous) => {
      if (previous && !current) load()
    })

    return {
      show, loaded, missing, error, title, heroStyle, artStyle, heroSrc, heroFailed, heroMeta, playLabel,
      ruleStatus, firstEpisodeLine, visibleEpisodes, selectedSeason, actionsFor, optionsOpen, busyId, failedImages,
      undoIds, flashText, flashKind, flash, confirming, confirmBusy, closeConfirm, runConfirmed,
      backTarget, goBack, load, playEpisode, playNext, openActions, runAction, undoClear, onStopped, markImageFailed,
      episodeHeading, episodeActionsOf, seasonLabel,
      episodeMeta: (episode) => episodeMetaOf({ episode, timeZone: tz.value }),
      episodeImage: (episode) => episode.image,
    }
  },
}

const titleFromKey = (key) => key.replace(/-/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase())
