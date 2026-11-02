import { ref, shallowRef, computed, nextTick, onBeforeUnmount, onMounted, onUnmounted, watch } from '/vendor/vue.esm-browser.prod.js'
import { useLibraryActions } from '/components/library-actions.js'
import { ActionConfirm, DeleteConfirm, LibraryInfoSheet, LibraryMenuSheet, useLibraryToast } from '/components/library-menus.js'
import { MoveToShowSheet } from '/components/move-to-show-sheet.js'
import { RecordingOptionsSheet } from '/components/recording-options-sheet.js'
import { ArtworkPicker } from '/components/artwork-picker.js'
import {
  LIBRARY_KINDS,
  LIBRARY_SORTS,
  kindCountText,
  libraryKindOf,
  libraryRowsOf,
  failedRecordingsOf,
  failureBannerOf,
  isScheduledOnly,
  movieMetaOf,
  oneOffMetaOf,
  posterMetaOf,
  shelvesOf,
  showsCountText,
} from '/library-shelves.js'
import { diagnoseRecordingError } from '/recording-error.js'
import { scheduledCountOfState } from '/scheduled-groups.js'
import { showHrefOf } from '/show-key.js'
import { recordingsPageOf } from '/route-table.js'
import { libraryBackOf } from '/back-target.js'
import { createRowScrollMemory } from '/row-scroll-memory.js'
import { cameFromHash, cameFromHistory, latestArrival, navigate, replaceHash, routeParams } from '/shared/router.js'
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
const SKELETON_ROW_ITEMS = 6
const SKELETON_GRID_ITEMS = 12
const SKELETON_TITLE_WIDTHS = { shows: '4em', movies: '4.6em', oneoffs: '10em' }
const OVERVIEW_ORDER = { sort: 'recent', unwatchedOnly: false }
const FAILED_RECORDINGS_URL = '/api/recordings?status=failed&sort=aired_at&dir=desc&pageSize=10'

