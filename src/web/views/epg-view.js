import {
  ref,
  shallowRef,
  computed,
  onMounted,
  onUnmounted,
  provide,
  watch,
  nextTick,
} from '/vendor/vue.esm-browser.prod.js'
import {
  localDayNumber,
  weekdayOfDayNumber,
  localClockMs,
  dayLengthMin,
  spillLengthMin,
  rulerTickMinutes,
} from '/guide-time.js'
import { cellArtOf, cellWindowOf, crossesRailEdge, nearRowKeysOf, pinsScrolledAway, sameCellWindow, scrollLeadOf, spanOnScreen, windowedCellsByRow } from '/guide-window.js'
import { GUIDE_RAIL_DEFAULT_PX, canEditOrderOf, clampRailPx, railLayoutOf, railShownPxOf } from '/guide-rail.js'
import { seasonEpisodeOf } from '/live-info.js'
import { formatDate } from '/time-format.js'
import { cellMarksOf, clockWithoutPeriod } from '/programme-sheet.js'
import { watchForOfferOf } from '/watch-for.js'
import { channelGroupLabel } from '/components/channel-identity.js'
import { togglePinnedChannel } from '/components/channels-modal.js'
import { openWatchFor } from '/components/watch-for-sheet.js'
import { api } from '/shared/api.js'
import { useMediaQuery, useFlash } from '/shared/composables.js'
import { PHONE_LAYOUT_QUERY, CHANNELS_SAVED_TEXT } from '/shared/constants.js'
import { fmtBytes } from '/shared/format.js'
import { animateImagesToggle } from '/shared/guide-images-motion.js'
import { setDragLock, useFavouriteOrderSave, useOrderEditing, useSortable } from '/shared/pin-drag.js'
import { SORT_PART_COMPONENTS } from '/components/sort-parts.js'
import { GUIDE_ROW_CONTEXT, GuideRow } from '/components/guide-row.js'
import { KindFilterMenu, useKindFilter } from '/components/kind-filter-menu.js'
import { airingPairOf, airsKindNowOrNext, showsMovieChip } from '/kind-filter.js'
import { GUIDE_IMAGES_ON } from '/components/images.js'
import { channelPrefsChangedSince } from '/shared/channel-prefs.js'
import { rememberLineup } from '/shared/channel-twins.js'
import { RAIL_EDGE_ATTRIBUTE } from '/shared/scroll-proximity.js'
import { arrangeByOrder } from '/sortable-math.js'
import {
  activeRecordingSet,
  cellState,
  epgState,
  isSeriesScheduled,
  isWatched,
  loadEpgState,
  loadLibraryDefault,
  loadWatchlist,
  programmeSheetOpen,
  recordingStateText,
  repeatByProgramId,
  scheduledByProgramId,
  seriesLinkSet,
  seriesTags,
  useProgrammeSheet,
  watchedKeys,
} from '/shared/programme-sheet-store.js'
import { recordingChangeTick } from '/shared/recording-now.js'
import { storedFlag, storedChoice } from '/shared/storage.js'
import { guideJump } from '/shared/store.js'
import { tz, dateFormat, now, fmtClockTz } from '/shared/time.js'
import { viewStoreOf } from '/shared/view-store.js'
import { GUIDE_CACHE } from '/view-cache.js'
import { guideSkeletonRows } from '/guide-skeleton.js'

const dayKey = (ms) => dateFormat({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms))

const EPG_ZOOM_LEVELS = [
  { key: 's', label: 'Small', pxPerMin: 3, rowRem: 3.4, narrowRowRem: 3, halfHourTicks: false },
  { key: 'm', label: 'Medium', pxPerMin: 5, rowRem: 4.4, narrowRowRem: 3.75, halfHourTicks: true },
  { key: 'l', label: 'Large', pxPerMin: 8, rowRem: 5.6, narrowRowRem: 4.75, halfHourTicks: true },
]
const EPG_ZOOM_KEY = 'freetvarr.guideZoom'
const EPG_NOW_ANCHOR = 0.2

const EPG_CELL_INSET_PX = 10
const EPG_CELL_TEXT_MIN_PX = 40
const EPG_THUMB_TEXT_MIN_PX = 72
const EPG_TOOLTIP_DELAY_MS = 250
const EPG_TOOLTIP_GAP_PX = 12
const EPG_TOOLTIP_EDGE_PX = 8
const EPG_RAIL_KEY = 'freetvarr.epgRailPx'
const EPG_IMAGES_KEY = 'freetvarr.guideImages'
const EPG_NO_CELLS = Object.freeze([])

const EPG_STATE_POLL_MS = 60_000
const LISTINGS_REFRESH_MS = 10_000
const GUIDE_AUTO_REFRESH_MS = 5 * 60_000
const GUIDE_REVISIT_REFRESH_MS = 60_000
const guideStore = viewStoreOf(GUIDE_CACHE)
let todayFetchedAt = 0
const GUIDE_STALE_CHECK_MS = 30_000
const LISTINGS_LOADING_TEXT = 'Loading the new listings. This can take a couple of minutes.'

const EPG_SEARCH_DEBOUNCE_MS = 300
const SCHEDULED_HREF = '#/recordings/scheduled'

