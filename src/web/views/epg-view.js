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
import { seasonEpisodeOf, ratingLabel } from '/live-info.js'
import { formatDate, formatMinutes } from '/time-format.js'
import { channelGroupLabel } from '/components/channel-identity.js'
import { togglePinnedChannel } from '/components/channels-modal.js'
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
  { key: 's', pxPerMin: 3, rowRem: 3.4, narrowRowRem: 3, halfHourTicks: false },
  { key: 'm', pxPerMin: 5, rowRem: 4.4, narrowRowRem: 3.75, halfHourTicks: true },
  { key: 'l', pxPerMin: 8, rowRem: 5.6, narrowRowRem: 4.75, halfHourTicks: true },
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
const EPG_LEAD_OPTIONS = [0, 1, 2, 3, 5, 10, 15]
const EPG_LAG_OPTIONS = [0, 5, 10, 15, 30, 60]
const EPG_KEEP_OPTIONS = [
  { value: 0, label: 'ALL EPISODES' },
  { value: 5, label: 'KEEP 5' },
  { value: 10, label: 'KEEP 10' },
]

const ANY_CHANNEL_HINT = 'Records this series whichever channel airs it, for example when it moves from 7 to 7mate. Episodes it already has are not recorded again.'

export const EpgView = {
  template: `
    <div :class="['view-reveal', 'space-y-6', { 'max-w-[69rem] mx-auto': mode !== 'guide' }]">
      <section :class="['panel', { 'panel-guide': mode === 'guide' }]">
        <header class="panel-header">
          <span class="panel-heading">
            <span class="panel-title">GUIDE<template v-if="mode === 'guide'"> · <span class="normal-case">{{ dayTitle }}</span></template><template v-else> · {{ mode.toUpperCase() }}</template></span>
            <info-button v-if="mode === 'upcoming'" title="TV GUIDE: UPCOMING" doc="guide/tv-guide#recording-a-programme">
              <p>Everything TVHeadend will record, soonest first. <strong>SCHEDULED</strong> cards are timers set in TVHeadend, marked <strong>SERIES</strong> or <strong>ONE-OFF</strong>. <strong>EXPECTED</strong> cards are episodes your series recordings should catch in the next 7 days.</p>
              <p>Click a card to open the programme, where you can cancel the recording. Search filters the list as you type.</p>
            </info-button>
            <info-button v-else title="TV GUIDE: GUIDE" doc="guide/tv-guide#the-grid">
              <p>Channels run down the page and time runs across; the orange line marks now. The day chips, <strong>NOW</strong>, and <strong>TONIGHT</strong> move through the week, and the zoom buttons change the time scale.</p>
              <p>Earlier programmes from today are dimmed. The grid runs on to 3am; programmes after midnight are dimmed, and the date pill opens the next day. Blue borders are scheduled, gold borders are series recordings, and orange is recording now. Hover a programme for its details.</p>
              <p>Click a programme to record it, record the series, or cancel. A programme on now also offers <strong>WATCH LIVE</strong>.</p>
            </info-button>
          </span>
          <div class="header-actions flex flex-wrap items-center justify-end gap-3">
            <span v-if="flashText" :class="['status-readout', flashKind]">{{ flashText }}</span>
            <template v-if="mode === 'guide'">
              <toggle-switch v-model="showImages" label="IMAGES" />
            </template>
            <header-button label="Channels" @click="openChannelsModal" :disabled="!guide"><sliders-icon /></header-button>
            <header-button v-if="!narrow" label="Refresh" @click="manualRefresh" :disabled="loading"><refresh-icon /></header-button>
          </div>
        </header>
        <div class="panel-body space-y-4">
          <div class="guide-top flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-x-6">
            <div class="chip-row mode-tabs md:flex-wrap">
              <button v-for="m in modes" :key="m.key" type="button"
                :class="['btn', 'btn-sm', mode === m.key ? 'btn-on' : '']" :aria-pressed="String(mode === m.key)"
                @click="setMode(m.key)">{{ m.label }}</button>
            </div>
            <div :class="['view-controls', 'flex-1', 'min-w-[12rem]', 'md:max-w-xs', 'md:ml-auto', { 'view-controls-sticky': mode !== 'guide' }]">
              <select v-if="narrow && mode === 'guide'" :value="day" @change="setDay(Number($event.target.value))"
                class="field-input day-select" aria-label="Day">
                <option v-for="d in dayChips" :key="d.day" :value="d.day">{{ d.label }}</option>
              </select>
              <input v-no-autofill v-model="searchQ" type="search" class="field-input" :placeholder="searchPlaceholder" :aria-label="searchPlaceholder"
                style="padding-top: 0.35rem; padding-bottom: 0.35rem;" />
            </div>
          </div>

          <template v-if="mode === 'guide' && searchActive">
            <p class="text-xs font-mono text-ink-mute">
              {{ searching ? 'Searching…' : searchResults.length + ' result' + (searchResults.length === 1 ? '' : 's') + ' for “' + searchQ.trim() + '”' }}
            </p>
            <div class="space-y-3">
              <article v-for="p in searchResults" :key="p.program_id + '-' + p.start"
                class="deck-card deck-card-clickable deck-card-with-image" role="button" tabindex="0"
                @click="openProgram(p, channelById(p.channelId))"
                @keydown.enter.prevent="openProgram(p, channelById(p.channelId))"
                @keydown.space.prevent="openProgram(p, channelById(p.channelId))">
                <programme-image :event-id="p.has_image ? p.program_id : null" :channel-id="p.channelId" :has-logo="hasChannelLogo(p.channelId)" :title="p.title" />
                <div class="deck-card-text">
                <div class="flex items-start justify-between gap-3">
                  <span class="deck-card-title">{{ p.title }}</span>
                  <span class="pill-group end">
                    <span v-if="isSeriesScheduled(p)" class="pill done">SERIES</span>
                    <span v-if="cellState(p) === 'recording'" class="pill recording">RECORDING</span>
                    <span v-else-if="cellState(p) === 'scheduled'" class="pill scheduled">SCHEDULED</span>
                    <span v-else-if="cellState(p) === 'series'" class="pill done">SERIES</span>
                    <span v-else-if="cellState(p) === 'recorded'" class="pill skipped">RECORDED</span>
                  </span>
                </div>
                <p class="deck-card-meta flex items-center gap-1.5">
                  <channel-logo class="shrink-0" :channel-id="p.channelId" :has-logo="hasChannelLogo(p.channelId)" />
                  <span>{{ p.channelName }} · {{ fmtDayTime(p.start) }}–{{ fmtClock(p.end) }}<template v-if="p.episode_title"> · {{ p.episode_title }}</template></span>
                </p>
                </div>
              </article>
              <p v-if="!searching && searchResults.length === 0" class="text-ink-dim text-sm">Nothing upcoming matches.</p>
            </div>
          </template>

          <template v-else-if="mode === 'guide'">
            <div v-if="!narrow" class="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-x-6">
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim">DAY</span>
                <div class="chip-row md:flex-wrap">
                  <button v-for="d in dayChips" :key="d.day" type="button"
                    :class="['btn', 'btn-sm', day === d.day ? 'btn-on' : '']"
                    @click="setDay(d.day)"><span class="normal-case">{{ d.label }}</span></button>
                </div>
              </div>
              <div class="flex flex-wrap items-center gap-x-6 gap-y-3 md:ml-auto">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim">JUMP</span>
                  <div class="chip-row">
                    <button type="button" class="btn btn-sm" @click="jumpNow">NOW</button>
                    <button type="button" class="btn btn-sm" @click="jumpTonight">TONIGHT</button>
                  </div>
                </div>
                <zoom-control :index="zoomIndex" :count="zoomLevelCount" @step="changeZoom" />
              </div>
            </div>
            <p v-if="guide?.stale" class="text-xs font-mono text-plex-yellow">
              Showing the cached guide. TVHeadend did not answer. It refreshes automatically on the next try.
            </p>
            <div v-if="errorCode === 'no-url'" class="space-y-3">
              <p class="text-sm text-ink">Set the TVHeadend URL in Settings.</p>
              <div class="flex items-center gap-2">
                <a href="#/settings" class="btn btn-sm btn-primary no-underline">OPEN SETTINGS</a>
                <button type="button" class="btn btn-sm" @click="loadDay(day, { force: true })"><refresh-icon /> RETRY</button>
              </div>
            </div>
            <div v-else-if="errorCode === 'no-channels'" class="space-y-3">
              <p class="text-sm text-ink">TVHeadend has no channels yet; scan and map them in TVHeadend.</p>
              <button type="button" class="btn btn-sm" @click="loadDay(day, { force: true })"><refresh-icon /> RETRY</button>
            </div>
            <div v-else-if="error" class="space-y-3">
              <p class="text-sm font-mono text-signal-orange-hi">{{ error }}</p>
              <p class="text-xs text-ink-dim">
                Check the TVHeadend connection in <a href="#/settings">Settings</a>.
              </p>
              <button type="button" class="btn btn-sm" @click="loadDay(day, { force: true })"><refresh-icon /> RETRY</button>
            </div>
            <list-skeleton v-else-if="loading && !guide" :rows="10" :row-height="guideRowRem + 'rem'" guide :guide-zoom="zoom" />
            <div v-else-if="guide" class="relative" :style="{ '--epg-rail-px': 'min(' + railPx + 'px, 38vw)' }">
              <div class="epg-grid-edge" aria-hidden="true" :style="{ height: railStripH + 'px', right: scrollbarW + 'px' }"></div>
              <button v-if="pinsOffscreen" type="button" class="epg-pinned-chip" @click="scrollRailTop"><arrow-up-icon /> {{ pinnedCount }} FAVOURITES</button>
              <button v-if="midnightOnScreen && day < 6" type="button" class="epg-pinned-chip epg-next-day-chip"
                :style="{ right: 'calc(' + scrollbarW + 'px + 0.4rem)' }" :aria-label="'Go to ' + nextDayLongLabel"
                @click="goToNextDay">{{ narrow ? nextDayWeekday : nextDayLabel }} <chevron-right-icon /></button>
              <div :class="['epg-scroll', 'epg-zoom-' + zoom, { 'epg-zooming': zooming }]" ref="scrollEl"
                @pointerover="onGridPointer" @pointermove="onGridPointer" @pointerout="onGridPointerOut"
                @pointerdown="hideTooltip" @focusin="onGridFocusIn" @focusout="onGridFocusOut">
              <div class="epg-canvas" :style="{ width: 'calc(var(--epg-rail-px) + ' + (trackWidth + trackTailPx) + 'px)' }">
                <div class="epg-ruler">
                  <div class="epg-ruler-corner">
                    <input v-no-autofill v-model="railFilter" type="search" class="field-input epg-corner-filter"
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
                  </div>
                </div>
                <div class="epg-midnight-line" aria-hidden="true" :style="{ left: 'calc(var(--epg-rail-px) + ' + midnightX + 'px)' }"></div>
                <div v-if="day === 6" class="epg-guide-end-lane" :style="{ left: 'calc(var(--epg-rail-px) + ' + midnightX + 'px)' }">
                  <span class="epg-guide-end">Guide ends {{ lastDayLabel }}</span>
                </div>
                <transition-group name="epg-rows" tag="div">
                <div v-for="{ kind, key, label, shown, ch } in railItems" :key="key"
                  v-show="shown"
                  v-memo="[ch, label, shown, loadingIds.has(ch?.id), loadingNoteMaxPx, nowMs, state, railNumWidth, showImages, zoom, thumbMinCellPx, dropTargetId === key, dropTargetId === key && dropAfter, dragPinId === key]"
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
                      <span v-if="cellState(p) === 'recording'" class="epg-cell-rec-fill" :style="{ width: recordingFillPercent(p) + '%' }"></span>
                      <template v-if="cellShowsText(p)">
                        <span class="epg-cell-title">{{ p.title }}</span>
                        <span class="epg-cell-meta">
                          <span v-if="cellState(p) === 'recording'" class="led-dot sm live"></span>
                          <span v-else-if="cellState(p) === 'scheduled'" class="led-dot sm" style="background:#1eb6ff"></span>
                          <span v-else-if="cellState(p) === 'series'" class="led-dot sm" style="background:#e2b03c"></span>
                          <span v-else-if="cellState(p) === 'recorded'" class="led-dot sm" style="background:#9a9289"></span>
                          <span v-if="isSeriesScheduled(p)" class="led-dot sm" style="background:#e2b03c"></span>
                          {{ fmtClock(p.start) }}
                        </span>
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
              <div v-if="narrow && !selected && !channelsModal" class="epg-float-cluster" role="group" aria-label="Jump and zoom">
                <button type="button" class="epg-float-btn" @click="jumpNow">NOW</button>
                <button type="button" class="epg-float-btn" @click="jumpTonight">TONIGHT</button>
                <button type="button" class="epg-float-btn epg-float-icon" aria-label="Zoom out"
                  :disabled="zoomIndex === 0" @click="changeZoom(-1)"><minus-icon /></button>
                <button type="button" class="epg-float-btn epg-float-icon" aria-label="Zoom in"
                  :disabled="zoomIndex === zoomLevelCount - 1" @click="changeZoom(1)"><plus-icon /></button>
              </div>
              </teleport>
            </div>
            <p v-if="stateLine" class="epg-state-line font-mono text-ink-mute">{{ stateLine }}</p>
          </template>

          <template v-else-if="mode === 'upcoming'">
            <p v-if="stateError" class="text-sm font-mono text-signal-orange-hi">{{ stateError }}</p>
            <list-skeleton v-else-if="!state" :rows="6" />
            <template v-else>
              <p v-if="state?.stale" class="text-xs font-mono text-plex-yellow">TVHeadend is not answering. This is its last known state.</p>
              <p v-if="upcoming.length === 0" class="text-ink-dim text-sm">Nothing scheduled in TVHeadend.</p>
              <p v-else-if="upcomingFiltered.length === 0" class="text-ink-dim text-sm">No upcoming recordings match “{{ searchQ.trim() }}”.</p>
              <div v-else class="space-y-3">
                <article v-for="r in upcomingFiltered" :key="r.programId + '-' + r.source"
                  class="deck-card deck-card-clickable deck-card-with-image" role="button" tabindex="0"
                  @click="openUpcoming(r)"
                  @keydown.enter.prevent="openUpcoming(r)"
                  @keydown.space.prevent="openUpcoming(r)">
                  <programme-image :event-id="r.hasImage ? r.programId : null" :channel-id="r.channelId" :has-logo="hasChannelLogo(r.channelId)" :title="r.name" />
                  <div class="deck-card-text">
                  <div class="flex items-start justify-between gap-3">
                    <span class="deck-card-title">{{ r.name }}</span>
                    <span class="pill-group end">
                      <template v-if="r.source === 'series'">
                        <span class="pill done">SERIES</span>
                        <span class="pill">EXPECTED</span>
                      </template>
                      <template v-else>
                        <span v-if="isSeriesRec(r)" class="pill done">SERIES</span>
                        <span v-else class="pill">ONE-OFF</span>
                        <span v-if="isActiveRecording(r)" class="pill recording">RECORDING</span>
                        <span v-else class="pill scheduled">SCHEDULED</span>
                      </template>
                    </span>
                  </div>
                  <p class="deck-card-meta flex items-center gap-1.5">
                    <channel-logo class="shrink-0" :channel-id="r.channelId" :has-logo="hasChannelLogo(r.channelId)" />
                    <span>{{ channelName(r.channelId) }} · {{ fmtDayTime(tsOf(r.startDate)) }}–{{ fmtClock(tsOf(r.endDate)) }}<template v-if="r.episodeTitle"> · {{ r.episodeTitle }}</template></span>
                  </p>
                  </div>
                </article>
              </div>
            </template>
          </template>

        </div>
      </section>

      <teleport to="body">
      <transition name="epg-sheet">
      <div v-if="selected" class="epg-modal-backdrop is-over-player" @click.self="closeModal">
        <section class="panel epg-modal">
          <header class="panel-header">
            <span class="panel-title">{{ selected.program.title }}</span>
            <button type="button" class="btn btn-icon epg-modal-x" @click="closeModal" aria-label="Close"><cross-icon /></button>
          </header>
          <programme-image v-if="selected.program.has_image" :key="selected.program.program_id" :event-id="selected.program.program_id" variant="hero"
            :channel-id="selected.channel?.id ?? selected.program.channelId" :has-logo="hasChannelLogo(selected.channel?.id ?? selected.program.channelId)"
            :title="selected.program.title" />
          <div class="panel-body space-y-4">
            <p class="text-sm font-mono text-ink-dim">
              {{ selected.channel?.name || channelName(selected.program.channelId) }}<template v-if="selected.program.start"> ·
              <span class="hidden md:inline">{{ fmtDayTime(selected.program.start) }}–{{ fmtClock(selected.program.end) }}</span><span class="md:hidden">{{ fmtShortRange(selected.program.start, selected.program.end) }}</span></template>
              <template v-if="ratingLabel(selected.program)"> · {{ ratingLabel(selected.program) }}</template>
              <template v-if="seLabel(selected.program)"> · {{ seLabel(selected.program) }}</template>
            </p>
            <p v-if="selected.program.episode_title" class="text-sm text-ink">{{ selected.program.episode_title }}</p>
            <p v-if="selected.program.synopsis" class="text-sm text-ink-dim leading-relaxed">{{ selected.program.synopsis }}</p>
            <p v-if="selectedStatusText" class="text-xs font-mono text-signal-blue-hi">{{ selectedStatusText }}</p>
            <p v-else-if="cellState(selected.program) === 'series'" class="text-xs font-mono" style="color:#e2b03c">
              A series recording in TVHeadend records this show.
            </p>
            <ul v-if="actionOutcomes.length && !cancelSeriesStep" class="action-outcomes">
              <li v-for="o in actionOutcomes" :key="o.label"><span class="action-outcome-label">{{ o.label }}</span> {{ o.text }}</li>
            </ul>
            <div v-if="showRecordSettings" class="grid grid-cols-2 gap-3">
              <div>
                <label class="field-label">START EARLY</label>
                <select v-model.number="leadTime" class="field-input">
                  <option v-for="m in leadOptions" :key="m" :value="m">{{ minutesLabel(m) }}</option>
                </select>
              </div>
              <div>
                <label class="field-label">RUN LATE</label>
                <select v-model.number="lagTime" class="field-input">
                  <option v-for="m in lagOptions" :key="m" :value="m">{{ minutesLabel(m) }}</option>
                </select>
              </div>
              <div v-if="selected.program.series_link" class="col-span-2">
                <label class="field-label">SERIES · EPISODES TO KEEP</label>
                <select v-model.number="episodesToKeep" class="field-input">
                  <option v-for="o in keepOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
              </div>
              <div v-if="selected.program.series_link" class="col-span-2 space-y-1">
                <toggle-switch v-model="anyChannel" :title="ANY_CHANNEL_HINT">RECORD ON ANY CHANNEL</toggle-switch>
                <p class="text-xs font-mono text-ink-mute">{{ ANY_CHANNEL_HINT }}</p>
              </div>
              <div class="col-span-2 space-y-1">
                <toggle-switch v-model="addToLibrary">ADD TO LIBRARY</toggle-switch>
                <p class="text-xs font-mono text-ink-mute">{{ libraryNote.text }}<template v-if="libraryNote.changeable"> Change it in <a href="#/settings/system/series">SERIES</a>.</template></p>
              </div>
            </div>
            <cancel-series-step v-if="cancelSeriesStep" :title="cancelSeriesStep.title" :episode-outcome="cancelSeriesStep.episodeOutcome"
              :title-match="cancelSeriesStep.titleMatch" :busy="modalBusy" @back="cancelSeriesStep = null" @confirm="cancelSelectedSeries" />
            <template v-else>
            <div class="epg-modal-actions programme-actions flex flex-wrap items-center justify-end gap-2 pt-1">
              <span v-if="modalStatusText" :class="['status-readout', modalStatusKind]">{{ modalStatusText }}</span>
              <template v-if="cellState(selected.program) === 'recording'">
                <button type="button" :class="['btn', 'btn-danger', { 'is-busy': modalAction === 'cancel' }]" @click="cancelSelected" :disabled="modalBusy">
                  <span class="btn-label"><stop-icon /> STOP RECORDING</span>
                  <span v-if="modalAction === 'cancel'" class="spinner spinner-overlay"></span>
                </button>
                <button v-if="selectedSeriesLink" type="button" class="btn btn-danger" @click="openCancelSeriesStep" :disabled="modalBusy">
                  CANCEL SERIES
                </button>
                <button v-else-if="selected.program.series_link" type="button" class="btn" :class="{ 'is-busy': modalAction === 'record-series' }" aria-label="Record series" @click="recordSelectedSeries" :disabled="modalBusy">
                  <span class="btn-label"><series-record-icon /> SERIES</span>
                  <span v-if="modalAction === 'record-series'" class="spinner spinner-overlay"></span>
                </button>
              </template>
              <template v-else-if="cellState(selected.program) === 'scheduled'">
                <button type="button" class="btn btn-danger" :class="{ 'is-busy': modalAction === 'cancel' }" @click="cancelSelected" :disabled="modalBusy">
                  <span class="btn-label">CANCEL RECORDING</span>
                  <span v-if="modalAction === 'cancel'" class="spinner spinner-overlay"></span>
                </button>
                <button v-if="selectedSeriesLink" type="button" class="btn btn-danger" @click="openCancelSeriesStep" :disabled="modalBusy">
                  CANCEL SERIES
                </button>
              </template>
              <template v-else-if="cellState(selected.program) === 'series'">
                <button type="button" class="btn btn-danger" @click="openCancelSeriesStep" :disabled="modalBusy">
                  CANCEL SERIES
                </button>
              </template>
              <template v-else-if="canRecord">
                <button type="button" :class="['btn', { 'btn-primary': dialogFocus !== 'series' && (dialogFocus === 'record' || !canWatchLive), 'is-busy': modalAction === 'record' }]" @click="recordSelected" :disabled="modalBusy">
                  <span class="btn-label"><record-icon /> RECORD</span>
                  <span v-if="modalAction === 'record'" class="spinner spinner-overlay"></span>
                </button>
                <button v-if="selected.program.series_link" type="button" :class="['btn', { 'btn-primary': dialogFocus === 'series', 'is-busy': modalAction === 'record-series' }]" aria-label="Record series" @click="recordSelectedSeries" :disabled="modalBusy">
                  <span class="btn-label"><series-record-icon /> SERIES</span>
                  <span v-if="modalAction === 'record-series'" class="spinner spinner-overlay"></span>
                </button>
              </template>
              <p v-else class="text-xs font-mono text-ink-mute">This programme has already aired.</p>
              <button v-if="canWatchLive" type="button" class="btn btn-primary" @click="watchSelected"><tv-icon /> WATCH LIVE</button>
            </div>
            </template>
          </div>
        </section>
      </div>
      </transition>
      </teleport>

      <teleport to="body">
      <transition name="epg-sheet">
      <div v-if="hdOffer" class="epg-modal-backdrop is-over-player" @click.self="hdOffer = null">
        <section class="panel epg-modal info-modal" role="alertdialog" aria-modal="true" aria-labelledby="hd-offer-title">
          <header class="panel-header">
            <span id="hd-offer-title" class="panel-title">This is the SD channel</span>
            <button type="button" class="btn btn-icon epg-modal-x" @click="hdOffer = null" aria-label="Close"><cross-icon /></button>
          </header>
          <div class="panel-body space-y-4">
            <p class="text-sm text-ink">{{ hdOffer.channel.name }} shows the same programme in HD.</p>
            <div class="epg-modal-actions flex flex-wrap items-center justify-end gap-2">
              <template v-if="hdOffer.action === 'record-series'">
                <button type="button" class="btn" @click="recordOffered('sd')"><series-record-icon /> SERIES IN SD</button>
                <button type="button" class="btn btn-primary" @click="recordOffered('hd')"><series-record-icon /> SERIES IN HD</button>
              </template>
              <template v-else>
                <button type="button" class="btn" @click="recordOffered('sd')"><record-icon /> RECORD IN SD</button>
                <button type="button" class="btn btn-primary" @click="recordOffered('hd')"><record-icon /> RECORD IN HD</button>
              </template>
            </div>
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
        <div v-if="recordingStateText(tooltip.programme)" :class="['epg-tooltip-state', cellState(tooltip.programme)]">
          <span :class="['led-dot', 'sm', { live: cellState(tooltip.programme) === 'recording' }]"></span>
          {{ recordingStateText(tooltip.programme) }}
        </div>
        <p v-if="tooltip.programme.synopsis" class="epg-tooltip-synopsis">{{ tooltip.programme.synopsis }}</p>
      </div>
      </transition>
      </teleport>

      <teleport to="body">
      <transition name="epg-sheet">
      <channels-modal v-if="channelsModal" :channels="guide?.channels || []" :hidden-ids="guide?.hiddenIds || []"
        :sort="guide?.sort" :hide-sd-simulcasts="guide?.hideSdSimulcasts" :hide-sd-channels="guide?.hideSdChannels"
        @close="channelsModal = false" @saved="onChannelPrefsSaved" />
      </transition>
      </teleport>
    </div>
  `,
  setup() {
    const { flashText, flashKind, flash } = useFlash()
    const mode = ref('guide')
    const modes = [
      { key: 'guide', label: 'GUIDE' },
      { key: 'upcoming', label: 'UPCOMING' },
    ]
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
        text: 'RECORD puts this airing in the one-off folder. SERIES gives the series its own folder in your TV library.',
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
      if (d === 0) return { day: 0, label: 'TODAY' }
      return { day: d, label: weekdayOfDayNumber(todayNumber.value + d) }
    }))

    const noonOf = (ms) => new Date(ms + 12 * 3_600_000)
    const nextDayNoon = computed(() => noonOf(guide.value?.dayEnd ?? 0))
    const nextDayLabel = computed(() => formatDate(nextDayNoon.value.getTime(), tz.value))
    const nextDayWeekday = computed(() => dateFormat({ weekday: 'short' }).format(nextDayNoon.value))
    const nextDayLongLabel = computed(() => formatDate(nextDayNoon.value.getTime(), tz.value, { long: true }))
    const lastDayLabel = computed(() => formatDate(noonOf(guide.value?.dayStart ?? 0).getTime(), tz.value))

    const dayTitle = computed(() => {
      const middayOfDayNumber = (todayNumber.value + day.value) * 86_400_000 + 43_200_000
      return formatDate(middayOfDayNumber, 'UTC', { weekday: narrow.value ? 'short' : 'long' })
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

    const upcoming = computed(() => {
      const list = state.value?.upcomingRecordings
        ?? (state.value?.futureRecordings || []).filter((r) => !r.pendingDelete)
      return [...list].sort((a, b) => tsOf(a.startDate) - tsOf(b.startDate))
    })

    const seriesTags = computed(() => state.value?.seriesTags || [])

    const scheduledCount = computed(() =>
      (state.value?.futureRecordings || []).filter((r) => !r.pendingDelete).length)

    const stateLine = computed(() => {
      if (!state.value) return ''
      const bits = [
        state.value.stale ? 'tvheadend unreachable' : 'tvheadend online',
        `${scheduledCount.value} scheduled`,
        `${seriesTags.value.length} series`,
      ]
      if (state.value.tunerCount) {
        bits.push(`${state.value.tunerCount} tuner${state.value.tunerCount === 1 ? '' : 's'}`)
      }
      if (state.value.storageInfo?.free) {
        bits.push(`${fmtBytes(state.value.storageInfo.free)} free`)
      }
      return bits.join(' · ')
    })

    const searchActive = computed(() => searchQ.value.trim().length >= 2)

    const searchPlaceholder = computed(() => {
      if (mode.value === 'upcoming') return 'Filter upcoming…'
      return 'Search the next 7 days…'
    })

    const listFilter = computed(() => searchQ.value.trim().toLowerCase())

    const upcomingFiltered = computed(() => {
      const q = listFilter.value
      if (!q) return upcoming.value
      return upcoming.value.filter((r) =>
        `${r.name || ''} ${r.episodeTitle || ''} ${channelName(r.channelId) || ''}`.toLowerCase().includes(q))
    })

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

    const recordOutcome = () => (isSelectedOnAir.value
      ? `Records from now until ${fmtClock(selected.value.program.end)}. The part already aired is not included.`
      : 'Records this airing only.')

    const recordSeriesOutcome = ({ recordingNow: episodeRecording }) => {
      const base = `Records every episode of "${selected.value.program.title}" ${selectedChannelLabel()}`
      if (episodeRecording) return `${base}. This episode keeps recording.`
      return isSelectedOnAir.value ? `${base}, starting with this one from now.` : `${base}.`
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

    const actionOutcomes = computed(() => {
      const program = selected.value?.program
      if (!program || program.past) return []
      const state = cellState(program)
      const hasSeries = Boolean(selectedSeriesLink.value)
      if (state === 'recording') {
        return [
          { label: 'STOP RECORDING', text: stopOutcome() },
          hasSeries && { label: 'CANCEL SERIES', text: cancelSeriesOutcome() },
          !hasSeries && program.series_link && { label: 'SERIES', text: recordSeriesOutcome({ recordingNow: true }) },
        ].filter(Boolean)
      }
      if (state === 'scheduled') {
        return [
          { label: 'CANCEL RECORDING', text: isSeriesScheduled(program) ? 'Skips this episode. The series keeps recording the others.' : 'Removes this recording from the schedule.' },
          hasSeries && { label: 'CANCEL SERIES', text: cancelSeriesOutcome() },
        ].filter(Boolean)
      }
      if (state === 'series') return [{ label: 'CANCEL SERIES', text: cancelSeriesOutcome() }]
      if (!canRecord.value) return []
      return [
        { label: 'RECORD', text: recordOutcome() },
        program.series_link && { label: 'SERIES', text: recordSeriesOutcome({ recordingNow: false }) },
      ].filter(Boolean)
    })

    const showRecordSettings = computed(() => {
      if (!canRecord.value || cancelSeriesStep.value) return false
      const state = cellState(selected.value.program)
      if (state === '') return true
      return state === 'recording' && !selectedSeriesLink.value && Boolean(selected.value.program.series_link)
    })

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

    const fmtShortRange = (start, end) => `${fmtDayTime(start)}–${fmtClock(end)}`

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
      if (state === 'recording') return 'recording now'
      if (state === 'scheduled') {
        return isSeriesScheduled(p) ? 'series recording scheduled' : 'one-off recording scheduled'
      }
      if (state === 'series') return 'series recording set'
      if (state === 'recorded') return 'recorded'
      return ''
    }

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

    const recordingFillPercent = (p) => {
      const span = p.end - p.start
      if (span <= 0) return 0
      return Math.min(100, Math.max(0, ((nowMs.value - p.start) / span) * 100))
    }

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
      if (mode.value === 'guide' && !searchActive.value) await scrollToNow()
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

    const setMode = async (m) => {
      if (m !== mode.value) searchQ.value = ''
      mode.value = m
      if (m !== 'guide') {
        loadState()
        return
      }
      if (day.value === 0) await scrollToNow()
      else await scrollToMs(clockOfDay(18))
    }

    const jumpNow = async () => {
      if (day.value !== 0) await setDay(0)
      else await scrollToNow()
    }

    const jumpTonight = async () => {
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

    const manualRefresh = async () => {
      guideByDay.clear()
      await Promise.all([loadDay(day.value, { force: true }), loadState({ fresh: true })])
      if (!error.value) flash({ msg: 'Guide refreshed.' })
    }

    const openProgram = (p, channel) => {
      leadTime.value = 2
      lagTime.value = 10
      episodesToKeep.value = 0
      anyChannel.value = false
      addToLibrary.value = true
      cancelSeriesStep.value = null
      dialogFocus.value = ''
      modalAction.value = ''
      setModalStatus('')
      selected.value = { program: p, channel }
      loadShowRules()
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
      openProgram(listed || handoff.program, channelById(handoff.channelId))
      dialogFocus.value = handoff.focus || ''
    }

    const closeModal = () => {
      recordDialogOverPlayer.value = false
      cancelSeriesStep.value = null
      dialogFocus.value = ''
      hdOffer.value = null
      selected.value = null
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

    const isSeriesRec = (r) =>
      r?.seriesLinkId != null && seriesLinkSet.value.has(String(r.seriesLinkId))

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

    watch([selected, channelsModal, zoom, guide, mode], forgetHoveredCell)

    let searchTimer = null
    watch(searchQ, () => {
      if (searchTimer) clearTimeout(searchTimer)
      if (mode.value !== 'guide' || !searchActive.value) { searchResults.value = []; return }
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
      if (active || !wasActive || mode.value !== 'guide') return
      if (day.value === 0) await scrollToNow()
      else await scrollToMs(clockOfDay(18))
    })

    const onKeydown = (e) => {
      if (e.key !== 'Escape') return
      if (hdOffer.value) hdOffer.value = null
      else if (selected.value) closeModal()
      else if (channelsModal.value) channelsModal.value = false
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
      mode, modes, setMode, day, dayChips, dayTitle, setDay, LISTINGS_LOADING_TEXT,
      loadingIds, loadingNoteMaxPx,
      guide, loading, error, errorCode, loadDay, state, stateError, stateLine,
      scrollEl, railPx, trackWidth, trackTailPx, railStripH, scrollbarW, railNumWidth, ticks, nowX, nowMs,
      zoom, zoomIndex, zoomLevelCount: EPG_ZOOM_LEVELS.length, zooming, thumbMinCellPx, guideRowRem, changeZoom,
      tooltip, tooltipEl, hideTooltip, onGridPointer, onGridPointerOut, onGridFocusIn, onGridFocusOut,
      recordingStateText, fmtProgrammeRange, cellKey, cellShowsText,
      visibleChannels, railNum, railFilter, pinnedCount, pinsOffscreen, scrollRailTop,
      midnightX, midnightOnScreen, goToNextDay, nextDayLabel, nextDayWeekday, nextDayLongLabel, lastDayLabel,
      cellState, cellStyle, cellWidth, cellTitle, isSeriesScheduled, isSeriesRec, recordingFillPercent,
      jumpNow, jumpTonight, manualRefresh,
      searchQ, searchActive, searchResults, searching, searchPlaceholder, upcomingFiltered,
      selected, openProgram, openUpcoming, closeModal, modalBusy, modalAction, canRecord,
      canWatchLive, watchSelected,
      modalStatusText, modalStatusKind,
      leadTime, lagTime, episodesToKeep, anyChannel, ANY_CHANNEL_HINT, addToLibrary, libraryNote,
      minutesLabel: (count) => formatMinutes(count, { long: true }), leadOptions: EPG_LEAD_OPTIONS, lagOptions: EPG_LAG_OPTIONS, keepOptions: EPG_KEEP_OPTIONS,
      recordSelected, recordSelectedSeries, hdOffer, recordOffered, cancelSelected, cancelSelectedSeries,
      dialogFocus, cancelSeriesStep, openCancelSeriesStep, showRecordSettings, selectedSeriesLink, selectedStatusText, actionOutcomes,
      upcoming,
      isActiveRecording: (r) => activeRecordingSet.value.has(String(r.programId)),
      busyId, channelsModal, openChannelsModal, onChannelPrefsSaved,
      togglePin, railItems, narrow, showImages, cellHasThumb,
      dropTargetId, dropAfter, dragPinId,
      onPinPointerDown, onPinPointerMove, onPinPointerUp, onPinPointerCancel,
      onRailResizeDown, onRailResizeMove, onRailResizeUp,
      channelById, channelName, hasChannelLogo, fmtClock, fmtDayTime, fmtShortRange, seLabel, ratingLabel, tsOf,
      flashText, flashKind,
    }
  },
}