const libraryStore = viewStoreOf(LIBRARY_CACHE)
const rowScroll = createRowScrollMemory()

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
    <div v-page-reveal="{ hold: 2 }" :class="['ui-page', 'recordings-page', { 'library-kind-page': kind }]">
      <template v-if="kind">
        <a href="#/recordings" class="library-back" @click.prevent="goBack"><back-glyph /> Library</a>
        <page-header :title="kind.title" :subtitle="kindSubtitle">
          <template v-if="!loaded" #subtitle><span class="ui-skeleton is-text" style="--skeleton-w: 9em"></span></template>
        </page-header>
        <div class="library-toolbar">
          <ui-segmented tabs :model-value="kind.slug" :options="kindTabs" aria-label="Library" @update:model-value="switchKind" />
          <div class="library-filters">
            <button type="button" class="ui-chip" :aria-pressed="String(unwatchedOnly)" @click="unwatchedOnly = !unwatchedOnly">Unwatched</button>
            <span class="ui-chip library-sort">
              <select v-model="sortKey" class="library-sort-select" :aria-label="'Sort ' + kind.segment.toLowerCase()">
                <option v-for="o in LIBRARY_SORTS" :key="o.key" :value="o.key">{{ o.label }}</option>
              </select>
              <chevron-glyph class="library-sort-chevron" aria-hidden="true" />
            </span>
          </div>
        </div>
      </template>
      <template v-else>
        <page-header title="Recordings" subtitle="Everything you have, and everything on its way." subtitle-short="Recorded and coming up." />
        <div class="library-toolbar">
          <recordings-tabs current="library" :scheduled-count="scheduledCount" />
        </div>
        <a v-if="failureBanner" :href="FAILED_LOG_HREF" class="ui-banner is-error library-failures">
          <span class="ui-dot is-fail"></span>
          <span class="ui-banner-text"><strong>{{ failureBanner.headline }}</strong><span v-if="failureBanner.detail" class="ui-meta"> · {{ failureBanner.detail }}</span></span>
          <span class="ui-banner-action">Review</span>
        </a>
      </template>

      <p v-if="stale" class="ui-banner is-warning" role="status">TVHeadend is not answering, so shows waiting for a first episode may be missing.</p>

      <template v-if="!loaded">
        <section v-for="row in skeletonRows" :key="row.key" class="ui-section" aria-label="Loading recordings" aria-busy="true">
          <div v-if="!kind" class="ui-row-header" aria-hidden="true">
            <h2 class="ui-section-title"><span class="ui-skeleton is-text" :style="{ '--skeleton-w': row.titleWidth }"></span></h2>
          </div>
          <div :class="layoutClassOf(row)" aria-hidden="true">
            <div v-for="n in row.count" :key="n" class="library-poster">
              <span :class="row.shape === 'poster' ? 'ui-poster' : 'ui-card'">
                <span :class="[row.shape === 'poster' ? 'ui-poster-art' : 'ui-card-art', 'ui-skeleton']"></span>
                <div class="ui-card-title"><span class="ui-skeleton is-text" style="--skeleton-w: 6em"></span></div>
                <div class="ui-card-meta"><span class="ui-skeleton is-text" style="--skeleton-w: 8em"></span></div>
              </span>
            </div>
          </div>
        </section>
      </template>

      <p v-else-if="error && !shows.length" class="ui-banner is-error" role="alert">Cannot load your recordings: {{ error }}</p>

      <section v-else-if="!shows.length" class="ui-empty" aria-label="Library">
        <h2 class="ui-empty-title">Nothing recorded yet</h2>
        <p class="ui-empty-text">Shows, movies, and one-offs you record appear here.</p>
        <a href="#/guide" class="ui-button ui-button-primary">Find a show in the TV guide</a>
      </section>

      <section v-else-if="kind && !kindTotal" class="ui-empty" :aria-label="kind.title">
        <h2 class="ui-empty-title">{{ kindEmpty.title }}</h2>
        <p class="ui-empty-text">{{ kindEmpty.text }}</p>
        <button v-if="unwatchedOnly" type="button" class="ui-button" @click="unwatchedOnly = false">Show everything</button>
        <a v-else href="#/guide" class="ui-button ui-button-primary">Find one in the TV guide</a>
      </section>

      <template v-else>
        <section v-for="group in groups" :key="group.key" :id="'library-' + group.key" class="ui-section"
          :aria-labelledby="kind ? null : 'library-' + group.key + '-title'" :aria-label="kind ? group.title : null">
          <div v-if="!kind" class="ui-row-header">
            <h2 :id="'library-' + group.key + '-title'" class="ui-section-title"><a :href="group.href" class="ui-row-title-link">{{ group.title }}<chevron-glyph class="ui-row-chevron" /></a></h2>
            <a :href="group.href" class="ui-row-link" tabindex="-1" aria-hidden="true">See all</a>
          </div>
          <div :class="layoutClassOf(group)" :ref="(el) => setRowScroller(group.key, kind ? null : el)">
            <div v-for="show in group.items" :key="show.key" :class="['library-poster', 'is-' + group.shape]">
              <a :href="showHrefOf(show.title)" :class="group.shape === 'poster' ? 'ui-poster' : 'ui-card'" :aria-label="posterLabel(show, group)"
                @contextmenu="posterPress.onContextMenu($event, show)" @pointerdown="posterPress.onPointerDown($event, show)"
                @pointermove="posterPress.onPointerMove" @pointerup="posterPress.onPointerEnd" @pointercancel="posterPress.onPointerEnd" @pointerleave="posterPress.onPointerEnd">
                <title-art :shape="group.shape" :title="show.title" :src="group.shape === 'poster' ? posterSrc(show) : cardSrc(show)">
                  <span v-if="show.recordingNow" class="ui-art-badge"><span class="ui-live-badge"><span class="ui-live-dot"></span>Rec</span></span>
                  <span v-if="group.key === 'shows' && show.counts.new" class="ui-art-badge is-end"><span class="ui-count-badge">{{ show.counts.new }}</span></span>
                  <span v-if="recordingPercent(show) != null" class="ui-art-bar ui-progress is-live" aria-hidden="true"><span class="ui-progress-fill" :style="{ width: recordingPercent(show) + '%' }"></span></span>
                </title-art>
                <div class="ui-card-title">{{ show.title }}</div>
                <div :class="['ui-card-meta', { 'is-scheduled': !inProgressMeta(show) && isScheduledOnly(show) }]">{{ metaOf(show, group) }}</div>
              </a>
              <button type="button" class="ui-icon-button is-plain library-poster-more" :aria-label="'More actions for ' + show.title"
                aria-haspopup="dialog" :disabled="menuLoadingKey === show.key" @click="openPosterMenu(show)"><more-glyph /></button>
            </div>
            <row-end-tile v-if="!kind" :href="group.href" :shape="group.shape" :count-text="kindCountText({ kind: group, count: group.total })" />
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

    const kind = computed(() => libraryKindOf(recordingsPageOf(routeParams.value).kind))
    const shelves = computed(() => shelvesOf({
      shows: shows.value,
      ...(kind.value ? { sort: sortKey.value, unwatchedOnly: unwatchedOnly.value } : OVERVIEW_ORDER),
    }))
    const allOfKind = computed(() => (kind.value ? shelvesOf({ shows: shows.value })[kind.value.key] : []))
    const groups = computed(() => (kind.value
      ? [{ ...kind.value, items: shelves.value[kind.value.key], total: shelves.value[kind.value.key].length }]
      : libraryRowsOf(shelves.value)))
    const kindTotal = computed(() => groups.value[0]?.total ?? 0)
    const kindSubtitle = computed(() => kindSubtitleOf({
      kind: kind.value,
      shows: allOfKind.value,
      shown: kindTotal.value,
      unwatchedOnly: unwatchedOnly.value,
    }))
    const kindEmpty = computed(() => kindEmptyOf({ kind: kind.value, unwatchedOnly: unwatchedOnly.value }))
    const kindTabs = LIBRARY_KINDS.map((option) => ({ value: option.slug, label: option.segment, href: option.href, replace: true }))
    const skeletonRows = computed(() => skeletonRowsOf(kind.value))
    const layoutClassOf = (group) => layoutClassFor({ group, isGrid: Boolean(kind.value) })

    const switchKind = (slug) => replaceHash(libraryKindOf(slug).href)

    const goBack = () => {
      if (libraryBackOf({ cameFrom: cameFromHash.value, inHistory: cameFromHistory.value }) === 'history') return history.back()
      navigate('#/recordings')
    }

    const rowScrollers = new Map()
    const setRowScroller = (key, el) => {
      if (el) rowScrollers.set(key, el)
      else rowScrollers.delete(key)
    }
    const rememberRowScroll = () => rowScrollers.forEach((el, key) => rowScroll.remember({ key, left: el.scrollLeft }))
    const restoreRowScroll = async () => {
      await nextTick()
      rowScrollers.forEach((el, key) => { el.scrollLeft = rowScroll.recall(key) })
    }
    const isOverview = !kind.value
    if (isOverview && latestArrival().fresh) rowScroll.forget()
    let rowsRestored = false
    watch(() => groups.value.length, (count) => {
      if (!isOverview || rowsRestored || !count) return
      rowsRestored = true
      restoreRowScroll()
    }, { immediate: true })
    onBeforeUnmount(() => { if (isOverview) rememberRowScroll() })

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
    const metaOf = (show, group) => inProgressMeta(show) || KIND_META[group.key]({ show, timeZone: tz.value })
    const posterLabel = (show, group) => [show.title, show.recordingNow ? 'recording now' : '', metaOf(show, group)].filter(Boolean).join(', ')
    const posterSrc = (show) => `${show.poster}&w=384`
    const cardSrc = (show) => show.image || `/api/epg/show-image?title=${encodeURIComponent(show.title)}&w=384`

    return {
      ...actions,
      menuShow, menuLoadingKey, optionsOpen, openPosterMenu, posterPress, onStopped, onOptionsFlash, reloadMenuShow,
      shows, stale, loaded, error, failureBanner, scheduledCount, sortKey, unwatchedOnly,
      kind, groups, kindTotal, kindSubtitle, kindEmpty, kindTabs, skeletonRows, layoutClassOf, switchKind, goBack, kindCountText, setRowScroller,
      LIBRARY_SORTS, FAILED_LOG_HREF, tz,
      metaOf, posterLabel, inProgressMeta, recordingPercent, posterSrc, cardSrc, isScheduledOnly, showHrefOf,
    }
  },
}

