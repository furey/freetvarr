import {
  ref,
  computed,
  onMounted,
  onUnmounted,
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
import { findSeriesLink } from '/series-link.js'
import { findHdSimulcast } from '/simulcast.js'
import { recordingProgramIdsOf } from '/live-record.js'
import { recordedMsOf, stopRecordingOutcome } from '/stop-recording.js'
import { seasonEpisodeOf } from '/live-info.js'
import { formatDate } from '/time-format.js'
import {
  SHEET_KEEP_STEPS,
  SHEET_LAG_STEPS,
  SHEET_LEAD_STEPS,
  activeWatchItemFor,
  canStep,
  cellMarksOf,
  clockWithoutPeriod,
  initialStrengthOf,
  keepLabel,
  minutesShort,
  primaryActionOf,
  seasonEpisodeShort,
  sheetMetaLineOf,
  sheetStrengthsFor,
  stepValue,
  strengthLineOf,
  watchedKeysOf,
} from '/programme-sheet.js'
import { showKeyOf } from '/show-key.js'
import { channelGroupLabel } from '/components/channel-identity.js'
import { togglePinnedChannel } from '/components/channels-modal.js'
import { keepFocusInside } from '/components/ui-sheet.js'
import { api, fetchSettings } from '/shared/api.js'
import { useMediaQuery, useFlash } from '/shared/composables.js'
import { EPG_NARROW_QUERY, CHANNELS_SAVED_TEXT } from '/shared/constants.js'
import { fmtBytes } from '/shared/format.js'
import { liveChannelOf, watchLive } from '/shared/live-session.js'
import { makeStatus } from '/shared/path-check.js'
import { setDragLock, usePinDrag } from '/shared/pin-drag.js'
import { live } from '/shared/player-shared.js'
import { episodeRecordingFor, stopOutcomeFor } from '/shared/recording-helpers.js'
import {
  recordingNow,
  recordingChangeTick,
  refreshAfterRecordingChange,
} from '/shared/recording-now.js'
import { storedFlag, storedChoice } from '/shared/storage.js'
import { guideHandoff, recordDialogOverPlayer } from '/shared/store.js'
import { tz, dateFormat, now, fmtClockTz, tsOfMs } from '/shared/time.js'

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
const EPG_RAIL_DEFAULT_PX = 200
const EPG_RAIL_MIN_PX = 90
const EPG_RAIL_MAX_PX = 320
const EPG_RAIL_KEY = 'freetvarr.epgRailPx'
const EPG_IMAGES_KEY = 'freetvarr.guideImages'

const EPG_STATE_POLL_MS = 60_000
const LISTINGS_REFRESH_MS = 10_000
const LISTINGS_LOADING_TEXT = 'Loading the new listings. This can take a couple of minutes.'

const EPG_SEARCH_DEBOUNCE_MS = 300
const SCHEDULED_HREF = '#/recordings/scheduled'

const ANY_CHANNEL_HINT = 'Records this series whichever channel airs it, for example when it moves from 7 to 7mate. Episodes it already has are not recorded again.'

export const EpgView = {
  template: `
    <div class="ui-page guide-page view-reveal">
      <page-header title="Guide" :subtitle="dateSubtitle" :widgets="false">
        <template #actions>
          <a href="#/recordings/scheduled" class="guide-scheduled-chip" :aria-label="scheduledLabel + '. Open Scheduled'">
            <span class="guide-scheduled-dot" aria-hidden="true"></span>{{ scheduledLabel }}
          </a>
          <recording-chip />
          <health-dot />
          <button type="button" class="ui-icon-button" aria-label="Channels" title="Channels" :disabled="!guide" @click="openChannelsModal"><sliders-icon /></button>
          <button type="button" class="ui-icon-button" :aria-label="searchOpen ? 'Close search' : 'Search the next 7 days'"
            :title="searchOpen ? 'Close search' : 'Search the next 7 days'" :aria-expanded="String(searchOpen)" @click="toggleSearch">
            <close-glyph v-if="searchOpen" /><search-glyph v-else />
          </button>
        </template>
        <template #below>
          <recording-chip variant="banner" />
          <health-dot variant="banner" />
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
          <button v-if="!narrow" type="button" class="ui-icon-button is-plain" aria-label="Refresh the guide" title="Refresh the guide"
            :disabled="loading" @click="manualRefresh"><refresh-icon /></button>
          <span class="guide-toolbar-spacer"></span>
          <button type="button" role="switch" class="guide-images-toggle" :aria-checked="String(showImages)" @click="showImages = !showImages">
            Images<span class="guide-switch" aria-hidden="true"></span>
          </button>
          <div class="ui-segmented is-compact guide-zoom" role="group" aria-label="Zoom">
            <span class="ui-segmented-label" aria-hidden="true">Zoom</span>
            <button v-for="level in zoomLevels" :key="level.key" type="button" class="ui-segment"
              :aria-pressed="String(zoom === level.key)" :aria-label="level.label + ' zoom'" @click="setZoom(level.key)">{{ level.key.toUpperCase() }}</button>
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
      </section>

      <template v-else>
        <p v-if="guide?.stale" class="ui-banner is-warning">
          <span class="ui-dot is-warn"></span>
          <span class="ui-banner-text">Showing the saved guide. TVHeadend did not answer, so Freetvarr tries again shortly.</span>
        </p>
        <div v-if="errorCode === 'no-url'" class="ui-empty">
          <h2 class="ui-empty-title">Connect TVHeadend</h2>
          <p class="ui-empty-text">Set the TVHeadend address in Settings to see the guide.</p>
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
          <h2 class="ui-empty-title">The guide did not load</h2>
          <p class="ui-empty-text">{{ error }} Check the TVHeadend connection in <a href="#/settings/system/tvheadend">Settings</a>.</p>
          <button type="button" class="ui-button ui-button-secondary" @click="loadDay(day, { force: true })">Try again</button>
        </div>
        <list-skeleton v-else-if="loading && !guide" class="guide-card" :rows="10" :row-height="guideRowRem + 'rem'" guide :guide-zoom="zoom" />
        <div v-else-if="guide" class="guide-card" :style="{ '--epg-rail-px': 'min(' + railPx + 'px, 38vw)' }">
          <div class="epg-grid-edge" aria-hidden="true" :style="{ height: railStripH + 'px', right: scrollbarW + 'px' }"></div>
          <button v-if="pinsOffscreen" type="button" class="epg-pinned-chip" @click="scrollRailTop"><arrow-up-icon /> {{ pinnedCount }} favourite{{ pinnedCount === 1 ? '' : 's' }}</button>
          <button v-if="midnightOnScreen && day < 6" type="button" class="epg-pinned-chip epg-next-day-chip"
            :style="{ right: 'calc(' + scrollbarW + 'px + 0.5rem)' }" :aria-label="'Go to ' + nextDayLongLabel"
            @click="goToNextDay">{{ narrow ? nextDayWeekday : nextDayLabel }} <chevron-right-icon /></button>
          <div :class="['epg-scroll', 'epg-zoom-' + zoom, { 'epg-zooming': zooming }]" ref="scrollEl"
            @pointerover="onGridPointer" @pointermove="onGridPointer" @pointerout="onGridPointerOut"
            @pointerdown="hideTooltip" @focusin="onGridFocusIn" @focusout="onGridFocusOut">
          <div class="epg-canvas" :style="{ width: 'calc(var(--epg-rail-px) + ' + (trackWidth + trackTailPx) + 'px)' }">
            <div class="epg-ruler">
              <div class="epg-ruler-corner">
                <input v-no-autofill v-model="railFilter" type="search" class="epg-corner-filter"
                  :placeholder="narrow ? 'Filter' : 'Filter channels'" aria-label="Filter channels by number or name" />
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
            <transition-group name="epg-rows" tag="div">
            <div v-for="{ kind, key, label, shown, ch } in railItems" :key="key"
              v-show="shown"
              v-memo="[ch, label, shown, loadingIds.has(ch?.id), loadingNoteMaxPx, nowMs, state, watchedKeys, railNumWidth, showImages, zoom, thumbMinCellPx, dropTargetId === key, dropTargetId === key && dropAfter, dragPinId === key]"
              :data-channel-id="ch?.id"
              :class="kind === 'heading' ? 'epg-heading-row' : ['epg-row', { pinned: ch.pinned, 'epg-drop-target': dropTargetId === key, 'epg-drop-after': dropAfter && dropTargetId === key, 'epg-dragging': dragPinId === key }]">
              <template v-if="kind === 'heading'">
                <div class="epg-heading-rail"><span class="channel-group-heading">{{ label }}</span></div>
                <div class="epg-heading-track"></div>
              </template>
              <template v-else>
              <div :class="['epg-rail-cell', { 'off-air': ch.offAir }]"
                :title="ch.pinned ? 'Drag to reorder favourites' : null"
                @pointerdown="onPinPointerDown(ch, $event)"
                @pointermove="onPinPointerMove"
                @pointerup="onPinPointerUp"
                @pointercancel="onPinPointerCancel">
                <channel-identity :channel="ch" :has-logo="Boolean(ch.logos?.length)" :number="railNum(ch)" @pin="togglePin(ch)" />
              </div>
              <div class="epg-track" :style="{ width: trackWidth + 'px' }">
                <span v-if="loadingIds.has(ch.id)" class="epg-loading-note" role="status"
                  :title="LISTINGS_LOADING_TEXT"
                  :style="{ left: (nowX ?? 0) + 8 + 'px', maxWidth: loadingNoteMaxPx + 'px' }">{{ LISTINGS_LOADING_TEXT }}</span>
                <button v-for="p in guide.programs[ch.id]" :key="p.program_id + '-' + p.start" type="button"
                  :class="['epg-cell', cellState(p), { past: p.past || p.end <= nowMs, 'on-now': p.start <= nowMs && p.end > nowMs, 'next-day': p.start >= guide.dayEnd, 'with-thumb': cellHasThumb(p) }]"
                  :style="cellStyle(p)" :aria-label="cellTitle(p)" :data-key="cellKey(ch, p)"
                  @click="openProgram(p, ch)">
                  <programme-image v-if="cellHasThumb(p)" :event-id="p.program_id" variant="cell"
                    :channel-id="ch.id" :has-logo="Boolean(ch.logos?.length)" :title="p.title" />
                  <span v-if="cellShowsText(p)" class="epg-cell-text">
                    <span class="epg-cell-title"><span v-if="cellMarks(p).scheduledDot" class="epg-cell-dot is-inline" aria-hidden="true"></span><span v-else-if="cellMarks(p).watchDot" class="epg-cell-dot is-inline is-watch" aria-hidden="true"></span>{{ p.title }}</span>
                    <span class="epg-cell-meta">{{ fmtClock(p.start) }}</span>
                  </span>
                  <template v-else>
                    <span v-if="cellMarks(p).scheduledDot" class="epg-cell-dot" aria-hidden="true"></span>
                    <span v-else-if="cellMarks(p).watchDot" class="epg-cell-dot is-watch" aria-hidden="true"></span>
                  </template>
                </button>
              </div>
              </template>
            </div>
            </transition-group>
            <div v-if="day === 0 && nowX != null" class="epg-nowline" :style="{ left: 'calc(var(--epg-rail-px) + ' + nowX + 'px)' }"></div>
          </div>
          </div>
          <teleport to="body">
          <div v-if="narrow && !selected && !channelsModal && !searchActive" class="epg-float-cluster" role="group" aria-label="Jump and zoom">
            <button type="button" class="epg-float-btn" @click="jumpNow">Now</button>
            <button type="button" class="epg-float-btn" @click="jumpTonight">Tonight</button>
            <button type="button" class="epg-float-btn epg-float-icon" aria-label="Zoom out"
              :disabled="zoomIndex === 0" @click="changeZoom(-1)"><minus-icon /></button>
            <button type="button" class="epg-float-btn epg-float-icon" aria-label="Zoom in"
              :disabled="zoomIndex === zoomLevelCount - 1" @click="changeZoom(1)"><plus-icon /></button>
          </div>
          </teleport>
        </div>
        <div v-if="guide" class="guide-legend">
          <span class="guide-legend-item"><span class="guide-legend-ring" aria-hidden="true"></span>Recording now</span>
          <span class="guide-legend-item"><span class="guide-legend-dot" aria-hidden="true"></span>Scheduled</span>
          <span class="guide-legend-item"><span class="guide-legend-dot is-watch" aria-hidden="true"></span>Watching for</span>
          <span v-if="stateMeta" class="guide-legend-meta">{{ stateMeta }}</span>
        </div>
      </template>

      <div class="ui-toast-region" aria-live="polite">
        <div v-if="flashText" :class="['ui-toast', { 'is-error': flashKind === 'err' }]">{{ flashText }}</div>
      </div>

      <teleport to="body">
      <transition name="ui-sheet">
      <div v-if="selected" class="ui-sheet-backdrop programme-sheet-backdrop" @click.self="closeModal">
        <section ref="sheetEl" class="ui-sheet programme-sheet" role="dialog" aria-modal="true" aria-labelledby="programme-sheet-title" tabindex="-1">
          <span class="ui-sheet-grab" aria-hidden="true"></span>
          <div class="programme-sheet-art">
            <programme-image :key="selected.program.program_id" :event-id="selected.program.has_image ? selected.program.program_id : null" variant="hero"
              :channel-id="selected.channel?.id ?? selected.program.channelId" :has-logo="hasChannelLogo(selected.channel?.id ?? selected.program.channelId)"
              :title="selected.program.title" />
            <button type="button" class="ui-icon-button programme-sheet-close" aria-label="Close" @click="closeModal"><close-glyph /></button>
          </div>
          <div class="programme-sheet-heading">
            <h2 id="programme-sheet-title" class="programme-sheet-title">{{ selected.program.title }}</h2>
            <p class="programme-sheet-meta">{{ sheetMeta }}</p>
          </div>
          <p v-if="selected.program.synopsis" class="programme-sheet-synopsis">{{ selected.program.synopsis }}</p>
          <p v-if="selectedStatusText" class="programme-sheet-status"><span class="ui-dot is-live" aria-hidden="true"></span>{{ selectedStatusText }}</p>
          <p v-else-if="cellState(selected.program) === 'series'" class="programme-sheet-status"><span class="ui-dot is-live" aria-hidden="true"></span>A series recording in TVHeadend records this show.</p>
          <p v-else-if="selectedWatchItem && sheetStrength !== 'notify'" class="programme-sheet-status is-watch"><span class="ui-dot" aria-hidden="true"></span>You are watching for this show.</p>
          <cancel-series-step v-if="cancelSeriesStep" :title="cancelSeriesStep.title" :episode-outcome="cancelSeriesStep.episodeOutcome"
            :title-match="cancelSeriesStep.titleMatch" :busy="modalBusy" @back="cancelSeriesStep = null" @confirm="cancelSelectedSeries" />
          <template v-else>
            <div v-if="cancelActions.length" class="programme-sheet-cancels">
              <div v-for="action in cancelActions" :key="action.key" class="programme-sheet-cancel">
                <button type="button" :class="['ui-button', 'ui-button-destructive', 'ui-button-block', { 'is-busy': modalAction === action.busyKey }]"
                  :disabled="modalBusy" @click="action.run">
                  <stop-icon v-if="action.key === 'stop'" />{{ action.label }}
                  <span v-if="modalAction === action.busyKey" class="spinner" aria-hidden="true"></span>
                </button>
                <p class="programme-sheet-outcome">{{ action.outcome }}</p>
              </div>
            </div>
            <template v-if="sheetStrengths.length">
              <div v-if="sheetStrengths.length > 1" class="ui-segmented is-fill programme-sheet-strengths" role="tablist" aria-label="What to record">
                <button v-for="s in sheetStrengths" :key="s.key" type="button" role="tab" class="ui-segment"
                  :aria-selected="String(sheetStrength === s.key)" @click="sheetStrength = s.key">{{ s.label }}</button>
              </div>
              <p class="programme-sheet-line">{{ strengthLine }}</p>
              <div v-if="sheetStrength === 'episode' || sheetStrength === 'series'" class="ui-group programme-sheet-options">
                <div class="ui-group-row">
                  <span class="ui-group-row-main" id="programme-lead-label">Start early</span>
                  <span class="ui-stepper" role="group" aria-labelledby="programme-lead-label">
                    <button type="button" class="ui-stepper-button" aria-label="Start less early" :disabled="!canStep({ steps: leadSteps, value: leadTime, step: -1 })" @click="leadTime = stepValue({ steps: leadSteps, value: leadTime, step: -1 })">−</button>
                    <span class="ui-stepper-value" aria-live="polite">{{ minutesShort(leadTime) }}</span>
                    <button type="button" class="ui-stepper-button" aria-label="Start earlier" :disabled="!canStep({ steps: leadSteps, value: leadTime, step: 1 })" @click="leadTime = stepValue({ steps: leadSteps, value: leadTime, step: 1 })">+</button>
                  </span>
                </div>
                <div class="ui-group-row">
                  <span class="ui-group-row-main" id="programme-lag-label">Finish late</span>
                  <span class="ui-stepper" role="group" aria-labelledby="programme-lag-label">
                    <button type="button" class="ui-stepper-button" aria-label="Finish less late" :disabled="!canStep({ steps: lagSteps, value: lagTime, step: -1 })" @click="lagTime = stepValue({ steps: lagSteps, value: lagTime, step: -1 })">−</button>
                    <span class="ui-stepper-value" aria-live="polite">{{ minutesShort(lagTime) }}</span>
                    <button type="button" class="ui-stepper-button" aria-label="Finish later" :disabled="!canStep({ steps: lagSteps, value: lagTime, step: 1 })" @click="lagTime = stepValue({ steps: lagSteps, value: lagTime, step: 1 })">+</button>
                  </span>
                </div>
                <div v-if="sheetStrength === 'series'" class="ui-group-row">
                  <span class="ui-group-row-main" id="programme-keep-label">Keep</span>
                  <span class="ui-stepper" role="group" aria-labelledby="programme-keep-label">
                    <button type="button" class="ui-stepper-button" aria-label="Keep fewer" :disabled="!canStep({ steps: keepSteps, value: episodesToKeep, step: -1 })" @click="episodesToKeep = stepValue({ steps: keepSteps, value: episodesToKeep, step: -1 })">−</button>
                    <span class="ui-stepper-value" aria-live="polite">{{ keepLabel(episodesToKeep) }}</span>
                    <button type="button" class="ui-stepper-button" aria-label="Keep more" :disabled="!canStep({ steps: keepSteps, value: episodesToKeep, step: 1 })" @click="episodesToKeep = stepValue({ steps: keepSteps, value: episodesToKeep, step: 1 })">+</button>
                  </span>
                </div>
                <div v-if="sheetStrength === 'series'" class="ui-group-row">
                  <span class="ui-group-row-main">
                    <span class="ui-group-row-title">Any channel</span>
                    <span class="ui-group-row-meta">Follow the show if it moves to another channel</span>
                  </span>
                  <button type="button" class="ui-switch" :aria-pressed="String(anyChannel)" aria-label="Record on any channel" :title="ANY_CHANNEL_HINT" @click="anyChannel = !anyChannel"></button>
                </div>
              </div>
              <div v-else-if="sheetStrength === 'notify' && !selectedWatchItem" class="ui-group programme-sheet-options">
                <div class="ui-group-row">
                  <span class="ui-group-row-main">
                    <span class="ui-group-row-title">Record when it appears</span>
                    <span class="ui-group-row-meta">Sets an any-channel series recording the first time it is in the guide</span>
                  </span>
                  <button type="button" class="ui-switch" :aria-pressed="String(recordWhenSeen)" aria-label="Record when it appears" @click="recordWhenSeen = !recordWhenSeen"></button>
                </div>
              </div>
              <details v-if="sheetStrength === 'episode' || sheetStrength === 'series'" class="programme-sheet-advanced">
                <summary>Advanced</summary>
                <div class="ui-group">
                  <div class="ui-group-row">
                    <span class="ui-group-row-main">
                      <span class="ui-group-row-title">Add to library</span>
                      <span class="ui-group-row-meta">{{ libraryNote.text }}<template v-if="libraryNote.changeable"> Change it in <a href="#/settings/system/series">Series rules</a>.</template></span>
                    </span>
                    <button type="button" class="ui-switch" :aria-pressed="String(addToLibrary)" aria-label="Add to library" @click="addToLibrary = !addToLibrary"></button>
                  </div>
                </div>
              </details>
            </template>
            <p v-if="!sheetStrengths.length && !cancelActions.length" class="programme-sheet-line">This programme has already aired.</p>
            <p v-if="modalStatusText" :class="['programme-sheet-error', modalStatusKind]" role="status">{{ modalStatusText }}</p>
            <div class="ui-sheet-footer programme-sheet-footer">
              <button v-if="canWatchLive" type="button" class="ui-button ui-button-secondary ui-button-block" @click="watchSelected"><tv-icon /> Watch live</button>
              <div class="programme-sheet-buttons">
                <button type="button" class="ui-button ui-button-secondary programme-sheet-dismiss" @click="closeModal">Close</button>
                <button v-if="primaryAction" type="button" :class="['ui-button', 'programme-sheet-primary', primaryClass]"
                  :disabled="modalBusy" @click="runPrimaryAction">
                  <span v-if="primaryAction.tone === 'record'" class="programme-sheet-rec-dot" aria-hidden="true"></span>{{ primaryAction.label }}
                  <span v-if="modalAction === primaryAction.key" class="spinner" aria-hidden="true"></span>
                </button>
              </div>
            </div>
          </template>
        </section>
      </div>
      </transition>
      </teleport>

      <teleport to="body">
      <transition name="ui-sheet">
      <div v-if="hdOffer" class="ui-sheet-backdrop programme-sheet-backdrop is-top" @click.self="hdOffer = null">
        <section class="ui-sheet programme-sheet is-compact" role="alertdialog" aria-modal="true" aria-labelledby="hd-offer-title">
          <span class="ui-sheet-grab" aria-hidden="true"></span>
          <header class="ui-sheet-header">
            <h2 id="hd-offer-title" class="ui-sheet-title">This is the SD channel</h2>
            <button type="button" class="ui-icon-button is-plain" aria-label="Close" @click="hdOffer = null"><close-glyph /></button>
          </header>
          <p class="ui-sheet-subtitle">{{ hdOffer.channel.name }} shows the same programme in HD.</p>
          <div class="programme-sheet-buttons">
            <template v-if="hdOffer.action === 'record-series'">
              <button type="button" class="ui-button ui-button-secondary" @click="recordOffered('sd')">Series in SD</button>
              <button type="button" class="ui-button ui-button-record programme-sheet-primary" @click="recordOffered('hd')">Series in HD</button>
            </template>
            <template v-else>
              <button type="button" class="ui-button ui-button-secondary" @click="recordOffered('sd')">Record in SD</button>
              <button type="button" class="ui-button ui-button-record programme-sheet-primary" @click="recordOffered('hd')">Record in HD</button>
            </template>
          </div>
        </section>
      </div>
      </transition>
      </teleport>

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
        @close="channelsModal = false" @saved="onChannelPrefsSaved" />
      </transition>
      </teleport>
    </div>
  `,
  setup() {
    const { flashText, flashKind, flash } = useFlash()
    const day = ref(0)
    const guide = ref(null)
    const guideByDay = new Map()
    const loading = ref(false)
    const error = ref('')
    const errorCode = ref('')
    const state = ref(null)
    const stateError = ref('')
    const scrollEl = ref(null)
    const searchQ = ref('')
    const searchResults = ref([])
    const searching = ref(false)
    const selected = ref(null)
    const modalBusy = ref(false)
    const modalAction = ref('')
    const busyId = ref(null)
    const channelsModal = ref(false)
    const [modalStatusText, modalStatusKind, setModalStatus] = makeStatus()
    const sheetEl = ref(null)
    const searchOpen = ref(false)
    const watchItems = ref([])
    const libraryDefault = ref(true)
    const sheetStrength = ref('')
    const recordWhenSeen = ref(false)

    watch([selected, channelsModal], ([program, channels]) => {
      try { document.body.classList.toggle('sheet-open', Boolean(program || channels)) } catch { /* ignore */ }
    })
    onUnmounted(() => {
      try { document.body.classList.remove('sheet-open') } catch { /* ignore */ }
    })
    const leadTime = ref(2)
    const lagTime = ref(10)
    const episodesToKeep = ref(0)
    const anyChannel = ref(false)
    const addToLibrary = ref(true)
    const showRules = ref([])
    const moviesFolderSet = ref(false)
    const loadShowRules = async () => {
      const [r, s] = await Promise.all([
        api('GET', '/api/shows').catch(() => ({ shows: [] })),
        fetchSettings().catch(() => ({})),
      ])
      showRules.value = (r.shows || []).filter((rule) => rule.enabled)
      moviesFolderSet.value = Boolean(s.movies_root)
    }
    const looksLikeFilm = (p) => p.genre >= 0x10 && p.genre <= 0x1f
      && p.series_no == null && p.episode_no == null && p.end - p.start >= 75 * 60_000
    const ruleFor = (title) => {
      const t = String(title || '').toLowerCase()
      return showRules.value
        .filter((rule) => t.includes(rule.show_pattern.toLowerCase()))
        .sort((a, b) => b.show_pattern.length - a.show_pattern.length)[0] || null
    }
    const libraryNote = computed(() => {
      const program = selected.value?.program
      if (!program) return { text: '' }
      if (!addToLibrary.value) return { text: 'Stays in TVHeadend. Freetvarr does not import it.' }
      const folder = ruleFor(program.title)
      if (folder) return { text: `Episodes go into ${folder.dest_folder} in your TV library.`, changeable: true }
      if (moviesFolderSet.value && looksLikeFilm(program)) return { text: 'The guide lists this as a film, so it goes to the movies folder.' }
      if (!program.series_link) return { text: 'Goes to the one-off folder.' }
      return {
        text: 'Record puts this airing in the one-off folder. Record series gives the series its own folder in your TV library.',
        changeable: true,
      }
    })

    const clampRailPx = (px) => Math.min(EPG_RAIL_MAX_PX, Math.max(EPG_RAIL_MIN_PX, px))
    const storedRailPx = () => {
      try {
        const px = Number(localStorage.getItem(EPG_RAIL_KEY))
        return Number.isFinite(px) && px > 0 ? clampRailPx(px) : EPG_RAIL_DEFAULT_PX
      } catch { return EPG_RAIL_DEFAULT_PX }
    }
    const railPx = ref(storedRailPx())

    const zoom = storedChoice({ key: EPG_ZOOM_KEY, options: EPG_ZOOM_LEVELS.map((l) => l.key), fallback: 'm' })
    const zoomIndex = computed(() => EPG_ZOOM_LEVELS.findIndex((l) => l.key === zoom.value))
    const zoomLevel = computed(() => EPG_ZOOM_LEVELS[zoomIndex.value])
    const pxPerMin = computed(() => zoomLevel.value.pxPerMin)
    const trackWidth = computed(() => (guide.value ? spillLengthMin(guide.value) : 24 * 60) * pxPerMin.value)
    const midnightX = computed(() => (guide.value ? dayLengthMin(guide.value) : 24 * 60) * pxPerMin.value)
    const zooming = ref(false)
    const narrow = useMediaQuery(EPG_NARROW_QUERY)

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

    const visibleChannels = computed(() =>
      (guide.value?.channels || []).filter((c) => !c.hidden))

    // The filter hides rows with v-show instead of removing them from the
    // v-for: toggling display is a style flip, while remove-and-remount pays
    // for every programme cell again.
    const railMatchIds = computed(() => {
      const q = railFilter.value.trim().toLowerCase()
      if (!q) return null
      const set = new Set()
      for (const c of visibleChannels.value) {
        if ((c.name || '').toLowerCase().includes(q) || String(c.number ?? '').startsWith(q)) {
          set.add(String(c.id))
        }
      }
      return set
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
      return visibleChannels.value.flatMap((ch) => {
        const pinned = Boolean(ch.pinned)
        const entry = { kind: 'channel', key: String(ch.id), shown: rowShown(ch), ch }
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

    const scheduledByProgramId = computed(() => {
      const map = new Map()
      for (const r of state.value?.futureRecordings || []) {
        if (r?.programId != null) map.set(String(r.programId), r)
      }
      return map
    })

    const activeRecordingSet = computed(() => new Set([
      ...(state.value?.activeRecordingIds || []).map(String),
      ...recordingProgramIdsOf(recordingNow.value.active),
    ]))

    const seriesLinkSet = computed(() => {
      const set = new Set()
      for (const t of state.value?.seriesTags || []) {
        const link = t?.seriesLinkId ?? t?.id
        if (link != null) set.add(String(link))
      }
      return set
    })

    const seriesTags = computed(() => state.value?.seriesTags || [])

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

    const resultsLabel = computed(() => {
      const count = searchResults.value.length
      return `${count} result${count === 1 ? '' : 's'} for “${searchQ.value.trim()}”`
    })

    const watchedKeys = computed(() => watchedKeysOf(watchItems.value))

    const isWatched = (p) => watchedKeys.value.has(showKeyOf(p.title))

    const nowPill = computed(() => clockWithoutPeriod(fmtClock(nowMs.value)))

    const canRecord = computed(() =>
      selected.value && selected.value.program.end > nowMs.value
      && (selected.value.channel?.recordable !== false))

    const canWatchLive = computed(() => {
      if (!selected.value?.channel) return false
      if (live.open && String(live.channel?.id) === String(selected.value.channel.id)) return false
      const { start, end } = selected.value.program
      const t = now.value.getTime()
      return Boolean(start) && start <= t && end > t
    })

    const dialogFocus = ref('')
    const cancelSeriesStep = ref(null)

    const isSelectedOnAir = computed(() => {
      const program = selected.value?.program
      return Boolean(program?.start) && program.start <= nowMs.value && program.end > nowMs.value
    })

    const selectedScheduled = computed(() => (selected.value
      ? scheduledByProgramId.value.get(String(selected.value.program.program_id ?? selected.value.program.programId)) || null
      : null))

    const selectedSeriesLink = computed(() => {
      const program = selected.value?.program
      if (!program) return null
      if (isSeriesScheduled(program)) return String(selectedScheduled.value.seriesLinkId)
      return findSeriesLink({ links: seriesLinkSet.value, seriesLink: program.series_link })
    })

    const selectedRecording = computed(() => {
      const program = selected.value?.program
      if (!program) return null
      const id = String(program.program_id ?? program.programId)
      return recordingNow.value.active.find((r) => !r.failed && String(r.programId) === id) || selectedScheduled.value
    })

    const selectedStatusText = computed(() => {
      const program = selected.value?.program
      const state = program ? cellState(program) : ''
      const series = isSeriesScheduled(program || {})
      if (state === 'recording') {
        return series ? `Recording now as part of the "${program.title}" series recording.` : 'Recording now (one-off recording).'
      }
      if (state === 'scheduled') {
        return `Scheduled to record in TVHeadend${series ? ' (part of a series recording).' : ' (one-off recording).'}`
      }
      return ''
    })

    const selectedChannelLabel = () => {
      if (anyChannel.value) return 'on any channel'
      const name = selected.value.channel?.name || channelName(selected.value.program.channelId)
      return name ? `on ${name}` : 'on this channel'
    }

    const stopOutcome = () => {
      const recording = selectedRecording.value
      const text = stopRecordingOutcome({
        recordedMs: recordedMsOf({ recordingSince: recording?.recordingSince, nowMs: now.value.getTime() }),
        addsToLibrary: selectedScheduled.value?.libraryChoice !== 'exclude',
      })
      return isSeriesScheduled(selected.value.program) ? `${text} The series keeps recording future episodes.` : text
    }

    const cancelSeriesOutcome = () =>
      `Stops TVHeadend recording new episodes of "${selected.value.program.title}". Asks what to do with the rest.`

    const selectedState = computed(() => (selected.value ? cellState(selected.value.program) : ''))

    const selectedWatchItem = computed(() => (selected.value
      ? activeWatchItemFor({ items: watchItems.value, key: showKeyOf(selected.value.program.title) })
      : null))

    const sheetStrengths = computed(() => {
      const program = selected.value?.program
      if (!program) return []
      const ruled = Boolean(selectedSeriesLink.value) || selectedState.value === 'series'
      return sheetStrengthsFor({
        canRecordEpisode: canRecord.value && selectedState.value === '',
        canRecordSeries: canRecord.value && Boolean(program.series_link) && !ruled,
        canNotify: Boolean(program.title) && !ruled,
      })
    })

    const resetStrength = () => {
      sheetStrength.value = initialStrengthOf({ strengths: sheetStrengths.value, focus: dialogFocus.value })
    }

    watch(() => sheetStrengths.value.map((s) => s.key).join(), () => {
      if (!sheetStrengths.value.some((s) => s.key === sheetStrength.value)) resetStrength()
    })

    const strengthLine = computed(() => {
      const program = selected.value?.program
      if (!program) return ''
      return strengthLineOf({
        strength: sheetStrength.value,
        title: program.title,
        channelLabel: selectedChannelLabel(),
        onAirUntil: isSelectedOnAir.value ? fmtClock(program.end) : '',
        recordWhenSeen: recordWhenSeen.value,
        watching: Boolean(selectedWatchItem.value),
      })
    })

    const primaryAction = computed(() => (cancelSeriesStep.value
      ? null
      : primaryActionOf({
        strength: sheetStrength.value,
        recordWhenSeen: recordWhenSeen.value,
        watching: Boolean(selectedWatchItem.value),
      })))

    const primaryClass = computed(() => ({
      record: 'ui-button-record',
      primary: 'ui-button-primary',
      secondary: 'ui-button-destructive',
    })[primaryAction.value?.tone] || '')

    const sheetMeta = computed(() => {
      const program = selected.value?.program
      if (!program) return ''
      return sheetMetaLineOf({
        seasonEpisode: seasonEpisodeShort(program),
        episodeTitle: program.episode_title,
        channelName: selected.value.channel?.name || channelName(program.channelId),
        timeRange: program.start ? fmtSheetRange(program) : '',
      })
    })

    const cancelActions = computed(() => {
      const program = selected.value?.program
      if (!program || program.past || cancelSeriesStep.value) return []
      const state = selectedState.value
      const hasSeries = Boolean(selectedSeriesLink.value)
      const cancelSeriesAction = {
        key: 'cancel-series', busyKey: 'cancel-series', label: 'Cancel series',
        outcome: cancelSeriesOutcome(), run: openCancelSeriesStep,
      }
      if (state === 'recording') {
        return [
          { key: 'stop', busyKey: 'cancel', label: 'Stop recording', outcome: stopOutcome(), run: cancelSelected },
          hasSeries && cancelSeriesAction,
        ].filter(Boolean)
      }
      if (state === 'scheduled') {
        return [
          {
            key: 'cancel', busyKey: 'cancel',
            label: isSeriesScheduled(program) ? 'Skip this episode' : 'Cancel recording',
            outcome: isSeriesScheduled(program) ? 'Skips this episode. The series keeps recording the others.' : 'Removes this recording from the schedule.',
            run: cancelSelected,
          },
          hasSeries && cancelSeriesAction,
        ].filter(Boolean)
      }
      if (state === 'series') return [cancelSeriesAction]
      return []
    })

    const runPrimaryAction = () => {
      const key = primaryAction.value?.key
      if (key === 'record') return recordSelected()
      if (key === 'record-series') return recordSelectedSeries()
      if (key === 'notify') return watchSelectedTitle()
      if (key === 'stop-watching') return stopWatchingSelected()
    }

    const openCancelSeriesStep = () => {
      const { program } = selected.value
      const link = selectedSeriesLink.value ?? program.series_link
      const autorec = seriesTags.value.find((t) => String(t.seriesLinkId) === String(link))
      cancelSeriesStep.value = {
        link,
        title: autorec?.name || program.title,
        episodeOutcome: stopOutcomeFor(episodeRecordingFor([autorec?.id])),
        titleMatch: ruleFor(autorec?.name || program.title),
      }
    }

    const watchSelected = () => {
      const { program, channel } = selected.value
      closeModal()
      watchLive({ channel: liveChannelOf(channel), nowTitle: program.title })
    }

    const tsOf = tsOfMs
    const fmtClock = fmtClockTz

    const fmtDayTime = (ms) => `${formatDate(ms, tz.value)} ${fmtClock(ms)}`

    const fmtSheetRange = (p) => `${dateFormat({ weekday: 'short' }).format(new Date(p.start))} ${fmtClock(p.start)}–${fmtClock(p.end)}`

    const seLabel = seasonEpisodeOf

    const channelById = (id) =>
      (guide.value?.channels || []).find((c) => String(c.id) === String(id)) || null

    const channelName = (id) => channelById(id)?.name || `channel ${id}`

    const hasChannelLogo = (id) => Boolean(channelById(id)?.logos?.length)


    const cellState = (p) => {
      if (p.past) return p.recorded ? 'recorded' : ''
      const scheduled = scheduledByProgramId.value.get(String(p.program_id ?? p.programId))
      if (scheduled && activeRecordingSet.value.has(String(scheduled.programId))) return 'recording'
      if (scheduled) return 'scheduled'
      if (findSeriesLink({ links: seriesLinkSet.value, seriesLink: p.series_link })) return 'series'
      return ''
    }

    const isSeriesScheduled = (p) => {
      const scheduled = scheduledByProgramId.value.get(String(p.program_id ?? p.programId))
      return Boolean(scheduled?.seriesLinkId != null
        && seriesLinkSet.value.has(String(scheduled.seriesLinkId)))
    }

    const recordingStateText = (p) => {
      const state = cellState(p)
      if (state === 'recording') return 'Recording now'
      if (state === 'scheduled') {
        return isSeriesScheduled(p) ? 'Series recording scheduled' : 'One-off recording scheduled'
      }
      if (state === 'series') return 'Series recording set'
      if (state === 'recorded') return 'Recorded'
      if (!p.past && isWatched(p)) return 'Watching for'
      return ''
    }

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

    const cellHasThumb = (p) => showImages.value && p.has_image && cellWidth(p) >= thumbMinCellPx.value

    const cellStyle = (p) => ({
      left: `${cellX(p.start)}px`,
      width: `${cellWidth(p)}px`,
    })

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
        guideByDay.set(d, g)
        if (day.value === d) guide.value = g
      } catch (err) {
        error.value = `Guide load failed: ${err.message}`
        errorCode.value = err.code || ''
      } finally {
        loading.value = false
      }
    }

    const loadState = async ({ fresh = false } = {}) => {
      stateError.value = ''
      try {
        state.value = await api('GET', `/api/epg/state${fresh ? '?fresh=1' : ''}`)
      } catch (err) {
        stateError.value = `TVHeadend state failed: ${err.message}`
      }
    }

    const scrollToMs = async (ms, { anchor = 0, leadPx = 60 } = {}) => {
      await nextTick()
      if (!scrollEl.value || !guide.value) return
      scrollViewW.value = scrollEl.value.clientWidth
      await nextTick()
      const x = ((ms - guide.value.dayStart) / 60_000) * pxPerMin.value
      const trackWidth = scrollEl.value.clientWidth - railWidthOf(scrollEl.value)
      const offset = anchor ? trackWidth * anchor : leadPx
      scrollEl.value.scrollLeft = Math.max(0, x - offset)
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
      zoom.value = level.key
      await nextTick()
      if (anchor) restoreZoomAnchor(el, anchor)
      requestAnimationFrame(() => { zooming.value = false })
    }

    const setZoom = (key) => changeZoom(EPG_ZOOM_LEVELS.findIndex((l) => l.key === key) - zoomIndex.value)

    const manualRefresh = async () => {
      guideByDay.clear()
      await Promise.all([loadDay(day.value, { force: true }), loadState({ fresh: true }), loadWatchlist()])
      if (!error.value) flash({ msg: 'Guide refreshed.' })
    }

    let sheetReturnFocus = null

    const openProgram = (p, channel, { focus = '' } = {}) => {
      leadTime.value = 2
      lagTime.value = 10
      episodesToKeep.value = 0
      anyChannel.value = false
      addToLibrary.value = libraryDefault.value
      recordWhenSeen.value = false
      cancelSeriesStep.value = null
      dialogFocus.value = focus
      modalAction.value = ''
      setModalStatus('')
      if (!selected.value) sheetReturnFocus = document.activeElement
      selected.value = { program: p, channel }
      resetStrength()
      loadShowRules()
      nextTick(() => sheetEl.value?.focus())
    }

    const openUpcoming = (r) => {
      openProgram({
        program_id: r.programId,
        epg_program_id: r.epgProgramId ?? null,
        title: r.name,
        episode_title: r.episodeTitle || null,
        start: tsOf(r.startDate),
        end: tsOf(r.endDate),
        series_link: r.seriesLinkId || null,
        series_no: r.seriesNo ?? null,
        episode_no: r.episodeNo ?? null,
        has_image: Boolean(r.hasImage),
        channelId: r.channelId,
      }, channelById(r.channelId))
    }

    let returnRoute = ''

    const openHandoff = () => {
      const handoff = guideHandoff.value
      if (!handoff) return
      guideHandoff.value = null
      returnRoute = handoff.returnTo || '#/home'
      if (recordDialogOverPlayer.value) loadState({ fresh: true })
      if (handoff.upcoming) return openUpcoming(handoff.upcoming)
      const listed = (guide.value?.programs[handoff.channelId] || [])
        .find((p) => p.start === handoff.program.start)
      openProgram(listed || handoff.program, channelById(handoff.channelId), { focus: handoff.focus || '' })
    }

    const closeModal = () => {
      recordDialogOverPlayer.value = false
      cancelSeriesStep.value = null
      dialogFocus.value = ''
      hdOffer.value = null
      selected.value = null
      sheetReturnFocus?.focus?.()
      sheetReturnFocus = null
      if (!returnRoute) return
      const target = returnRoute
      returnRoute = ''
      window.location.hash = target
    }

    const hdOffer = ref(null)

    const offerHdFirst = (action) => {
      const { program, channel } = selected.value
      const hd = findHdSimulcast({
        program,
        channelId: channel?.id ?? program.channelId,
        channels: guide.value?.channels,
        programsByChannel: guide.value?.programs,
        needsSeriesLink: action === 'record-series',
      })
      if (!hd || cellState(hd.program)) return false
      hdOffer.value = { action, ...hd }
      return true
    }

    const recordOffered = (choice) => {
      const { action, program, channel } = hdOffer.value
      hdOffer.value = null
      if (choice === 'hd') selected.value = { program, channel }
      return action === 'record-series' ? recordSeries() : recordOneOff()
    }

    const recordSelected = () => offerHdFirst('record') || recordOneOff()

    const recordSelectedSeries = () => (!anyChannel.value && offerHdFirst('record-series')) || recordSeries()

    const recordOneOff = async () => {
      const { program, channel } = selected.value
      modalBusy.value = true
      modalAction.value = 'record'
      try {
        await api('POST', '/api/epg/record', {
          channel_id: channel?.id ?? program.channelId,
          program_id: program.program_id,
          epg_program_id: program.epg_program_id,
          lead_time: leadTime.value,
          lag_time: lagTime.value,
          add_to_library: addToLibrary.value,
        })
        flash({ msg: `Scheduled "${program.title}".` })
        closeModal()
        refreshAfterRecordingChange()
        await loadState({ fresh: true })
      } catch (err) {
        setModalStatus(`Record failed: ${err.message}`, 'err', 8000)
      } finally {
        modalBusy.value = false
        modalAction.value = ""
      }
    }

    const recordSeries = async () => {
      const { program, channel } = selected.value
      modalBusy.value = true
      modalAction.value = 'record-series'
      try {
        const result = await api('POST', '/api/epg/record-series', {
          series_link: program.series_link,
          channel_id: channel?.id ?? program.channelId,
          program_id: program.program_id,
          epg_program_id: program.epg_program_id,
          lead_time: leadTime.value,
          lag_time: lagTime.value,
          episodes_to_keep: episodesToKeep.value,
          any_channel: anyChannel.value,
          add_show_rule: addToLibrary.value,
        })
        const ruleNote = result.showRule ? ` Episodes go into ${result.showRule.dest_folder}.` : ''
        flash({ msg: `Series recording set for "${program.title}".${ruleNote}`, ms: ruleNote ? 6000 : undefined })
        closeModal()
        refreshAfterRecordingChange()
        await loadState({ fresh: true })
      } catch (err) {
        setModalStatus(`Series record failed: ${err.message}`, 'err', 8000)
      } finally {
        modalBusy.value = false
        modalAction.value = ""
      }
    }

    const cancelledMessage = ({ title, result }) => {
      if (result?.kept === true) return `Stopped "${title}". What it recorded stays.`
      if (result?.kept === false) return `Stopped "${title}" and deleted what it recorded.`
      return `Cancelled "${title}".`
    }

    const cancelSelected = async () => {
      const { program } = selected.value
      modalBusy.value = true
      modalAction.value = 'cancel'
      try {
        const result = await api('POST', '/api/epg/cancel', { program_id: program.program_id })
        flash({ msg: cancelledMessage({ title: program.title, result }) })
        closeModal()
        refreshAfterRecordingChange()
        await loadState({ fresh: true })
      } catch (err) {
        setModalStatus(`Cancel failed: ${err.message}`, 'err', 8000)
      } finally {
        modalBusy.value = false
        modalAction.value = ""
      }
    }

    const cancelSelectedSeries = async ({ stopRecordingNow, removeTitleMatch }) => {
      const step = cancelSeriesStep.value
      modalBusy.value = true
      modalAction.value = 'cancel-series'
      try {
        await api('POST', '/api/epg/cancel-series', {
          series_link_id: step.link,
          stop_recording_now: stopRecordingNow,
          title_match_id: removeTitleMatch ? step.titleMatch.id : null,
        })
        flash({ msg: `Cancelled the series recording of "${step.title}".` })
        closeModal()
        refreshAfterRecordingChange()
        await Promise.all([loadState({ fresh: true }), loadShowRules()])
      } catch (err) {
        cancelSeriesStep.value = null
        setModalStatus(`Cancel failed: ${err.message}`, 'err', 8000)
      } finally {
        modalBusy.value = false
        modalAction.value = ""
      }
    }

    const loadWatchlist = async () => {
      try {
        watchItems.value = (await api('GET', '/api/watchlist')).items || []
      } catch {
        watchItems.value = []
      }
    }

    const loadLibraryDefault = async () => {
      try {
        libraryDefault.value = (await api('GET', '/api/recording-defaults')).add_to_library !== false
      } catch {
        libraryDefault.value = true
      }
    }

    const watchedMessage = ({ title, item }) => {
      if (item?.mode === 'record' && item.fulfilledAt) return `"${title}" is in the guide, so every episode now records on any channel.`
      if (item?.mode === 'record') return `Freetvarr records "${title}" on any channel once it is in the guide.`
      return `Watching for "${title}". It shows in Scheduled under Watching for.`
    }

    const watchSelectedTitle = async () => {
      const { program } = selected.value
      modalBusy.value = true
      modalAction.value = 'notify'
      try {
        const { item } = await api('POST', '/api/watchlist', {
          title: program.title,
          mode: recordWhenSeen.value ? 'record' : 'notify',
        })
        flash({ msg: watchedMessage({ title: program.title, item }), ms: 6000 })
        closeModal()
        await loadWatchlist()
        if (item?.fulfilledAt) {
          refreshAfterRecordingChange()
          await loadState({ fresh: true })
        }
      } catch (err) {
        setModalStatus(`Notify me failed: ${err.message}`, 'err', 8000)
      } finally {
        modalBusy.value = false
        modalAction.value = ''
      }
    }

    const stopWatchingSelected = async () => {
      const item = selectedWatchItem.value
      if (!item) return
      modalBusy.value = true
      modalAction.value = 'stop-watching'
      try {
        await api('DELETE', `/api/watchlist/${item.id}`)
        flash({ msg: `Stopped watching for "${item.title}".` })
        await loadWatchlist()
      } catch (err) {
        setModalStatus(`Stop watching failed: ${err.message}`, 'err', 8000)
      } finally {
        modalBusy.value = false
        modalAction.value = ''
      }
    }

    const reloadGuide = async () => {
      guideByDay.clear()
      await loadDay(day.value, { force: true })
    }

    const currentPins = () => (guide.value?.channels || [])
      .filter((c) => c.pinned)
      .map((c) => String(c.id))

    const reorderPins = async (pins) => {
      try {
        await api('PUT', '/api/epg/channel-prefs', { pinned_ids: pins })
        await reloadGuide()
      } catch (err) {
        flash({ msg: `Reorder failed: ${err.message}`, kind: 'err', ms: 6000 })
      }
    }

    const pinDrag = usePinDrag({ rowSelector: '.epg-row.pinned', currentPins, onReorder: reorderPins })
    const { dragPinId, dropTargetId, dropAfter, onPinPointerDown, onPinPointerMove, onPinPointerUp, onPinPointerCancel } = pinDrag

    const pinsOffscreen = ref(false)

    const updatePinsOffscreen = () => {
      const el = scrollEl.value
      if (!el) { pinsOffscreen.value = false; return }
      const rects = [...el.querySelectorAll('.epg-row.pinned')]
        .map((row) => row.getBoundingClientRect())
        .filter((r) => r.height > 0)
      if (!rects.length) { pinsOffscreen.value = false; return }
      const rulerBottom = el.getBoundingClientRect().top + el.querySelector('.epg-ruler').offsetHeight
      pinsOffscreen.value = rects[rects.length - 1].bottom < rulerBottom
    }

    const scrollRailTop = () => scrollEl.value?.scrollTo({ top: 0, behavior: 'smooth' })

    const midnightOnScreen = ref(false)

    const updateMidnightOnScreen = () => {
      const el = scrollEl.value
      if (!el || !guide.value) { midnightOnScreen.value = false; return }
      const viewW = el.clientWidth - railWidthOf(el)
      midnightOnScreen.value = midnightX.value >= el.scrollLeft && midnightX.value <= el.scrollLeft + viewW
    }

    const updateFloatingChips = () => {
      updatePinsOffscreen()
      updateMidnightOnScreen()
    }

    watch([midnightX, guide], () => nextTick(updateMidnightOnScreen))

    const railStripH = ref(0)
    const scrollbarW = ref(0)
    const syncScrollSize = () => {
      railStripH.value = scrollEl.value?.clientHeight || 0
      scrollbarW.value = scrollEl.value ? scrollEl.value.offsetWidth - scrollEl.value.clientWidth : 0
      scrollViewW.value = scrollEl.value?.clientWidth || 0
    }

    let scrollRo = null
    watch(scrollEl, (el, prev) => {
      if (prev) prev.removeEventListener('scroll', updateFloatingChips)
      if (scrollRo) { scrollRo.disconnect(); scrollRo = null }
      if (el) {
        el.addEventListener('scroll', updateFloatingChips, { passive: true })
        scrollRo = new ResizeObserver(() => { syncScrollSize(); updateFloatingChips() })
        scrollRo.observe(el)
      }
      syncScrollSize()
      updateFloatingChips()
    })
    onUnmounted(() => { if (scrollRo) scrollRo.disconnect() })

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
      if (pinDrag.didDrag()) return
      const pinnedIds = (guide.value?.channels || []).filter((c) => c.pinned).map((c) => String(c.id))
      try {
        await togglePinnedChannel({ pinnedIds, channelId: ch.id })
        await reloadGuide()
      } catch (err) {
        flash({ msg: `Favourite failed: ${err.message}`, kind: 'err', ms: 6000 })
      }
    }

    const openChannelsModal = () => {
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
          guideByDay.set(d, g)
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

    watch([selected, channelsModal, zoom, guide, searchActive], forgetHoveredCell)

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
      if (e.key === 'Tab' && selected.value && sheetEl.value) return keepFocusInside({ event: e, root: sheetEl.value })
      if (e.key !== 'Escape') return
      if (hdOffer.value) hdOffer.value = null
      else if (selected.value) closeModal()
      else if (channelsModal.value) channelsModal.value = false
      else if (searchOpen.value) closeSearch()
      else return
      e.preventDefault()
    }

    watch(guideHandoff, (handoff) => handoff && openHandoff())
    watch(recordingChangeTick, () => loadState({ fresh: true }))

    let statePollTimer = null
    onMounted(async () => {
      window.addEventListener('keydown', onKeydown)
      window.addEventListener('scroll', onAnyScroll, { capture: true, passive: true })
      loadState()
      loadWatchlist()
      loadLibraryDefault()
      await loadDay(0)
      openHandoff()
      await scrollToNow()
      statePollTimer = setInterval(loadState, EPG_STATE_POLL_MS)
    })
    onUnmounted(() => {
      recordDialogOverPlayer.value = false
      window.removeEventListener('keydown', onKeydown)
      window.removeEventListener('scroll', onAnyScroll, { capture: true })
      hideTooltip()
      if (statePollTimer) clearInterval(statePollTimer)
      if (searchTimer) clearTimeout(searchTimer)
    })

    return {
      day, dayChips, dateSubtitle, setDay, pickDay, LISTINGS_LOADING_TEXT,
      loadingIds, loadingNoteMaxPx,
      guide, loading, error, errorCode, loadDay, state, stateMeta, scheduledLabel, scheduledHref: SCHEDULED_HREF,
      scrollEl, railPx, trackWidth, trackTailPx, railStripH, scrollbarW, railNumWidth, ticks, nowX, nowMs, nowPill,
      zoom, zoomIndex, zoomLevels: EPG_ZOOM_LEVELS, zoomLevelCount: EPG_ZOOM_LEVELS.length, zooming, thumbMinCellPx, guideRowRem, changeZoom, setZoom,
      tooltip, tooltipEl, hideTooltip, onGridPointer, onGridPointerOut, onGridFocusIn, onGridFocusOut,
      recordingStateText, fmtProgrammeRange, cellKey, cellShowsText, cellMarks, watchedKeys,
      visibleChannels, railNum, railFilter, pinnedCount, pinsOffscreen, scrollRailTop,
      midnightX, midnightOnScreen, goToNextDay, nextDayLabel, nextDayWeekday, nextDayLongLabel, lastDayLabel,
      cellState, cellStyle, cellWidth, cellTitle, isSeriesScheduled,
      jumpNow, jumpTonight, manualRefresh,
      searchOpen, toggleSearch, closeSearch, searchQ, searchActive, searchResults, searching, resultsLabel,
      selected, sheetEl, openProgram, closeModal, modalBusy, modalAction, canRecord,
      canWatchLive, watchSelected,
      modalStatusText, modalStatusKind,
      leadTime, lagTime, episodesToKeep, anyChannel, ANY_CHANNEL_HINT, addToLibrary, libraryNote,
      leadSteps: SHEET_LEAD_STEPS, lagSteps: SHEET_LAG_STEPS, keepSteps: SHEET_KEEP_STEPS,
      stepValue, canStep, minutesShort, keepLabel,
      sheetStrengths, sheetStrength, strengthLine, primaryAction, primaryClass, runPrimaryAction, recordWhenSeen,
      sheetMeta, cancelActions, selectedWatchItem,
      hdOffer, recordOffered, cancelSelectedSeries,
      cancelSeriesStep, selectedStatusText,
      busyId, channelsModal, openChannelsModal, onChannelPrefsSaved,
      togglePin, railItems, narrow, showImages, cellHasThumb,
      dropTargetId, dropAfter, dragPinId,
      onPinPointerDown, onPinPointerMove, onPinPointerUp, onPinPointerCancel,
      onRailResizeDown, onRailResizeMove, onRailResizeUp,
      channelById, channelName, hasChannelLogo, fmtClock, fmtDayTime, seLabel,
      flashText, flashKind,
    }
  },
}
