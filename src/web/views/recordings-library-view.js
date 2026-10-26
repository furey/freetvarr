import { ref, shallowRef, computed, onMounted, onUnmounted, watch } from '/vendor/vue.esm-browser.prod.js'
import { useLibraryActions } from '/components/library-actions.js'
import { ActionConfirm, DeleteConfirm, LibraryInfoSheet, LibraryMenuSheet, useLibraryToast } from '/components/library-menus.js'
import { MoveToShowSheet } from '/components/move-to-show-sheet.js'
import { RecordingOptionsSheet } from '/components/recording-options-sheet.js'
import { ArtworkPicker } from '/components/artwork-picker.js'
import {
  LIBRARY_SORTS,
  failedRecordingsOf,
  failureBannerOf,
  movieMetaOf,
  oneOffMetaOf,
  posterMetaOf,
  shelvesOf,
  showsCountText,
} from '/library-shelves.js'
import { diagnoseRecordingError } from '/recording-error.js'
import { scheduledCountOfState } from '/scheduled-groups.js'
import { showHrefOf } from '/show-key.js'
import { api } from '/shared/api.js'
import { useLongPress } from '/shared/long-press.js'
import { recordingNow, recordingChangeTick, recordingSetKey } from '/shared/recording-now.js'
import { inProgressCardMetaOf, isRecordingPhase, recordedPercentOf } from '/in-progress-display.js'
import { storedChoice, storedFlag } from '/shared/storage.js'
import { viewStoreOf } from '/shared/view-store.js'
import { syncStatus } from '/shared/sync-status.js'
import { now, tz } from '/shared/time.js'
import { LIBRARY_CACHE } from '/view-cache.js'
import { cachedScheduled, fetchScheduledState } from '/views/scheduled-view.js'

const LIBRARY_SORT_KEY = 'freetvarr.librarySort'
const LIBRARY_UNWATCHED_KEY = 'freetvarr.libraryUnwatched'
const FAILED_LOG_HREF = '#/settings/system/log?status=failed'
const LIBRARY_POLL_MS = 60_000
const SKELETON_POSTERS = 6
const FAILED_RECORDINGS_URL = '/api/recordings?status=failed&sort=aired_at&dir=desc&pageSize=10'

const libraryStore = viewStoreOf(LIBRARY_CACHE)

let libraryDraft = null

const keepLibrary = (part) => {
  libraryDraft = { failedRows: [], ...(libraryDraft ?? libraryStore.cached()), ...part }
  if (LIBRARY_CACHE.isValid(libraryDraft)) libraryStore.keep(libraryDraft)
}

export const fetchLibraryShows = async () => {
  const result = await api('GET', '/api/library/shows')
  const library = { shows: result.shows || [], stale: Boolean(result.stale) }
  keepLibrary(library)
  return library
}

export const fetchFailedRecordings = async () => {
  const result = await api('GET', FAILED_RECORDINGS_URL).catch(() => null)
  const failedRows = result?.recordings || []
  keepLibrary({ failedRows })
  return failedRows
}

export const loadLibraryData = () => Promise.all([fetchLibraryShows(), fetchFailedRecordings(), fetchScheduledState()])