const KIND_META = {
  shows: posterMetaOf,
  movies: movieMetaOf,
  oneoffs: oneOffMetaOf,
}

const kindSubtitleOf = ({ kind, shows, shown, unwatchedOnly }) => {
  if (!kind) return ''
  if (unwatchedOnly) return `${shown} of ${kindCountText({ kind, count: shows.length })} · Unwatched`
  return kind.key === 'shows' ? showsCountText(shows) : kindCountText({ kind, count: shows.length })
}

const kindEmptyOf = ({ kind, unwatchedOnly }) => {
  if (!kind) return null
  const plural = kindCountText({ kind, count: 2 }).replace(/^2 /, '')
  return unwatchedOnly
    ? { title: 'You are all caught up', text: `You have watched every ${kind.noun}.` }
    : { title: `No ${plural} yet`, text: `${sentenceStart(plural)} you record appear here.` }
}

const sentenceStart = (text) => text[0].toUpperCase() + text.slice(1)

const skeletonRowsOf = (kind) => (kind
  ? [{ key: kind.key, shape: kind.shape, count: SKELETON_GRID_ITEMS }]
  : LIBRARY_KINDS.map((row) => ({ key: row.key, shape: row.shape, count: SKELETON_ROW_ITEMS, titleWidth: SKELETON_TITLE_WIDTHS[row.key] })))

const layoutClassFor = ({ group, isGrid }) => {
  if (!isGrid) return 'ui-scroller'
  return group.shape === 'poster' ? 'ui-poster-grid' : 'ui-poster-grid library-card-grid'
}

const failureReasonOf = (error) => (error ? diagnoseRecordingError(error).title : '')