export const EpgView = {
  components: { ...SORT_PART_COMPONENTS, GuideRow, KindFilterMenu },
  template: `
    <div v-page-reveal class="ui-page guide-page">
      <page-header title="TV guide" :subtitle="dateSubtitle" :widgets="false">
        <template #actions>
          <a href="#/recordings/scheduled" class="guide-scheduled-chip" :aria-label="scheduledLabel + '. Open Scheduled'">
            <span class="guide-scheduled-dot" aria-hidden="true"></span><span>{{ scheduledCount }}<span class="guide-scheduled-word"> scheduled</span></span>
          </a>
          <recording-chip />
          <channels-button :disabled="!guide" @open="openChannelsModal" />
          <button type="button" class="ui-icon-button" :aria-label="searchOpen ? 'Close search' : 'Search the next 7 days'"
            :title="searchOpen ? 'Close search' : 'Search the next 7 days'" :aria-expanded="String(searchOpen)" @click="toggleSearch">
            <close-glyph v-if="searchOpen" /><search-glyph v-else />
          </button>
        </template>
        <template #below>
          <recording-chip variant="banner" />
        </template>
      </page-header>

      <div class="guide-controls">
        <div v-if="searchOpen" class="guide-search">
          <label class="guide-search-field">
            <search-glyph />
            <input v-no-autofill v-autofocus v-model="searchQ" type="search" class="guide-search-input"
              placeholder="Search the next 7 days" aria-label="Search the next 7 days" @keydown.esc.stop.prevent="closeSearch" />
          </label>
        </div>
        <div class="guide-days">
          <div class="ui-chip-row is-scroll guide-day-chips" role="group" aria-label="Day">
            <button v-for="d in dayChips" :key="d.day" type="button" class="ui-chip"
              :aria-pressed="String(day === d.day && !searchActive)" @click="pickDay(d.day)">{{ d.label }}</button>
          </div>
          <div v-if="!narrow" class="ui-chip-row guide-jumps">
            <button type="button" class="ui-chip" @click="jumpNow">Now</button>
            <button type="button" class="ui-chip" @click="jumpTonight">Tonight</button>
          </div>
        </div>
        <div class="guide-toolbar">
          <toggle-switch compact :model-value="showImages" @update:model-value="toggleImages">Images</toggle-switch>
          <ui-segmented compact class="guide-zoom" aria-label="Zoom" :model-value="zoom" @update:model-value="setZoom"
            :options="zoomLevels.map((level) => ({ value: level.key, label: level.key.toUpperCase(), ariaLabel: level.label + ' zoom' }))" />
          <div v-if="!narrow" class="ui-segmented is-compact guide-zoom-steps" role="group" aria-label="Zoom">
            <button type="button" class="ui-segment" aria-label="Zoom out" :disabled="zoomIndex === 0" @click="changeZoom(-1)"><minus-icon /></button>
            <button type="button" class="ui-segment" aria-label="Zoom in" :disabled="zoomIndex === zoomLevelCount - 1" @click="changeZoom(1)"><plus-icon /></button>
          </div>
        </div>
      </div>

      <section v-if="searchActive" class="guide-results" aria-label="Search results">
        <p class="ui-meta" role="status">{{ searching ? 'Searching…' : resultsLabel }}</p>
        <div v-if="searchResults.length" class="ui-group">
          <button v-for="p in searchResults" :key="p.program_id + '-' + p.start" type="button" class="ui-group-row is-tall guide-result"
            @click="openProgram(p, channelById(p.channelId))">
            <span class="guide-result-art">
              <programme-image :event-id="p.has_image ? p.program_id : null" variant="thumb" :channel-id="p.channelId"
                :has-logo="hasChannelLogo(p.channelId)" :title="p.title" />
            </span>
            <span class="ui-group-row-main">
              <span class="ui-group-row-title">{{ p.title }}</span>
              <span class="ui-group-row-meta">{{ p.channelName }} · {{ fmtDayTime(p.start) }}–{{ fmtClock(p.end) }}<template v-if="p.episode_title"> · {{ p.episode_title }}</template></span>
            </span>
            <span v-if="recordingStateText(p)" :class="['guide-result-state', cellState(p) || 'watching']">
              <span class="guide-result-dot" aria-hidden="true"></span><span class="guide-result-state-text">{{ recordingStateText(p) }}</span>
            </span>
          </button>
        </div>
        <p v-else-if="!searching" class="ui-meta">Nothing in the next 7 days matches “{{ searchQ.trim() }}”.</p>
        <div v-if="watchForOffer" class="ui-group">
          <button type="button" class="ui-group-row" @click="openWatchFor(watchForOffer)">
            <span class="ui-group-row-main">
              <span class="ui-group-row-title">Add “{{ watchForOffer }}” to watchlist</span>
              <span class="ui-group-row-meta">List it in Scheduled, or record it, when it is in the TV guide</span>
            </span>
          </button>
        </div>
      </section>

      <template v-else>
        <div v-if="guide && !narrow" class="guide-label-row">
          <h2 class="ui-group-label">Channels</h2>
          <label class="guide-filter" data-kind-filter-anchor>
            <search-glyph />
            <input v-no-autofill v-model="railFilter" type="search" placeholder="Filter" v-bind="kindFilter.fieldAttrs.value"
              aria-label="Filter channels by number or name" @keydown="onFilterKeydown"
              @focus="kindFilter.onFocus" @blur="kindFilter.onBlur" />
          </label>
          <div class="guide-legend guide-key">
            <span class="guide-legend-item"><span class="guide-legend-ring" aria-hidden="true"></span>Recording now</span>
            <span class="guide-legend-item"><span class="guide-legend-dot" aria-hidden="true"></span>Scheduled</span>
            <span class="guide-legend-item"><span class="guide-legend-dot is-watch" aria-hidden="true"></span>On watchlist</span>
          </div>
        </div>
        <p v-if="guide?.stale" class="ui-banner is-warning">
          <span class="ui-dot is-warn"></span>
          <span class="ui-banner-text">Showing the saved guide. TVHeadend did not answer, so Freetvarr tries again shortly.</span>
        </p>
        <div v-if="errorCode === 'no-url'" class="ui-empty">
          <h2 class="ui-empty-title">Connect TVHeadend</h2>
          <p class="ui-empty-text">Set the TVHeadend address in Settings to see the TV guide.</p>
          <div class="guide-empty-actions">
            <a href="#/settings/system/tvheadend" class="ui-button ui-button-primary">Open Settings</a>
            <button type="button" class="ui-button ui-button-secondary" @click="loadDay(day, { force: true })">Try again</button>
          </div>
        </div>
        <div v-else-if="errorCode === 'no-channels'" class="ui-empty">
          <h2 class="ui-empty-title">No channels yet</h2>
          <p class="ui-empty-text">TVHeadend has no channels. Scan and map them in TVHeadend.</p>
          <button type="button" class="ui-button ui-button-secondary" @click="loadDay(day, { force: true })">Try again</button>
        </div>
        <div v-else-if="error" class="ui-empty">
          <h2 class="ui-empty-title">The TV guide did not load</h2>
          <p class="ui-empty-text">{{ error }} Check the TVHeadend connection in <a href="#/settings/system/tvheadend">Settings</a>.</p>
          <button type="button" class="ui-button ui-button-secondary" @click="loadDay(day, { force: true })">Try again</button>
        </div>
        <template v-else-if="loading && !guide">
          <div v-if="!narrow" class="guide-label-row" aria-hidden="true">
            <h2 class="ui-group-label">Channels</h2>
            <span class="guide-filter"><search-glyph /></span>
            <div class="guide-legend guide-key">
              <span class="guide-legend-item"><span class="guide-legend-ring"></span>Recording now</span>
              <span class="guide-legend-item"><span class="guide-legend-dot"></span>Scheduled</span>
              <span class="guide-legend-item"><span class="guide-legend-dot is-watch"></span>On watchlist</span>
            </div>
          </div>
          <div ref="skeletonCardEl" class="guide-card guide-skeleton ui-skeleton-surface" aria-hidden="true" :style="{ '--epg-rail-px': 'min(' + railPx + 'px, 38vw)' }">
            <div :class="['epg-scroll', 'epg-zoom-' + zoom]">
              <div class="epg-canvas">
                <div class="epg-ruler">
                  <div class="epg-ruler-corner"><span v-if="narrow" class="epg-corner-filter"></span></div>
                </div>
                <div class="epg-rows">
                  <div class="epg-heading-row">
                    <div class="epg-heading-rail">
                      <span class="channel-group-heading"><span class="ui-skeleton is-text" style="--skeleton-w: 6em"></span></span>
                    </div>
                  </div>
                  <div v-for="(cells, i) in skeletonRows" :key="i" class="epg-row">
                    <div class="epg-rail-cell">
                      <span class="epg-pin"></span>
                      <span class="channel-logo"></span>
                      <span class="channel-name">
                        <span class="ui-skeleton is-text" style="--skeleton-w: 5em"></span>
                        <span class="ui-skeleton is-text" style="--skeleton-w: 1.4em"></span>
                      </span>
                    </div>
                    <div class="epg-track">
                      <span v-for="(cell, j) in cells" :key="j" class="epg-cell" :style="{ left: cell.left, width: cell.width }"><span class="ui-skeleton is-fill"></span></span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div v-if="narrow" ref="legendEl" class="guide-legend guide-legend-strip" aria-hidden="true">
            <span class="guide-legend-item"><span class="guide-legend-ring"></span>Recording now</span>
            <span class="guide-legend-item"><span class="guide-legend-dot"></span>Scheduled</span>
            <span class="guide-legend-item"><span class="guide-legend-dot is-watch"></span>On watchlist</span>
            <span class="guide-legend-meta"><span class="ui-skeleton is-text" style="--skeleton-w: 9em"></span></span>
          </div>
        </template>
        <div v-else-if="guide" :class="['guide-card', { 'is-rail-compact': railLayout.compact, 'is-order-editing': canSort }]" :style="{ '--epg-rail-px': 'min(' + railPx + 'px, 38vw)' }">
          <div class="epg-grid-edge" aria-hidden="true" :style="{ height: railStripH + 'px', right: scrollbarW + 'px' }"></div>
          <button v-if="pinsOffscreen" type="button" class="epg-pinned-chip" @click="scrollRailTop"><arrow-up-icon /> {{ pinnedCount }} favourite{{ pinnedCount === 1 ? '' : 's' }}</button>
          <button v-if="midnightOnScreen && day < 6" type="button" class="epg-pinned-chip epg-next-day-chip"
            :style="{ right: 'calc(' + scrollbarW + 'px + 0.5rem)' }" :aria-label="'Go to ' + nextDayLongLabel"
            @click="goToNextDay">{{ narrow ? nextDayWeekday : nextDayLabel }} <chevron-right-icon /></button>
          <div :class="['epg-scroll', 'epg-zoom-' + zoom, { 'epg-zooming': zooming, 'epg-images-off': !showImages, 'epg-images-leaving': imagesLeaving }]" ref="scrollEl"
            @pointerover="onGridPointer" @pointermove="onGridPointer" @pointerout="onGridPointerOut"
            @pointerdown="hideTooltip" @focusin="onGridFocusIn" @focusout="onGridFocusOut">
          <div class="epg-canvas" :style="{ width: 'calc(var(--epg-rail-px) + ' + (trackWidth + trackTailPx) + 'px)' }">
            <div class="epg-ruler">
              <div class="epg-ruler-corner">
                <input v-if="narrow" v-no-autofill v-model="railFilter" type="search" class="epg-corner-filter"
                  :placeholder="railLayout.filterPlaceholder" aria-label="Filter channels by number or name" v-bind="kindFilter.fieldAttrs.value"
                  @keydown="onFilterKeydown" @focus="kindFilter.onFocus" @blur="kindFilter.onBlur" />
                <span v-else-if="railMatchIds" class="epg-filter-count"><span role="status" class="epg-filter-count-text" :aria-label="filterCountLabel"><span
                  class="epg-filter-count-num">{{ railMatchIds.size }}</span>{{ railMatchIds.size === 1 ? 'channel' : 'channels' }}</span><button
                  type="button" class="epg-filter-clear" aria-label="Clear filter" @click="railFilter = ''"></button></span>
                <div class="epg-rail-edge" aria-hidden="true" :style="{ height: railStripH + 'px' }"></div>
                <div class="epg-rail-resizer" title="Drag to resize the channel rail"
                  :style="{ height: railStripH + 'px' }"
                  @pointerdown="onRailResizeDown"
                  @pointermove="onRailResizeMove"
                  @pointerup="onRailResizeUp"
                  @pointercancel="onRailResizeUp"></div>
              </div>
              <div class="epg-ruler-track" :style="{ width: trackWidth + 'px' }">
                <span v-for="t in ticks" :key="t.x" :class="['epg-tick', { half: t.half }]" :style="{ left: t.x + 'px' }">{{ t.label }}</span>
                <span class="epg-tick epg-midnight-tick" :style="{ left: midnightX + 'px' }"><calendar-icon /> {{ nextDayLabel }}</span>
                <span v-if="day === 0 && nowX != null" class="epg-now-pill" :style="{ left: Math.round(nowX) + 'px' }" aria-hidden="true">{{ nowPill }}</span>
              </div>
            </div>
            <div class="epg-midnight-line" aria-hidden="true" :style="{ left: 'calc(var(--epg-rail-px) + ' + midnightX + 'px)' }"></div>
            <div v-if="day === 6" class="epg-guide-end-lane" :style="{ left: 'calc(var(--epg-rail-px) + ' + midnightX + 'px)' }">
              <span class="epg-guide-end">Guide ends {{ lastDayLabel }}</span>
            </div>
            <transition-group name="epg-rows" tag="div" :class="['epg-rows', { 'is-filtering': filtering }]">
            <guide-row v-for="{ kind, key, label, shown, ch, pinIndex } in railItems" :key="key" v-show="shown"
              :kind="kind" :row-key="key" :label="label" :ch="ch" :pin-index="pinIndex" />
            </transition-group>
            <div v-if="day === 0 && nowX != null" class="epg-nowline" :style="{ left: 'calc(var(--epg-rail-px) + ' + nowX + 'px)' }"></div>
          </div>
          </div>
          <teleport to="body">
          <div v-if="narrow && !programmeSheetOpen && !channelsModal && !searchActive" class="epg-float-cluster" role="group" aria-label="Jump and zoom">
            <button type="button" class="epg-float-btn" @click="jumpNow">Now</button>
            <button type="button" class="epg-float-btn" @click="jumpTonight">Tonight</button>
            <button type="button" class="epg-float-btn epg-float-icon" aria-label="Zoom out"
              :disabled="zoomIndex === 0" @click="changeZoom(-1)"><minus-icon /></button>
            <button type="button" class="epg-float-btn epg-float-icon" aria-label="Zoom in"
              :disabled="zoomIndex === zoomLevelCount - 1" @click="changeZoom(1)"><plus-icon /></button>
          </div>
          </teleport>
        </div>
        <div v-if="guide" ref="legendEl" class="guide-legend guide-legend-strip">
          <template v-if="narrow">
            <span class="guide-legend-item"><span class="guide-legend-ring" aria-hidden="true"></span>Recording now</span>
            <span class="guide-legend-item"><span class="guide-legend-dot" aria-hidden="true"></span>Scheduled</span>
            <span class="guide-legend-item"><span class="guide-legend-dot is-watch" aria-hidden="true"></span>On watchlist</span>
          </template>
          <span v-if="stateMeta" class="guide-legend-meta">{{ stateMeta }}</span>
        </div>
      </template>

      <sort-announcer :message="sort.announcement.value" :keyboard-active="sort.keyboardActive.value" />
      <kind-filter-menu :filter="kindFilter" />

      <teleport to="body">
      <transition name="epg-tip">
      <div v-if="tooltip" ref="tooltipEl" class="epg-tooltip" aria-hidden="true">
        <div class="epg-tooltip-title">{{ tooltip.programme.title }}</div>
        <div v-if="tooltip.programme.episode_title || seLabel(tooltip.programme)" class="epg-tooltip-episode">
          <span v-if="seLabel(tooltip.programme)" class="epg-tooltip-se">{{ seLabel(tooltip.programme) }}</span>
          <span v-if="tooltip.programme.episode_title">{{ tooltip.programme.episode_title }}</span>
        </div>
        <div class="epg-tooltip-meta">{{ fmtProgrammeRange(tooltip.programme) }} · {{ tooltip.channel.name }}</div>
        <div v-if="recordingStateText(tooltip.programme)" :class="['epg-tooltip-state', cellState(tooltip.programme) || 'watching']">
          <span class="epg-tooltip-dot" aria-hidden="true"></span>
          {{ recordingStateText(tooltip.programme) }}
        </div>
        <p v-if="tooltip.programme.synopsis" class="epg-tooltip-synopsis">{{ tooltip.programme.synopsis }}</p>
      </div>
      </transition>
      </teleport>

      <teleport to="body">
      <transition name="ui-sheet">
      <channels-modal v-if="channelsModal" :channels="guide?.channels || []" :hidden-ids="guide?.hiddenIds || []"
        :sort="guide?.sort" :hide-sd-simulcasts="guide?.hideSdSimulcasts" :hide-sd-channels="guide?.hideSdChannels"
        :start-mode="channelsModalMode" @close="channelsModal = false" @saved="onChannelPrefsSaved" />
      </transition>
      </teleport>
    </div>
  `,
  setup() {
    const { flash } = useFlash()
    const { openProgramme } = useProgrammeSheet()
    const day = ref(0)
    const cachedToday = guideStore.cached()
    const guide = ref(cachedToday)
    const guideByDay = new Map(cachedToday ? [[0, cachedToday]] : [])
    const loading = ref(false)
    const error = ref('')
    const errorCode = ref('')
    const state = epgState
    const scrollEl = ref(null)
    const searchQ = ref('')
    const searchResults = ref([])
    const searching = ref(false)
    const channelsModal = ref(false)
    const channelsModalMode = ref('channels')
    const searchOpen = ref(false)

    const storedRailPx = () => {
      try {
        const px = Number(localStorage.getItem(EPG_RAIL_KEY))
        return Number.isFinite(px) && px > 0 ? clampRailPx(px) : GUIDE_RAIL_DEFAULT_PX
      } catch { return GUIDE_RAIL_DEFAULT_PX }
    }
    const narrow = useMediaQuery(PHONE_LAYOUT_QUERY)
    const railPx = ref(storedRailPx())
    const viewportW = ref(window.innerWidth)
    const railLayout = computed(() => railLayoutOf({
      shownPx: railShownPxOf({ railPx: railPx.value, viewportWidth: viewportW.value }),
      narrow: narrow.value,
    }))

    const zoom = storedChoice({ key: EPG_ZOOM_KEY, options: EPG_ZOOM_LEVELS.map((l) => l.key), fallback: 'm' })
    const zoomIndex = computed(() => EPG_ZOOM_LEVELS.findIndex((l) => l.key === zoom.value))
    const zoomLevel = computed(() => EPG_ZOOM_LEVELS[zoomIndex.value])
    const pxPerMin = computed(() => zoomLevel.value.pxPerMin)
    const trackWidth = computed(() => (guide.value ? spillLengthMin(guide.value) : 24 * 60) * pxPerMin.value)
    const midnightX = computed(() => (guide.value ? dayLengthMin(guide.value) : 24 * 60) * pxPerMin.value)
    const zooming = ref(false)

    const guideRowRem = computed(() => (narrow.value ? zoomLevel.value.narrowRowRem : zoomLevel.value.rowRem))

    const thumbMinCellPx = computed(() => {
      const thumbPx = ((guideRowRem.value * 16 - EPG_CELL_INSET_PX) * 16) / 9
      return Math.round(thumbPx) + EPG_THUMB_TEXT_MIN_PX
    })

    // Minute resolution on purpose: the seconds clock ref would otherwise
    // re-render every grid cell once a second (past/on-now classes read this).
    const nowMs = computed(() => Math.floor(now.value.getTime() / 60_000) * 60_000)

    const railFilter = ref('')
    const showImages = storedFlag({ key: EPG_IMAGES_KEY, fallback: true })
    const imagesLeaving = ref(false)
    const toggleImages = () => animateImagesToggle({
      scrollEl: scrollEl.value,
      flip: async () => {
        showImages.value = !showImages.value
        imagesLeaving.value = !showImages.value
        await nextTick()
        return !showImages.value
      },
      settle: () => { imagesLeaving.value = false },
    })

    const visibleChannels = computed(() =>
      (guide.value?.channels || []).filter((c) => !c.hidden))
    watch(visibleChannels, (channels) => {
      if (guide.value) rememberLineup({ channels, hideSdSimulcasts: guide.value.hideSdSimulcasts, hideSdChannels: guide.value.hideSdChannels })
    }, { immediate: true })

    // The filter hides rows with v-show instead of removing them from the
    // v-for: toggling display is a style flip, while remove-and-remount pays
    // for every programme cell again.
    const kindFilter = useKindFilter({ query: railFilter, nameLabel: (q) => `Channels named “${q}”` })

    const onFilterKeydown = (event) => {
      if (kindFilter.onKeydown(event) || event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      railFilter.value = ''
    }

    const channelAirsKind = ({ channel, kind }) => airsKindNowOrNext({
      ...airingPairOf({ programmes: guide.value?.programs?.[channel.id], nowMs: nowMs.value }),
      kind,
    })

    const channelNamed = ({ channel, q }) => (channel.name || '').toLowerCase().includes(q) || String(channel.number ?? '').startsWith(q)

    const railMatchIds = computed(() => {
      const q = railFilter.value.trim().toLowerCase()
      if (!q) return null
      const kind = kindFilter.activeKind.value
      const matches = kind
        ? (channel) => channelAirsKind({ channel, kind })
        : (channel) => channelNamed({ channel, q })
      return new Set(visibleChannels.value.filter(matches).map((c) => String(c.id)))
    })

    const filtering = ref(false)
    watch(railFilter, () => {
      filtering.value = true
      requestAnimationFrame(() => requestAnimationFrame(() => { filtering.value = false }))
    })

    const filterCountLabel = computed(() => {
      const n = railMatchIds.value?.size ?? 0
      return `Showing ${n} of ${visibleChannels.value.length} channels`
    })

    const rowShown = (ch) => !railMatchIds.value || railMatchIds.value.has(String(ch.id))

    const railItems = computed(() => {
      const shownChannels = visibleChannels.value.filter(rowShown)
      const groupShown = (pinned) => shownChannels.some((c) => Boolean(c.pinned) === pinned)
      const anyPinned = groupShown(true)
      const headedGroups = new Set()
      const groupHeading = (pinned) => ({
        kind: 'heading',
        key: pinned ? 'h-fav' : 'h-other',
        label: channelGroupLabel({ pinned, anyPinned }),
        shown: groupShown(pinned),
      })
      const pinnedIds = visibleChannels.value.filter((c) => c.pinned).map((c) => String(c.id))
      return visibleChannels.value.flatMap((ch) => {
        const pinned = Boolean(ch.pinned)
        const pinIndex = pinned ? pinnedIds.indexOf(String(ch.id)) : -1
        const entry = { kind: 'channel', key: String(ch.id), shown: rowShown(ch), ch, pinIndex }
        if (headedGroups.has(pinned)) return [entry]
        headedGroups.add(pinned)
        return [groupHeading(pinned), entry]
      })
    })

    const pinnedCount = computed(() => visibleChannels.value.filter((c) => c.pinned).length)

    const railNumWidth = computed(() =>
      Math.max(2, ...visibleChannels.value.map((c) => String(c.number ?? '').length)))
    const railNum = (ch) =>
      ch.number == null ? '' : String(ch.number).padStart(railNumWidth.value, '0')

    const ticks = computed(() => {
      if (!guide.value) return []
      const stepMin = zoomLevel.value.halfHourTicks ? 30 : 60
      const { dayStart, spillEnd } = guide.value
      const midnightMin = dayLengthMin(guide.value)
      return rulerTickMinutes({ dayStart, dayEnd: spillEnd, stepMin })
        .filter((min) => min !== midnightMin)
        .map((min) => ({
          x: min * pxPerMin.value,
          label: fmtClock(dayStart + min * 60_000),
          half: min % 60 !== 0,
        }))
    })

    const nowX = computed(() => {
      if (!guide.value) return null
      const x = ((nowMs.value - guide.value.dayStart) / 60_000) * pxPerMin.value
      return x >= 0 && x <= trackWidth.value ? x : null
    })

    const scrollViewW = ref(0)

    const loadingIds = computed(() => new Set(guide.value?.loadingListings || []))

    const loadingNoteMaxPx = computed(() => Math.max(scrollViewW.value - railPx.value - 24, 120))

    const trackTailPx = computed(() => {
      if (day.value !== 0 || nowX.value == null) return 0
      return Math.max(0, Math.ceil(nowX.value + scrollViewW.value * (1 - EPG_NOW_ANCHOR) - trackWidth.value))
    })

    const todayNumber = computed(() => localDayNumber({ ms: nowMs.value, timeZone: tz.value }))

    const dayChips = computed(() => Array.from({ length: 7 }, (_, d) => {
      if (d === 0) return { day: 0, label: 'Today' }
      return { day: d, label: weekdayOfDayNumber(todayNumber.value + d) }
    }))

    const noonOf = (ms) => new Date(ms + 12 * 3_600_000)
    const nextDayNoon = computed(() => noonOf(guide.value?.dayEnd ?? 0))
    const nextDayLabel = computed(() => formatDate(nextDayNoon.value.getTime(), tz.value))
    const nextDayWeekday = computed(() => dateFormat({ weekday: 'short' }).format(nextDayNoon.value))
    const nextDayLongLabel = computed(() => formatDate(nextDayNoon.value.getTime(), tz.value, { long: true }))
    const lastDayLabel = computed(() => formatDate(noonOf(guide.value?.dayStart ?? 0).getTime(), tz.value))

    const dateSubtitle = computed(() => {
      const middayOfDayNumber = (todayNumber.value + day.value) * 86_400_000 + 43_200_000
      return formatDate(middayOfDayNumber, 'UTC', { long: !narrow.value }).replace(',', '')
    })

    const scheduledCount = computed(() =>
      (state.value?.futureRecordings || []).filter((r) => !r.pendingDelete).length)

    const scheduledLabel = computed(() => `${scheduledCount.value} scheduled`)

    const stateMeta = computed(() => {
      if (!state.value) return ''
      const bits = [
        state.value.stale && 'TVHeadend is not answering',
        `${seriesTags.value.length} series`,
        state.value.tunerCount && `${state.value.tunerCount} tuner${state.value.tunerCount === 1 ? '' : 's'}`,
        state.value.storageInfo?.free && `${fmtBytes(state.value.storageInfo.free)} free`,
      ]
      return bits.filter(Boolean).join(' · ')
    })

    const searchActive = computed(() => searchOpen.value && searchQ.value.trim().length >= 2)

    const watchForOffer = computed(() => (searchActive.value
      ? watchForOfferOf({ query: searchQ.value, searching: searching.value, guideCount: searchResults.value.length })
      : null))

    const resultsLabel = computed(() => {
      const count = searchResults.value.length
      return `${count} result${count === 1 ? '' : 's'} for “${searchQ.value.trim()}”`
    })

    const nowPill = computed(() => clockWithoutPeriod(fmtClock(nowMs.value)))

    const fmtClock = fmtClockTz

    const fmtDayTime = (ms) => `${formatDate(ms, tz.value)} ${fmtClock(ms)}`

    const seLabel = seasonEpisodeOf

    const channelById = (id) =>
      (guide.value?.channels || []).find((c) => String(c.id) === String(id)) || null

    const channelName = (id) => channelById(id)?.name || `channel ${id}`

    const hasChannelLogo = (id) => Boolean(channelById(id)?.logos?.length)

    const cellMarks = (p) => cellMarksOf({
      state: p.past || p.end <= nowMs.value ? '' : cellState(p),
      seriesScheduled: !p.past && isSeriesScheduled(p),
      watching: !p.past && p.end > nowMs.value && isWatched(p),
    })

    const cellTitle = (p) => [p.title, recordingStateText(p)].filter(Boolean).join(' · ')

    const cellKey = (ch, p) => `${ch.id}|${p.program_id}|${p.start}`

    const cellX = (t) => {
      const clamped = Math.max(t, guide.value.dayStart)
      return ((clamped - guide.value.dayStart) / 60_000) * pxPerMin.value
    }

    const cellWidth = (p) => {
      const start = Math.max(p.start, guide.value.dayStart)
      const end = Math.min(p.end, guide.value.spillEnd)
      return Math.max(((end - start) / 60_000) * pxPerMin.value - 2, 6)
    }

    const cellShowsText = (p) => cellWidth(p) > EPG_CELL_TEXT_MIN_PX

    const cellArt = (p) => cellArtOf({ hasImage: p.has_image, widthPx: cellWidth(p), thumbMinPx: thumbMinCellPx.value })

    const cellHasThumb = (p) => cellArt(p) === 'own'

    const cellStyle = (p) => ({
      left: `${cellX(p.start)}px`,
      width: `${cellWidth(p)}px`,
    })

    const cellViewCache = computed(() => ({
      inputs: [
        guide.value, nowMs.value, pxPerMin.value, thumbMinCellPx.value, tz.value, watchedKeys.value,
        scheduledByProgramId.value, activeRecordingSet.value, seriesLinkSet.value, repeatByProgramId.value,
      ],
      views: new WeakMap(),
    }))

    const cellViewFor = (p) => {
      const art = cellArt(p)
      const playing = p.start <= nowMs.value && p.end > nowMs.value
      return {
        className: ['epg-cell', cellState(p), {
          past: p.past || p.end <= nowMs.value, 'on-now': playing, 'next-day': p.start >= guide.value.dayEnd,
          'with-thumb': art === 'own', 'maybe-thumb': art === 'fallback',
        }],
        style: cellStyle(p),
        title: cellTitle(p),
        art,
        showsText: cellShowsText(p),
        movieChip: zoom.value === 'l' && showsMovieChip(p),
        marks: cellMarks(p),
        clock: fmtClock(p.start),
      }
    }

    const cellViewOf = (p) => {
      const { views } = cellViewCache.value
      if (!views.has(p)) views.set(p, cellViewFor(p))
      return views.get(p)
    }

    const cellWindow = shallowRef(null)
    const rowBands = shallowRef([])
    const focusedCellKey = ref(null)

    const nearRowKeys = computed(() => (cellWindow.value
      ? nearRowKeysOf({ bands: rowBands.value, topPx: cellWindow.value.topPx, bottomPx: cellWindow.value.bottomPx })
      : new Set()))

    let previousCellsByRow = null
    const retainedFor = { guide: null, pxPerMin: null }
    const cellsByRow = computed(() => {
      const shown = cellWindow.value
      const current = guide.value
      if (!shown || !current || shown.dayStart !== current.dayStart) {
        previousCellsByRow = null
        return new Map()
      }
      const retain = retainedFor.guide === current && retainedFor.pxPerMin === pxPerMin.value
      retainedFor.guide = current
      retainedFor.pxPerMin = pxPerMin.value
      previousCellsByRow = windowedCellsByRow({
        retain,
        rows: visibleChannels.value.map((ch) => ({ key: String(ch.id), programmes: current.programs[ch.id] })),
        isNear: (key) => nearRowKeys.value.has(key),
        startMs: shown.startMs,
        endMs: shown.endMs,
        keepKey: focusedCellKey.value,
        keyOf: (row, p) => `${row.key}|${p.program_id}|${p.start}`,
        previous: previousCellsByRow,
      })
      return previousCellsByRow
    })

    const rowCells = (ch) => cellsByRow.value.get(String(ch.id)) || EPG_NO_CELLS

    const scrollGeometry = { railW: 0, viewW: 0, viewH: 0, rulerH: 0 }
    const scrollMotion = { left: 0, top: 0, leadX: 0, leadY: 0 }

    const measureScrollGeometry = () => {
      const el = scrollEl.value
      if (!el) return
      scrollGeometry.railW = railWidthOf(el)
      scrollGeometry.viewW = el.clientWidth
      scrollGeometry.viewH = el.clientHeight
      scrollGeometry.rulerH = el.querySelector('.epg-ruler')?.offsetHeight || 0
    }

    const trackViewWidth = () => Math.max(scrollGeometry.viewW - scrollGeometry.railW, 0)

    const scrollPosition = { left: 0, top: 0 }

    const readScrollPosition = (el) => {
      scrollPosition.left = el.scrollLeft
      scrollPosition.top = el.scrollTop
      return scrollPosition
    }

    const viewportOf = ({ left, top }) => ({
      leftMin: left / pxPerMin.value,
      widthMin: trackViewWidth() / pxPerMin.value,
      topPx: top,
      heightPx: scrollGeometry.viewH,
      leadX: scrollMotion.leadX,
      leadY: scrollMotion.leadY,
    })

    const aimCellWindow = (viewport) => {
      if (!guide.value) return
      const next = cellWindowOf({ dayStart: guide.value.dayStart, ...viewport })
      if (!sameCellWindow(cellWindow.value, next)) cellWindow.value = next
    }

    const syncCellWindow = () => {
      if (scrollEl.value) aimCellWindow(viewportOf(readScrollPosition(scrollEl.value)))
    }

    const measureRowBands = () => {
      measureScrollGeometry()
      const rows = scrollEl.value ? [...scrollEl.value.querySelectorAll('.epg-row')] : []
      rowBands.value = rows
        .filter((row) => row.offsetHeight > 0)
        .map((row) => ({
          key: row.dataset.channelId,
          top: row.offsetTop,
          bottom: row.offsetTop + row.offsetHeight,
          pinned: row.classList.contains('pinned'),
        }))
    }

    watch([railItems, zoom, narrow, scrollEl, railPx], measureRowBands, { flush: 'post' })
    watch(guide, () => requestAnimationFrame(syncCellWindow))

    const skeletonCardEl = ref(null)
    const skeletonRows = computed(() => guideSkeletonRows({ zoom: zoom.value }))
    const measureGridTop = () => {
      const card = scrollEl.value?.closest('.guide-card') ?? skeletonCardEl.value
      if (card) card.style.setProperty('--guide-grid-top', `${card.getBoundingClientRect().top + window.scrollY}px`)
    }
    watch([scrollEl, skeletonCardEl, guide, () => guide.value?.stale, narrow], measureGridTop, { flush: 'post' })

    const legendEl = ref(null)
    const setLegendHeight = () => {
      const height = narrow.value && legendEl.value ? legendEl.value.offsetHeight : 0
      document.documentElement.style.setProperty('--guide-legend-h', `${height}px`)
    }
    let legendRo = null
    watch(legendEl, (el) => {
      if (legendRo) { legendRo.disconnect(); legendRo = null }
      if (el) {
        legendRo = new ResizeObserver(setLegendHeight)
        legendRo.observe(el)
      }
      setLegendHeight()
    }, { flush: 'post' })
    watch(narrow, setLegendHeight, { flush: 'post' })
    onUnmounted(() => {
      if (legendRo) legendRo.disconnect()
      document.documentElement.style.removeProperty('--guide-legend-h')
    })

    let dayFreshAt = cachedToday ? todayFetchedAt : 0
    const rememberDay = (d, g) => {
      guideByDay.set(d, g)
      if (d !== 0) return
      guideStore.keep(g)
      todayFetchedAt = Date.now()
    }

    const loadDay = async (d, { force = false } = {}) => {
      error.value = ''
      errorCode.value = ''
      if (!force && guideByDay.has(d)) {
        guide.value = guideByDay.get(d)
        return
      }
      loading.value = true
      try {
        const g = await api('GET', `/api/epg/guide?day=${d}`)
        if (g.configured === false) {
          errorCode.value = 'no-url'
          return
        }
        rememberDay(d, g)
        dayFreshAt = Date.now()
        if (day.value === d) guide.value = g
      } catch (err) {
        error.value = `TV guide load failed: ${err.message}`
        errorCode.value = err.code || ''
      } finally {
        loading.value = false
      }
    }

    const loadState = loadEpgState

    const scrollToMs = async (ms, { anchor = 0, leadPx = 60 } = {}) => {
      await nextTick()
      if (!scrollEl.value || !guide.value) return
      scrollViewW.value = scrollEl.value.clientWidth
      await nextTick()
      const x = ((ms - guide.value.dayStart) / 60_000) * pxPerMin.value
      const trackWidth = scrollEl.value.clientWidth - railWidthOf(scrollEl.value)
      const offset = anchor ? trackWidth * anchor : leadPx
      scrollEl.value.scrollLeft = Math.max(0, x - offset)
      syncCellWindow()
    }

    const scrollToNow = () => scrollToMs(Date.now(), { anchor: EPG_NOW_ANCHOR })

    const clockOfDay = (hour) =>
      localClockMs({ dayStart: guide.value?.dayStart ?? 0, hour, timeZone: tz.value })

    const rollOverToToday = async () => {
      guideByDay.clear()
      await loadDay(0, { force: true })
      if (!searchActive.value) await scrollToNow()
    }

    watch(nowMs, (ms) => {
      if (day.value !== 0 || loading.value || !guide.value || ms < guide.value.dayEnd) return
      rollOverToToday()
    })

    const setDay = async (d, { atMs = null } = {}) => {
      day.value = d
      await loadDay(d)
      if (atMs != null) await scrollToMs(Math.max(atMs, guide.value?.dayStart ?? atMs), { leadPx: 0 })
      else if (d === 0) await scrollToNow()
      else await scrollToMs(clockOfDay(18))
    }

    const leftEdgeMs = () => guide.value.dayStart + (scrollEl.value.scrollLeft / pxPerMin.value) * 60_000

    const goToNextDay = () => setDay(day.value + 1, { atMs: leftEdgeMs() })

    const closeSearch = () => {
      searchOpen.value = false
      searchQ.value = ''
    }

    const toggleSearch = () => {
      if (searchOpen.value) closeSearch()
      else searchOpen.value = true
    }

    const pickDay = async (d) => {
      if (searchActive.value) closeSearch()
      await setDay(d)
    }

    const jumpNow = async () => {
      if (searchActive.value) closeSearch()
      if (day.value !== 0) await setDay(0)
      else await scrollToNow()
    }

    const jumpTonight = async () => {
      if (searchActive.value) closeSearch()
      if (day.value !== 0) { day.value = 0; await loadDay(0) }
      await scrollToMs(clockOfDay(19))
    }

    const railWidthOf = (el) => el.querySelector('.epg-ruler-corner')?.offsetWidth || 0

    const firstVisibleRow = (el) => {
      const top = el.scrollTop + (el.querySelector('.epg-ruler')?.offsetHeight || 0)
      const row = [...el.querySelectorAll('.epg-row')]
        .find((r) => r.offsetHeight > 0 && r.offsetTop + r.offsetHeight > top)
      return row ? { el: row, offset: row.offsetTop - el.scrollTop } : null
    }

    const captureZoomAnchor = (el) => {
      const viewW = el.clientWidth - railWidthOf(el)
      const nowOnScreen = day.value === 0 && nowX.value != null
        && nowX.value >= el.scrollLeft && nowX.value <= el.scrollLeft + viewW
      const screenX = nowOnScreen ? nowX.value - el.scrollLeft : viewW / 2
      return { minutes: (el.scrollLeft + screenX) / pxPerMin.value, screenX, row: firstVisibleRow(el) }
    }

    const zoomedViewport = ({ el, anchor, pxPerMin }) => ({
      leftMin: anchor.minutes - anchor.screenX / pxPerMin,
      widthMin: Math.max(el.clientWidth - railWidthOf(el), 0) / pxPerMin,
      topPx: el.scrollTop,
      heightPx: el.clientHeight,
    })

    const restoreZoomAnchor = (el, { minutes, screenX, row }) => {
      el.scrollLeft = minutes * pxPerMin.value - screenX
      if (row) el.scrollTop = row.el.offsetTop - row.offset
    }

    const changeZoom = async (step) => {
      const level = EPG_ZOOM_LEVELS[zoomIndex.value + step]
      if (!level) return
      const el = scrollEl.value
      const anchor = el && guide.value ? captureZoomAnchor(el) : null
      zooming.value = true
      if (anchor) aimCellWindow(zoomedViewport({ el, anchor, pxPerMin: level.pxPerMin }))
      zoom.value = level.key
      await nextTick()
      if (anchor) restoreZoomAnchor(el, anchor)
      syncCellWindow()
      requestAnimationFrame(() => { zooming.value = false })
    }

    const setZoom = (key) => changeZoom(EPG_ZOOM_LEVELS.findIndex((l) => l.key === key) - zoomIndex.value)

    const refreshDayQuietly = async ({ withState = true } = {}) => {
      const d = day.value
      try {
        const g = await api('GET', `/api/epg/guide?day=${d}`)
        if (g.configured === false) return
        guideByDay.clear()
        rememberDay(d, g)
        dayFreshAt = Date.now()
        if (day.value === d) guide.value = g
      } catch {
        return
      }
      if (!withState) return
      loadState({ fresh: true })
      loadWatchlist()
    }

    const isDayStale = () => Date.now() - dayFreshAt >= GUIDE_AUTO_REFRESH_MS
    const refreshDayIfStale = () => {
      if (document.hidden || loading.value || !guide.value || guide.value.loadingListings?.length) return
      if (isDayStale()) refreshDayQuietly()
    }

    const openProgram = (p, channel) => openProgramme({ channelId: channel?.id ?? p.channelId, programme: p, channel, guideDay: guide.value })

    const rowNearTop = (channelId) => scrollEl.value?.querySelector(`.epg-row[data-channel-id="${CSS.escape(String(channelId))}"]`)

    const followGuideJump = async () => {
      const jump = guideJump.value
      if (!jump) return false
      guideJump.value = null
      await setDay(jump.dayOffset ?? 0, { atMs: jump.atMs })
      const row = rowNearTop(jump.channelId)
      if (row && scrollEl.value) {
        scrollEl.value.scrollTop = Math.max(0, row.offsetTop - (scrollEl.value.querySelector('.epg-ruler')?.offsetHeight || 0))
        syncCellWindow()
      }
      return true
    }

    const reloadGuide = async () => {
      guideByDay.clear()
      await loadDay(day.value, { force: true })
    }

    const currentPins = () => (guide.value?.channels || [])
      .filter((c) => c.pinned)
      .map((c) => String(c.id))

    const channelNameOf = (id) => channelById(id)?.name || 'Channel'

    const applyPinOrder = (pins) => {
      if (!guide.value) return
      guide.value = {
        ...guide.value,
        channels: arrangeByOrder({ items: guide.value.channels || [], order: pins, idOf: (c) => String(c.id) }),
      }
    }

    const orderSave = useFavouriteOrderSave({ currentPins, applyOrder: applyPinOrder, reload: reloadGuide })

    const canEditOrder = computed(() => canEditOrderOf({ narrow: narrow.value, filter: railFilter.value, pinnedCount: pinnedCount.value }))
    const { editing: editingOrder, sortable: canSort, toggle: toggleOrderEditing, stop: stopOrderEditing } = useOrderEditing({ canEdit: canEditOrder })

    const sort = useSortable({
      listEl: () => scrollEl.value?.querySelector('.epg-rows'),
      ids: () => visibleChannels.value.filter((c) => c.pinned).map((c) => String(c.id)),
      nameOf: channelNameOf,
      onDrop: orderSave.onDrop,
      liftScale: 1,
      edgeInsetTop: () => scrollEl.value?.querySelector('.epg-ruler')?.offsetHeight || 0,
    })

    const pinsOffscreen = ref(false)

    const updatePinsOffscreen = () => {
      const el = scrollEl.value
      pinsOffscreen.value = Boolean(el)
        && pinsScrolledAway({ bands: rowBands.value, scrollTop: scrollPosition.top, rulerHeight: scrollGeometry.rulerH })
    }

    const scrollRailTop = () => scrollEl.value?.scrollTo({ top: 0, behavior: 'smooth' })

    const midnightOnScreen = ref(false)

    const updateMidnightOnScreen = () => {
      const el = scrollEl.value
      midnightOnScreen.value = Boolean(el && guide.value)
        && spanOnScreen({ x: midnightX.value, scrollLeft: scrollPosition.left, viewWidth: trackViewWidth() })
    }

    const updateFloatingChips = () => {
      updatePinsOffscreen()
      updateMidnightOnScreen()
    }

    watch([midnightX, guide], () => nextTick(updateMidnightOnScreen))
    watch(rowBands, updatePinsOffscreen)

    const railEdgeSlackMs = () => (trackViewWidth() / 4 / pxPerMin.value) * 60_000

    let railEdgeKeys = new Set()

    const railEdgeKeysNow = () => {
      const el = scrollEl.value
      const keys = new Set()
      if (!el || !guide.value) return keys
      const edgeMs = guide.value.dayStart + (scrollPosition.left / pxPerMin.value) * 60_000
      const slackMs = railEdgeSlackMs()
      const rowsNearView = nearRowKeysOf({
        bands: rowBands.value,
        topPx: scrollPosition.top - scrollGeometry.viewH / 2,
        bottomPx: scrollPosition.top + scrollGeometry.viewH * 1.5,
      })
      for (const [rowKey, cells] of cellsByRow.value) {
        if (!rowsNearView.has(rowKey)) continue
        for (const programme of cells) {
          if (crossesRailEdge({ programme, edgeMs, slackMs })) keys.add(`${rowKey}|${programme.program_id}|${programme.start}`)
        }
      }
      return keys
    }

    const cellElementOf = (key) => scrollEl.value?.querySelector(`.epg-cell[data-key="${CSS.escape(key)}"]`)

    const markRailEdges = () => {
      const keys = railEdgeKeysNow()
      for (const key of railEdgeKeys) if (!keys.has(key)) cellElementOf(key)?.removeAttribute(RAIL_EDGE_ATTRIBUTE)
      for (const key of keys) if (!railEdgeKeys.has(key)) cellElementOf(key)?.setAttribute(RAIL_EDGE_ATTRIBUTE, '')
      railEdgeKeys = keys
    }

    const markAllRailEdges = () => {
      railEdgeKeys = railEdgeKeysNow()
      for (const cell of scrollEl.value?.querySelectorAll('.epg-cell') || []) {
        const atEdge = railEdgeKeys.has(cell.dataset.key)
        if (cell.hasAttribute(RAIL_EDGE_ATTRIBUTE) !== atEdge) cell.toggleAttribute(RAIL_EDGE_ATTRIBUTE, atEdge)
      }
    }

    watch([cellsByRow, rowBands, zoom, showImages], markAllRailEdges, { flush: 'post' })

    let scrollFrame = 0

    const followScroll = () => {
      scrollFrame = 0
      const el = scrollEl.value
      if (!el) return
      const { left, top } = readScrollPosition(el)
      scrollMotion.leadX = scrollLeadOf({ delta: left - scrollMotion.left, previous: scrollMotion.leadX })
      scrollMotion.leadY = scrollLeadOf({ delta: top - scrollMotion.top, previous: scrollMotion.leadY })
      scrollMotion.left = left
      scrollMotion.top = top
      aimCellWindow(viewportOf(scrollPosition))
      markRailEdges()
      updateFloatingChips()
    }

    const onGridScroll = () => {
      if (!scrollFrame) scrollFrame = requestAnimationFrame(followScroll)
    }

    const railStripH = ref(0)
    const scrollbarW = ref(0)
    const syncScrollSize = () => {
      railStripH.value = scrollEl.value?.clientHeight || 0
      scrollbarW.value = scrollEl.value ? scrollEl.value.offsetWidth - scrollEl.value.clientWidth : 0
      scrollViewW.value = scrollEl.value?.clientWidth || 0
      viewportW.value = window.innerWidth
    }

    let scrollRo = null
    watch(scrollEl, (el, prev) => {
      if (prev) prev.removeEventListener('scroll', onGridScroll)
      if (scrollRo) { scrollRo.disconnect(); scrollRo = null }
      if (el) {
        el.addEventListener('scroll', onGridScroll, { passive: true })
        scrollRo = new ResizeObserver(() => { syncScrollSize(); measureRowBands(); syncCellWindow(); updateFloatingChips() })
        scrollRo.observe(el)
        const rowsEl = el.querySelector('.epg-rows')
        if (rowsEl) scrollRo.observe(rowsEl)
      }
      syncScrollSize()
      updateFloatingChips()
    })
    onUnmounted(() => {
      if (scrollRo) scrollRo.disconnect()
      cancelAnimationFrame(scrollFrame)
    })

    const railResize = { active: false, startX: 0, startW: 0 }

    const onRailResizeDown = (e) => {
      e.preventDefault()
      setDragLock(true)
      try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ignore */ }
      railResize.active = true
      railResize.startX = e.clientX
      railResize.startW = railPx.value
    }

    const onRailResizeMove = (e) => {
      if (!railResize.active) return
      railPx.value = clampRailPx(railResize.startW + e.clientX - railResize.startX)
    }

    const onRailResizeUp = () => {
      setDragLock(false)
      if (!railResize.active) return
      railResize.active = false
      try { localStorage.setItem(EPG_RAIL_KEY, String(railPx.value)) } catch { /* private mode */ }
    }

    const togglePin = async (ch) => {
      const pinnedIds = (guide.value?.channels || []).filter((c) => c.pinned).map((c) => String(c.id))
      try {
        await togglePinnedChannel({ pinnedIds, channelId: ch.id })
        await reloadGuide()
      } catch (err) {
        flash({ msg: `Favourite failed: ${err.message}`, kind: 'error' })
      }
    }

    const openChannelsModal = () => {
      channelsModalMode.value = 'channels'
      channelsModal.value = true
    }

    const openOrderEditor = () => {
      channelsModalMode.value = 'order'
      channelsModal.value = true
    }

    const onChannelPrefsSaved = async () => {
      channelsModal.value = false
      await reloadGuide()
      flash({ msg: CHANNELS_SAVED_TEXT })
    }

    let listingsTimer = null
    const refreshWhileListingsLoad = () => {
      clearTimeout(listingsTimer)
      if (!guide.value?.loadingListings?.length) return
      listingsTimer = setTimeout(async () => {
        const d = day.value
        try {
          const g = await api('GET', `/api/epg/guide?day=${d}`)
          if (!g.loadingListings?.length) guideByDay.clear()
          rememberDay(d, g)
          if (day.value === d) guide.value = g
        } catch {
          refreshWhileListingsLoad()
        }
      }, LISTINGS_REFRESH_MS)
    }
    watch(guide, refreshWhileListingsLoad)
    onUnmounted(() => clearTimeout(listingsTimer))

    const tooltip = ref(null)
    const tooltipEl = ref(null)
    const hover = { cell: null, anchor: null, timer: 0, frame: 0, x: 0, y: 0 }

    const programmeByKey = computed(() => {
      const map = new Map()
      for (const ch of guide.value?.channels || []) {
        for (const p of guide.value.programs[ch.id] || []) map.set(cellKey(ch, p), { programme: p, channel: ch })
      }
      return map
    })

    const fmtWeekdayClock = (ms) => `${dateFormat({ weekday: 'short' }).format(new Date(ms))} ${fmtClock(ms)}`

    const fmtProgrammeRange = (p) => {
      const crossesMidnight = dayKey(p.start) !== dayKey(p.end - 1)
      return crossesMidnight
        ? `${fmtWeekdayClock(p.start)}–${fmtWeekdayClock(p.end)}`
        : `${fmtClock(p.start)}–${fmtClock(p.end)}`
    }

    const cellIsTruncated = (cell) => {
      const title = cell.querySelector('.epg-cell-title')
      if (!title) return true
      return title.scrollWidth > title.clientWidth + 1
    }

    const clampToViewport = (value, size, viewport) =>
      Math.min(Math.max(value, EPG_TOOLTIP_EDGE_PX), viewport - EPG_TOOLTIP_EDGE_PX - size)

    const besidePointer = ({ width, height }) => {
      const right = hover.x + EPG_TOOLTIP_GAP_PX
      const below = hover.y + EPG_TOOLTIP_GAP_PX
      const fitsRight = right + width <= window.innerWidth - EPG_TOOLTIP_EDGE_PX
      const fitsBelow = below + height <= window.innerHeight - EPG_TOOLTIP_EDGE_PX
      return {
        x: fitsRight ? right : hover.x - EPG_TOOLTIP_GAP_PX - width,
        y: fitsBelow ? below : hover.y - EPG_TOOLTIP_GAP_PX - height,
      }
    }

    const besideCell = ({ height }) => {
      const rect = hover.anchor.getBoundingClientRect()
      const below = rect.bottom + EPG_TOOLTIP_EDGE_PX
      const fitsBelow = below + height <= window.innerHeight - EPG_TOOLTIP_EDGE_PX
      return { x: rect.left, y: fitsBelow ? below : rect.top - EPG_TOOLTIP_EDGE_PX - height }
    }

    const placeTooltip = () => {
      hover.frame = 0
      const el = tooltipEl.value
      if (!el) return
      const size = { width: el.offsetWidth, height: el.offsetHeight }
      const { x, y } = hover.anchor ? besideCell(size) : besidePointer(size)
      const left = clampToViewport(x, size.width, window.innerWidth)
      const top = clampToViewport(y, size.height, window.innerHeight)
      el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
    }

    const schedulePlacement = () => {
      if (!hover.frame) hover.frame = requestAnimationFrame(placeTooltip)
    }

    const hideTooltip = () => {
      clearTimeout(hover.timer)
      cancelAnimationFrame(hover.frame)
      hover.timer = 0
      hover.frame = 0
      tooltip.value = null
    }

    const forgetHoveredCell = () => {
      hideTooltip()
      hover.cell = null
      hover.anchor = null
    }

    const showTooltipFor = async (cell) => {
      const entry = programmeByKey.value.get(cell.dataset.key)
      if (!entry) return
      tooltip.value = entry
      await nextTick()
      placeTooltip()
    }

    const enterCell = (cell) => {
      hideTooltip()
      hover.cell = cell
      hover.anchor = null
      if (!cell || !cellIsTruncated(cell)) return
      hover.timer = setTimeout(() => showTooltipFor(cell), EPG_TOOLTIP_DELAY_MS)
    }

    const onGridPointer = (e) => {
      if (e.pointerType !== 'mouse') return
      hover.x = e.clientX
      hover.y = e.clientY
      const cell = e.target.closest?.('.epg-cell') || null
      if (cell !== hover.cell) return enterCell(cell)
      if (tooltip.value && !hover.anchor) schedulePlacement()
    }

    const onGridPointerOut = (e) => {
      if (e.pointerType !== 'mouse' || hover.anchor) return
      if (hover.cell?.contains(e.relatedTarget)) return
      forgetHoveredCell()
    }

    const onGridFocusIn = (e) => {
      const cell = e.target.closest?.('.epg-cell')
      if (cell) focusedCellKey.value = cell.dataset.key
      if (!cell || !cell.matches(':focus-visible') || !cellIsTruncated(cell)) return forgetHoveredCell()
      hideTooltip()
      hover.cell = cell
      hover.anchor = cell
      showTooltipFor(cell)
    }

    const onGridFocusOut = () => {
      if (hover.anchor) forgetHoveredCell()
    }

    const onAnyScroll = () => {
      if (hover.anchor && tooltip.value) return schedulePlacement()
      forgetHoveredCell()
    }

    watch([programmeSheetOpen, channelsModal, zoom, guide, searchActive], forgetHoveredCell)

    let searchTimer = null
    watch(searchQ, () => {
      if (searchTimer) clearTimeout(searchTimer)
      if (!searchActive.value) { searchResults.value = []; return }
      searching.value = true
      searchTimer = setTimeout(async () => {
        try {
          const r = await api('GET', `/api/epg/search?q=${encodeURIComponent(searchQ.value.trim())}`)
          searchResults.value = r.results || []
        } catch {
          searchResults.value = []
        } finally {
          searching.value = false
        }
      }, EPG_SEARCH_DEBOUNCE_MS)
    })

    watch(searchActive, async (active, wasActive) => {
      if (active || !wasActive) return
      if (day.value === 0) await scrollToNow()
      else await scrollToMs(clockOfDay(18))
    })

    const onKeydown = (e) => {
      if (e.key !== 'Escape') return
      if (channelsModal.value) channelsModal.value = false
      else if (searchOpen.value) closeSearch()
      else if (!stopOrderEditing()) return
      e.preventDefault()
    }

    watch(recordingChangeTick, () => loadState({ fresh: true }))

    let statePollTimer = null
    let staleCheckTimer = null
    onMounted(async () => {
      window.addEventListener('keydown', onKeydown)
      window.addEventListener('resize', measureGridTop)
      window.addEventListener('scroll', onAnyScroll, { capture: true, passive: true })
      loadState()
      loadWatchlist()
      loadLibraryDefault()
      await loadDay(0)
      const jumped = await followGuideJump()
      if (!jumped && day.value === 0) await scrollToNow()
      const cacheOutdated = Date.now() - todayFetchedAt >= GUIDE_REVISIT_REFRESH_MS || channelPrefsChangedSince(todayFetchedAt)
      if (cachedToday && day.value === 0 && cacheOutdated) {
        refreshDayQuietly({ withState: false })
      }
      statePollTimer = setInterval(loadState, EPG_STATE_POLL_MS)
      staleCheckTimer = setInterval(refreshDayIfStale, GUIDE_STALE_CHECK_MS)
      document.addEventListener('visibilitychange', refreshDayIfStale)
    })
    onUnmounted(() => {
      window.removeEventListener('keydown', onKeydown)
      window.removeEventListener('resize', measureGridTop)
      window.removeEventListener('scroll', onAnyScroll, { capture: true })
      hideTooltip()
      if (statePollTimer) clearInterval(statePollTimer)
      clearInterval(staleCheckTimer)
      document.removeEventListener('visibilitychange', refreshDayIfStale)
      if (searchTimer) clearTimeout(searchTimer)
    })

    provide(GUIDE_IMAGES_ON, showImages)
    provide(GUIDE_ROW_CONTEXT, {
      narrow, pinnedCount, openOrderEditor, canSort, sort, railNum, togglePin,
      canEditOrder, editingOrder, toggleOrderEditing, railLayout,
      trackWidth, loadingIds, LISTINGS_LOADING_TEXT, nowX, loadingNoteMaxPx, guide, nowMs,
      rowCells, cellViewOf, cellKey, openProgram,
    })

    return {
      skeletonCardEl, skeletonRows,
      day, dayChips, dateSubtitle, setDay, pickDay, LISTINGS_LOADING_TEXT,
      loadingIds, loadingNoteMaxPx,
      guide, loading, error, errorCode, loadDay, state, stateMeta, scheduledCount, scheduledLabel, scheduledHref: SCHEDULED_HREF,
      scrollEl, legendEl, railPx, trackWidth, trackTailPx, railStripH, scrollbarW, railNumWidth, ticks, nowX, nowMs, nowPill,
      zoom, zoomIndex, zoomLevels: EPG_ZOOM_LEVELS, zoomLevelCount: EPG_ZOOM_LEVELS.length, zooming, thumbMinCellPx, guideRowRem, changeZoom, setZoom,
      tooltip, tooltipEl, hideTooltip, onGridPointer, onGridPointerOut, onGridFocusIn, onGridFocusOut,
      recordingStateText, fmtProgrammeRange, cellKey, cellShowsText, cellMarks, watchedKeys,
      visibleChannels, railNum, railFilter, railMatchIds, kindFilter, onFilterKeydown, filterCountLabel, filtering, pinnedCount, pinsOffscreen, scrollRailTop,
      midnightX, midnightOnScreen, goToNextDay, nextDayLabel, nextDayWeekday, nextDayLongLabel, lastDayLabel,
      cellState, cellStyle, cellWidth, cellTitle, isSeriesScheduled,
      jumpNow, jumpTonight,
      searchOpen, toggleSearch, closeSearch, searchQ, searchActive, searchResults, searching, resultsLabel, watchForOffer, openWatchFor,
      openProgram, programmeSheetOpen,
      channelsModal, channelsModalMode, openChannelsModal, openOrderEditor, onChannelPrefsSaved,
      togglePin, railItems, narrow, showImages, toggleImages, imagesLeaving, cellHasThumb,
      canSort, railLayout, sort,
      onRailResizeDown, onRailResizeMove, onRailResizeUp,
      channelById, channelName, hasChannelLogo, fmtClock, fmtDayTime, seLabel,
    }
  },
}