export const RecordingsLibraryView = {
  components: { ActionConfirm, RecordingOptionsSheet, ArtworkPicker, LibraryMenuSheet, LibraryInfoSheet, DeleteConfirm, MoveToShowSheet },
  template: `
    <div v-page-reveal="{ hold: 2 }" class="ui-page recordings-page">
      <page-header title="Recordings" subtitle="Everything you have, and everything on its way." subtitle-short="Recorded and coming up." />
      <div class="library-toolbar">
        <recordings-tabs current="library" :scheduled-count="scheduledCount" />
        <div class="library-filters">
          <button type="button" class="ui-chip" :aria-pressed="String(unwatchedOnly)" @click="unwatchedOnly = !unwatchedOnly">Unwatched</button>
          <span class="ui-chip library-sort">
            <select v-model="sortKey" class="library-sort-select" aria-label="Sort shows">
              <option v-for="o in LIBRARY_SORTS" :key="o.key" :value="o.key">{{ o.label }}</option>
            </select>
            <chevron-glyph class="library-sort-chevron" aria-hidden="true" />
          </span>
        </div>
      </div>

      <a v-if="failureBanner" :href="FAILED_LOG_HREF" class="ui-banner is-error library-failures">
        <span class="ui-dot is-fail"></span>
        <span class="ui-banner-text"><strong>{{ failureBanner.headline }}</strong><span v-if="failureBanner.detail" class="ui-meta"> · {{ failureBanner.detail }}</span></span>
        <span class="ui-banner-action">Review</span>
      </a>
      <p v-if="stale" class="ui-banner is-warning" role="status">TVHeadend is not answering, so shows waiting for a first episode may be missing.</p>

      <section v-if="!loaded" class="ui-section" aria-label="Loading shows" aria-busy="true">
        <div class="ui-row-header" aria-hidden="true">
          <h2 class="ui-section-title"><span class="ui-skeleton is-text" style="--skeleton-w: 4em"></span></h2>
          <span class="ui-row-meta"><span class="ui-skeleton is-text" style="--skeleton-w: 9em"></span></span>
        </div>
        <div class="ui-poster-grid" aria-hidden="true">
          <div v-for="n in SKELETON_POSTERS" :key="n" class="library-poster">
            <span class="ui-poster">
              <span class="ui-poster-art ui-skeleton"></span>
              <div class="ui-card-title"><span class="ui-skeleton is-text" style="--skeleton-w: 6em"></span></div>
              <div class="ui-card-meta"><span class="ui-skeleton is-text" style="--skeleton-w: 8em"></span></div>
            </span>
          </div>
        </div>
      </section>

      <p v-else-if="error && !shows.length" class="ui-banner is-error" role="alert">Cannot load your recordings: {{ error }}</p>

      <section v-else-if="!shows.length" class="ui-empty" aria-label="Library">
        <h2 class="ui-empty-title">Nothing recorded yet</h2>
        <p class="ui-empty-text">Shows, movies, and one-offs you record appear here.</p>
        <a href="#/guide" class="ui-button ui-button-primary">Find a show in the TV guide</a>
      </section>

      <section v-else-if="nothingShown" class="ui-empty" aria-label="Library">
        <h2 class="ui-empty-title">You are all caught up</h2>
        <p class="ui-empty-text">You have watched every recording.</p>
        <button type="button" class="ui-button" @click="unwatchedOnly = false">Show everything</button>
      </section>

      <template v-else>
        <section v-if="shelves.shows.length" class="ui-section" aria-labelledby="library-shows-title">
          <div class="ui-row-header">
            <h2 id="library-shows-title" class="ui-section-title">Shows</h2>
            <span class="ui-row-meta">{{ showsCountText(shelves.shows) }}</span>
          </div>
          <div class="ui-poster-grid">
            <div v-for="show in shelves.shows" :key="show.key" class="library-poster">
              <a :href="showHrefOf(show.title)" class="ui-poster" :aria-label="posterLabel(show)" @contextmenu="posterPress.onContextMenu($event, show)"
                @pointerdown="posterPress.onPointerDown($event, show)" @pointermove="posterPress.onPointerMove" @pointerup="posterPress.onPointerEnd"
                @pointercancel="posterPress.onPointerEnd" @pointerleave="posterPress.onPointerEnd">
                <title-art shape="poster" :title="show.title" :src="posterSrc(show)">
                  <span v-if="show.recordingNow" class="ui-art-badge"><span class="ui-live-badge"><span class="ui-live-dot"></span>Rec</span></span>
                  <span v-if="show.counts.new" class="ui-art-badge is-end"><span class="ui-count-badge">{{ show.counts.new }}</span></span>
                  <span v-if="recordingPercent(show) != null" class="ui-art-bar ui-progress is-live" aria-hidden="true"><span class="ui-progress-fill" :style="{ width: recordingPercent(show) + '%' }"></span></span>
                </title-art>
                <div class="ui-card-title">{{ show.title }}</div>
                <div class="ui-card-meta">{{ posterMeta(show) }}</div>
              </a>
              <button type="button" class="ui-icon-button is-plain library-poster-more" :aria-label="'More actions for ' + show.title"
                aria-haspopup="dialog" :disabled="menuLoadingKey === show.key" @click="openPosterMenu(show)"><more-glyph /></button>
            </div>
          </div>
        </section>

        <section v-if="shelves.movies.length" class="ui-section" aria-labelledby="library-movies-title">
          <div class="ui-row-header">
            <h2 id="library-movies-title" class="ui-section-title">Movies</h2>
            <span class="ui-row-meta">{{ shelves.movies.length }}</span>
          </div>
          <div class="ui-scroller">
            <a v-for="show in shelves.movies" :key="show.key" :href="showHrefOf(show.title)" class="ui-poster">
              <title-art shape="poster" :title="show.title" :src="posterSrc(show)">
                <span v-if="show.recordingNow" class="ui-art-badge"><span class="ui-live-badge"><span class="ui-live-dot"></span>Rec</span></span>
                <span v-if="recordingPercent(show) != null" class="ui-art-bar ui-progress is-live" aria-hidden="true"><span class="ui-progress-fill" :style="{ width: recordingPercent(show) + '%' }"></span></span>
              </title-art>
              <div class="ui-card-title">{{ show.title }}</div>
              <div class="ui-card-meta">{{ inProgressMeta(show) || movieMetaOf({ show }) }}</div>
            </a>
          </div>
        </section>

        <section v-if="shelves.oneoffs.length" class="ui-section" aria-labelledby="library-oneoffs-title">
          <div class="ui-row-header">
            <h2 id="library-oneoffs-title" class="ui-section-title">Specials and one-offs</h2>
            <span class="ui-row-meta">{{ shelves.oneoffs.length }}</span>
          </div>
          <div class="ui-scroller">
            <a v-for="show in shelves.oneoffs" :key="show.key" :href="showHrefOf(show.title)" class="ui-card">
              <title-art :title="show.title" :src="cardSrc(show)">
                <span v-if="show.recordingNow" class="ui-art-badge"><span class="ui-live-badge"><span class="ui-live-dot"></span>Rec</span></span>
                <span v-if="recordingPercent(show) != null" class="ui-art-bar ui-progress is-live" aria-hidden="true"><span class="ui-progress-fill" :style="{ width: recordingPercent(show) + '%' }"></span></span>
              </title-art>
              <div class="ui-card-title">{{ show.title }}</div>
              <div class="ui-card-meta">{{ inProgressMeta(show) || oneOffMetaOf({ show, timeZone: tz }) }}</div>
            </a>
          </div>
        </section>
      </template>

      <library-menu-sheet :open="showMenuOpen" :title="menuShow?.title || ''" :subtitle="showMenuSubtitle"
        :art-src="menuShow ? posterSrc(menuShow) : ''" art-shape="poster" :groups="showGroups" :busy="busy" :pending-key="pendingKey"
        @close="closeMenus" @choose="chooseShowAction" />
      <library-info-sheet :open="Boolean(info)" :info="info" @close="info = null" />
      <move-to-show-sheet :request="moveRequest" :busy="busy" @close="closeMove" @move="moveToShow" />
      <artwork-picker :open="pictureOpen" :show="menuShow" @close="closePicture" @changed="onPictureChanged" />
      <delete-confirm :request="deleteRequest" @cancel="cancelDelete" @done="onDeleted" />
      <action-confirm :request="actionRequest" @cancel="cancelAction" @done="onActionDone" />
      <recording-options-sheet v-if="menuShow?.rule" :open="optionsOpen" :show="menuShow" @close="optionsOpen = false"
        @changed="reloadMenuShow" @stopped="onStopped" @flash="onOptionsFlash" />
    </div>
  `,
  setup() {
    const saved = libraryStore.cached()
    const shows = ref(saved?.shows || [])
    const stale = ref(Boolean(saved?.stale))
    const loaded = ref(Boolean(saved))
    const error = ref('')
    const failedRows = ref(saved?.failedRows || [])
    const scheduledState = shallowRef(cachedScheduled()?.state ?? null)
    const sortKey = storedChoice({ key: LIBRARY_SORT_KEY, options: LIBRARY_SORTS.map((o) => o.key), fallback: 'recent' })
    const unwatchedOnly = storedFlag({ key: LIBRARY_UNWATCHED_KEY, fallback: false })

    const shelves = computed(() => shelvesOf({ shows: shows.value, sort: sortKey.value, unwatchedOnly: unwatchedOnly.value }))
    const nothingShown = computed(() => !shelves.value.shows.length && !shelves.value.movies.length && !shelves.value.oneoffs.length)

    const failureBanner = computed(() => failureBannerOf({
      failed: failedRecordingsOf({ rows: failedRows.value, journeys: recordingNow.value.journeys || [], nowMs: Date.now() }),
      timeZone: tz.value,
      reasonOf: failureReasonOf,
    }))

    const scheduledCount = computed(() => (scheduledState.value
      ? scheduledCountOfState({
        state: scheduledState.value,
        activeProgramIds: recordingNow.value.active.filter((r) => !r.failed).map((r) => r.programId),
        nowMs: now.value.getTime(),
        timeZone: tz.value,
      })
      : null))

    const loadShows = async () => {
      try {
        const library = await fetchLibraryShows()
        shows.value = library.shows
        stale.value = library.stale
        error.value = ''
      } catch (err) {
        error.value = err.message
      } finally {
        loaded.value = true
      }
    }

    const loadFailures = async () => {
      failedRows.value = await fetchFailedRecordings()
    }

    const loadScheduledCount = async () => {
      scheduledState.value = await fetchScheduledState().catch(() => scheduledState.value)
    }

    const refresh = () => Promise.all([loadShows(), loadFailures()]).then(loadScheduledCount)

    let pollTimer = null
    onMounted(() => {
      refresh()
      pollTimer = setInterval(refresh, LIBRARY_POLL_MS)
    })
    onUnmounted(() => clearInterval(pollTimer))
    watch(recordingChangeTick, () => loadShows().then(loadScheduledCount))
    watch(recordingSetKey, (current, previous) => {
      if (current !== previous) loadShows()
    })
    watch(() => syncStatus.value.activeSyncId, (current, previous) => {
      if (previous && !current) refresh()
    })

    const { showToast, showFlash: onOptionsFlash } = useLibraryToast()
    const menuShow = ref(null)
    const menuLoadingKey = ref('')
    const optionsOpen = ref(false)

    const fetchShowDetail = (key) => api('GET', `/api/library/shows/${encodeURIComponent(key)}`)

    const reloadMenuShow = async () => {
      const key = menuShow.value?.key
      await loadShows()
      if (!key) return
      menuShow.value = await fetchShowDetail(key).catch(() => null)
    }

    const actions = useLibraryActions({
      show: menuShow,
      reload: reloadMenuShow,
      showToast,
      openOptions: () => { optionsOpen.value = true },
      canMove: true,
    })

    const openPosterMenu = async (show) => {
      menuLoadingKey.value = show.key
      try {
        menuShow.value = await fetchShowDetail(show.key)
        actions.openShowMenu()
      } catch (err) {
        showToast({ kind: 'error', title: `Cannot load ${show.title}`, detail: err.message })
      } finally {
        menuLoadingKey.value = ''
      }
    }

    const posterPress = useLongPress(openPosterMenu)

    const onStopped = async (message) => {
      optionsOpen.value = false
      showToast({ title: message })
      await reloadMenuShow()
    }


    const inProgressMeta = (show) => inProgressCardMetaOf({ show: { ...show, inProgress: freshInProgressOf(show) }, timeZone: tz.value })
    const posterMeta = (show) => inProgressMeta(show) || posterMetaOf({ show, timeZone: tz.value })
    const freshInProgressOf = (show) => {
      const item = show.inProgress
      if (!item) return null
      const fresh = recordingNow.value.active.find((r) => !r.failed && String(r.dvrUuid) === String(item.dvrUuid))
      return fresh ? { ...item, stop: fresh.stop, stopPadded: fresh.stopPadded } : item
    }
    const recordingPercent = (show) => {
      const item = freshInProgressOf(show)
      if (!isRecordingPhase(item)) return null
      return recordedPercentOf({ start: item.start, stop: item.stop, nowMs: now.value.getTime() })
    }
    const posterLabel = (show) => [show.title, show.recordingNow ? 'recording now' : '', posterMeta(show)].filter(Boolean).join(', ')
    const posterSrc = (show) => `${show.poster}&w=384`
    const cardSrc = (show) => show.image || `/api/epg/show-image?title=${encodeURIComponent(show.title)}&w=384`

    return {
      ...actions,
      menuShow, menuLoadingKey, optionsOpen, openPosterMenu, posterPress, onStopped, onOptionsFlash, reloadMenuShow,
      shows, stale, loaded, error, shelves, nothingShown, failureBanner, scheduledCount, sortKey, unwatchedOnly,
      LIBRARY_SORTS, FAILED_LOG_HREF, SKELETON_POSTERS, tz,
      posterMeta, posterLabel, inProgressMeta, recordingPercent, posterSrc, cardSrc, movieMetaOf, oneOffMetaOf, showsCountText, showHrefOf,
    }
  },
}

const failureReasonOf = (error) => (error ? diagnoseRecordingError(error).title : '')
