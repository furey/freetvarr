import { ref, computed, onMounted, onUnmounted, watch } from '/vendor/vue.esm-browser.prod.js'
import { liveRecordButton, liveSeriesButton, recordingProgramIdsOf } from '/live-record.js'
import {
  NO_GUIDE_TEXT,
  channelNumberLabel,
  seasonEpisodeOf,
  ratingLabel,
  genreLabel,
  programmeProgress,
  airingBoundary,
  airingCovers,
} from '/live-info.js'
import {
  usePlayerKeys,
  usePlayerFocus,
  singleTapActionFor,
  useControlsAutoHide,
  useInfoDismissTaps,
  useSwipeDown,
} from '/components/player-controls.js'
import { PLAYER_CHROME_COMPONENTS } from '/components/player-chrome.js'
import { PlayerMini, StartOverSheet, usePictureInPicture } from '/components/player-mini.js'
import { MultiViewLayer, MultiviewSheet } from '/components/multi-view.js'
import { minutesLeftText, miniMetaOf } from '/mini-player.js'
import { startOverOptionsOf, startOverNoteOf, startOverActionOf, behindLiveText, fromStartRecordingOf, NOTHING_BUFFERED_TEXT } from '/start-over.js'
import {
  behindPillText,
  liveEdgeOf,
  steadyBehindMinutesOf,
  liveHintText,
  percentWithin,
  programmeRangeText,
  joinedParts,
} from '/player-labels.js'
import { canRewind } from '/live-edge.js'
import { scheduledSecondsOf, fromStartScaleOf, fromStartTimelineOf, clampFromStartSeek, fromStartEndMsOf } from '/from-start-timeline.js'
import { fromStartAiringOf, recordedProgrammeAtMsOf } from '/from-start-programme.js'
import { api } from '/shared/api.js'
import {
  liveVideo,
  liveHls,
  watchLive,
  stopLive,
  applyLiveCaptions,
  syncCaptionPreferenceFromTracks,
  toggleLiveCaptions,
  liveInfoOpen,
  liveHolderText,
  fmtCountdown,
  onLiveFullscreenExit,
  trackBehindLive,
  seekLiveTo,
  placeLiveCaptions,
  keepSeekInsideBuffer,
  onLivePointerDown,
  onLivePointerUp,
  cancelLiveTap,
  onLiveClick,
  toggleLivePause,
  syncLivePaused,
  onLiveDoubleClick,
  skipLiveByKey,
  jumpToLive,
  returnToLive,
  watchFromStart,
  onLivePause,
  seekLiveAndPlay,
  setLiveVideo,
} from '/shared/live-session.js'
import {
  multi,
  slotClassOf,
  slotStyleOf,
  insetStyleOf,
  canAddPicture,
  watchAlongside,
  changePictureChannel,
  applySingleMuting,
  togglePlayerMuted,
  toggleKeyPicturePause,
  toggleKeyPictureSound,
} from '/shared/multi-session.js'
import {
  live,
  playback,
  liveCaptionsOn,
  isStageFullscreen,
  toggleStageFullscreen,
  enterStageFullscreen,
  useRotateToFullscreen,
  usePausedResync,
  playerMini,
  playerMuted,
} from '/shared/player-shared.js'
import { VIDEO_STATE_EVENTS } from '/player-paused.js'
import { recordingNow, pollRecordingNow, recordingChangeTick } from '/shared/recording-now.js'
import { programmeSheetOpen, useProgrammeSheet } from '/shared/programme-sheet-store.js'
import { now, fmtClockTz } from '/shared/time.js'
import { controlsHideMsOf } from '/controls-hide.js'
import { TUNE_IN_EXIT_MS, startsTuneInInfo, confirmedChannelAfter, tuneInExitWaitMs, isSlowTune, showsTuneInBadge, canDismissTuneIn, showsPrePlayChrome } from '/tune-in-info.js'

export const LivePlayer = {
  components: {
    ...PLAYER_CHROME_COMPONENTS,
    'player-mini': PlayerMini,
    'start-over-sheet': StartOverSheet,
    'multi-view-layer': MultiViewLayer,
    'multiview-sheet': MultiviewSheet,
  },
  template: `
    <teleport to="body">
    <transition name="pl-fade">
    <div v-show="live.open" :class="['pl-backdrop', { 'is-mini': mini }]" :role="mini ? 'region' : 'dialog'" :aria-label="mini ? 'Miniplayer' : 'Live TV'">
      <div ref="frameEl" tabindex="-1" :class="['live-frame', 'pl-frame', { 'is-controls-hidden': !controlsShown && !mini, 'is-multi': multi.active, 'is-tune-in': tuneInShown, 'is-tune-in-exit': tuneInExit, 'is-heading-held': headingHeld }]"
        :style="multiFrameStyle" @pointerdown="onFramePointerDownAll" @pointerup="onFramePointerUpAll"
        @pointercancel="cancelLiveTap" @pointermove="onControlsPointerMove" @click.capture="onFrameClickAll" @dblclick.capture="onFrameDoubleClickAll">
        <video ref="videoEl" :class="['live-video', 'pl-video', primarySlotClass, { 'is-veiled': chips !== 'hidden' }]" :style="primarySlotStyle" playsinline controlslist="nofullscreen"></video>
        <div class="player-tap-layer" aria-hidden="true"></div>
        <div v-if="chips !== 'hidden'" :key="chipsRun" :class="['live-chips', chips]" aria-hidden="true">
          <span v-for="n in 3" :key="n" class="live-chip-orbit" :style="{ '--i': n - 1 }">
            <span class="live-chip-arm"><i class="live-chip"></i></span>
          </span>
        </div>
        <div v-if="chips === 'ended'" class="live-chips-row" aria-hidden="true">
          <i v-for="n in 3" :key="n" class="live-chip"></i>
        </div>
        <span v-if="chips === 'tuning' && !tuneInShown" class="live-chip-caption">{{ live.channel?.name }} · {{ statusText || TUNING_TEXT }}</span>
        <span v-else-if="chips === 'tuning' && slowTune" class="live-chip-caption" role="status">{{ SLOW_TUNE_TEXT }}</span>
        <div class="pl-scrim is-top" aria-hidden="true"></div>
        <transition name="pl-classification">
          <classification-chip v-if="tuneInClassification && !panelOpen && live.phase === 'live'" variant="player"
            class="pl-classification" :classification="tuneInClassification" />
        </transition>
        <div class="pl-scrim is-bottom" aria-hidden="true"></div>
        <player-info-panel :open="panelOpen" panel-id="live-info">
          <template #image>
          <programme-image v-if="info.now" :key="info.now.program_id" class="live-info-image" variant="info"
            :event-id="info.now.has_image ? info.now.program_id : null" :title="info.now.title"
            :channel-id="live.channel?.id" :has-logo="Boolean(live.channel?.hasLogo)" />
          </template>
            <p class="live-info-channel">
              <channel-logo class="live-info-logo" :channel-id="live.channel?.id" :has-logo="Boolean(live.channel?.hasLogo)" />
              <span class="truncate">{{ infoChannelLabel }}</span>
              <span v-if="isBehindLive && !live.fromStart" class="live-info-buffer">From buffer</span>
            </p>
            <template v-if="info.now">
              <p class="live-info-title">{{ info.now.title }}</p>
              <p v-if="infoEpisodeLine" class="live-info-episode">{{ infoEpisodeLine }}</p>
              <div class="live-info-times">
                <span>{{ fmtClockTz(info.now.start) }}–{{ fmtClockTz(info.now.end) }}</span>
                <div class="progress-track"><div class="progress-fill" :style="{ width: infoProgress + '%' }"></div></div>
              </div>
              <p v-if="infoMetaLine || infoClassification" class="live-info-meta">
                <span v-if="infoMetaLine">{{ infoMetaLine }}</span>
                <classification-chip v-if="infoClassification" variant="inline" :classification="infoClassification" :advice="info.now?.advice || []" />
              </p>
              <p v-if="info.now.synopsis" class="live-info-synopsis">{{ info.now.synopsis }}</p>
            </template>
            <p v-else-if="tuneInShown && !info.loaded && live.nowTitle" class="live-info-title">{{ live.nowTitle }}</p>
            <p v-else-if="info.loaded && !info.next" class="live-info-empty">{{ NO_GUIDE_TEXT }}</p>
            <p v-if="info.next && !tuneInShown" class="live-info-next">
              Next <span class="live-info-next-title">{{ info.next.title }}</span> {{ fmtClockTz(info.next.start) }}
            </p>
        </player-info-panel>
        <player-top-bar :channel-id="live.channel?.id" :has-logo="Boolean(live.channel?.hasLogo)" :title="playerTitle"
          :subtitle="playerSubtitle" back-label="Stop and close" :info-open="panelOpen" info-id="live-info"
          :has-captions="Boolean(live.captions)" :captions-on="captionsOn" :fullscreen="isStageFullscreen"
          :can-pip="canPip" :pip-active="pipActive" :can-minimise="true" :muted="playerMuted"
          @back="stopLive" @toggle-info="toggleInfo" @toggle-captions="toggleLiveCaptions" @toggle-fullscreen="toggleLiveFullscreen"
          @toggle-pip="togglePip" @minimise="minimise" @toggle-mute="togglePlayerMuted"
          :actions="topActions" :has-record="!prePlayChrome" :pre-play="prePlayChrome" @action="onTopAction">
          <template #default="{ compact }">
            <button v-if="!prePlayChrome" type="button" :class="['pl-pill', 'is-record', { 'is-recording': recordButton.recording, 'is-compact': compact }]"
              :disabled="recordButton.disabled" :title="recordButton.title" :aria-label="recordButton.ariaLabel" @click="recordFromLive">
              <span class="pl-record-dot" aria-hidden="true"></span><span class="pl-record-text">{{ recordButton.recording ? 'Recording' : 'Record' }}</span>
            </button>
          </template>
        </player-top-bar>
        <p v-if="conflictText && live.phase === 'live'" class="pl-notice" role="status">{{ conflictText }}</p>
        <player-center-controls v-if="live.phase === 'live' && chips === 'hidden' && !panelOpen && !tuneInExit" :paused="shownPaused"
          :show-start-over="startOverOptions.length > 0" :start-over-disabled="startOverAction.kind === 'none'" :start-over-title="startOverButtonTitle"
          @start-over="openStartOver" @toggle-pause="toggleLivePause">
          <template #end>
            <span v-if="liveEdge.atEdge" class="pl-live-status"><i aria-hidden="true"></i>LIVE</span>
            <template v-else>
              <button type="button" class="pl-go-live" @click="returnToLive"><go-live-icon />Go live</button>
              <span class="pl-centre-label">{{ liveEdge.label }}</span>
            </template>
          </template>
        </player-center-controls>
        <div v-if="live.phase === 'ended'" class="pl-ended">
          <p class="pl-ended-message">{{ live.message }}</p>
          <ul v-if="live.holders.length" class="pl-ended-holders">
            <li v-for="h in live.holders" :key="h.tuner">{{ liveHolderText(h) }}</li>
          </ul>
          <div class="pl-ended-actions">
            <button type="button" class="ui-button ui-button-primary" @click="retryLive"><refresh-icon /> Try again</button>
            <button type="button" class="ui-button ui-button-secondary" @click="stopLive">Close</button>
          </div>
        </div>
        <footer v-if="live.phase === 'live' && !panelOpen && !tuneInExit" class="pl-bottom">
          <player-scrubber v-if="hasBufferBar" :min="liveScrubber.min" :max="liveScrubber.max" :value="liveScrubber.value"
            :fill-percent="liveScrubber.fillPercent" :buffer-percent="liveScrubber.bufferPercent" :edge-percent="liveScrubber.edgePercent"
            :growing="liveScrubber.growing" :class="{ 'is-scrubbing': live.scrubbing }"
            :start-text="liveScrubber.startText" :end-text="liveScrubber.endText" :aria-label="liveScrubber.ariaLabel"
            :value-text="scrubberPill.text" @scrub="onLiveScrubInput" @commit="onLiveScrubCommit" />
          <p class="pl-hint">{{ hintText }}</p>
        </footer>
        <div v-if="live.skipHint" :key="live.skipHint.key" :class="['live-skip-hint', live.skipHint.side]" aria-hidden="true">
          <span>{{ live.skipHint.label }}</span>
        </div>
        <span class="sr-only" aria-live="polite">{{ live.skipHint?.spoken || '' }}</span>
        <multi-view-layer v-if="multi.active && !mini" :primary-title="playerTitle" :primary-meta="miniMeta"
          @change-channel="openPickerFor" @add-channel="openAddPicker" @close="stopLive" />
        <player-mini v-if="mini" :title="playerTitle" :meta="miniMeta" is-live :progress="miniProgress"
          :paused="shownPaused" :pause-disabled="live.phase !== 'live'" :can-pip="canPip" :pip-active="pipActive" :muted="playerMuted"
          :has-captions="Boolean(live.captions)" :captions-on="captionsOn" @toggle-captions="toggleLiveCaptions"
          @expand="expand" @toggle-pause="toggleLivePause" @close="stopLive" @toggle-pip="togglePip" @toggle-mute="togglePlayerMuted" />
      </div>
    </div>
    </transition>
    <start-over-sheet :open="startOverOpen" :options="startOverOptions" :note="startOverNote"
      @choose="chooseStartOver" @close="startOverOpen = false" />
    <multiview-sheet :open="pickerOpen" :target="pickerTarget" :watching-title="playerTitle"
      @choose="choosePickerChannel" @close="pickerOpen = false" />
    </teleport>
  `,
  setup() {
    const videoEl = ref(null)
    const frameEl = ref(null)
    const chips = ref(live.phase === 'tuning' ? 'tuning' : 'hidden')
    const chipsRun = ref(0)
    let chipsTimer = null
    let chipsShownAt = 0
    let handOffPending = false
    const tuneInInfo = ref(false)
    const tuneInExit = ref(false)
    const headingHeld = ref(false)
    let confirmedChannelId = null
    let tuneInShownAt = 0
    let tuneInExitTimer = null
    let releaseControlsQuietly = false

    const startTuneIn = () => {
      clearTimeout(tuneInExitTimer)
      tuneInShownAt = Date.now()
      tuneInExit.value = false
      tuneInInfo.value = true
      headingHeld.value = true
      releaseControlsQuietly = true
    }

    const endTuneIn = () => {
      clearTimeout(tuneInExitTimer)
      if (!tuneInInfo.value) return
      tuneInExit.value = true
      tuneInInfo.value = false
      tuneInExitTimer = setTimeout(finishTuneInExit, TUNE_IN_EXIT_MS)
    }

    const finishTuneInExit = () => {
      if (chips.value === 'handoff') showChips('hidden')
      tuneInExit.value = false
    }

    const clearTuneIn = () => {
      clearTimeout(tuneInExitTimer)
      tuneInInfo.value = false
      tuneInExit.value = false
      headingHeld.value = false
      releaseControlsQuietly = false
    }

    const endTuneInAfterMinimum = () => {
      const wait = tuneInExitWaitMs({ shownAtMs: tuneInShownAt, nowMs: Date.now(), minimumMs: controlsHideMsOf(localStorage) })
      if (wait === 0) return endTuneIn()
      clearTimeout(tuneInExitTimer)
      tuneInExitTimer = setTimeout(endTuneIn, wait)
    }

    const takesQuietRelease = () => {
      const quiet = releaseControlsQuietly
      releaseControlsQuietly = false
      return quiet
    }

    const showChips = (state) => {
      clearTimeout(chipsTimer)
      handOffPending = false
      if (state === 'tuning' && chips.value !== 'tuning') {
        chipsRun.value += 1
        chipsShownAt = Date.now()
      }
      chips.value = state
    }

    const animateChipsAway = () => {
      handOffPending = false
      if (chips.value !== 'tuning' || live.phase !== 'live') return
      endTuneInAfterMinimum()
      chips.value = 'handoff'
      chipsTimer = setTimeout(() => { chips.value = 'hidden' }, CHIPS_HANDOFF_MS)
    }

    const handOffToVideo = () => {
      if (chips.value !== 'tuning' || live.phase !== 'live' || handOffPending) return
      if (liveVideo.paused || liveVideo.readyState < HAVE_FUTURE_DATA) return
      handOffPending = true
      const wait = Math.max(0, CHIPS_MIN_SHOWN_MS - (Date.now() - chipsShownAt))
      chipsTimer = setTimeout(animateChipsAway, wait)
    }

    watch(now, () => {
      trackBehindLive()
      syncLivePaused({ type: 'tick' })
    })
    const shownPaused = computed(() => live.paused || live.stuck)

    watch(() => live.phase, (phase) => {
      syncLivePaused()
      if (phase === 'tuning') return showChips('tuning')
      if (phase === 'ended') return showChips('ended')
      if (phase === 'idle') return showChips('hidden')
    })

    const behindMinutes = ref(0)
    const isBehindLive = computed(() => live.phase === 'live' && behindMinutes.value > 0)

    const slowTune = computed(() => isSlowTune({ phase: live.phase, startedAtMs: live.tuningStartedAt, nowMs: now.value.getTime() }))

    const statusText = computed(() => {
      if (live.phase === 'ended') return live.message
      if (live.phase !== 'tuning') return ''
      return slowTune.value ? 'Tuning… still waiting for a signal' : TUNING_TEXT
    })

    const conflictText = computed(() => {
      if (!live.conflict) return ''
      const wait = fmtCountdown(live.conflict.startsAt - now.value.getTime())
      return `"${live.conflict.title}" needs this tuner at ${fmtClockTz(live.conflict.startsAt)} (in ${wait})`
    })

    const mini = playerMini
    watch(() => (live.open || playback.open) && !mini.value, (open) => {
      document.body.classList.toggle(PLAYER_OPEN_CLASS, open)
    }, { immediate: true })
    watch(() => (live.open || playback.open) && mini.value, (isMini) => {
      document.body.classList.toggle(PLAYER_MINI_CLASS, isMini)
    }, { immediate: true })

    onMounted(() => {
      setLiveVideo(videoEl.value)
      applySingleMuting()
      liveVideo.addEventListener('webkitendfullscreen', onLiveFullscreenExit)
      liveVideo.addEventListener('pause', onLivePause)
      for (const type of VIDEO_STATE_EVENTS) liveVideo.addEventListener(type, syncLivePaused)
      liveVideo.addEventListener('play', keepSeekInsideBuffer)
      liveVideo.addEventListener('seeked', trackBehindLive)
      liveVideo.addEventListener('timeupdate', trackBehindLive)
      liveVideo.addEventListener('pause', trackBehindLive)
      liveVideo.addEventListener('seeking', keepSeekInsideBuffer)
      liveVideo.addEventListener('playing', handOffToVideo)
      liveVideo.addEventListener('canplay', handOffToVideo)
      liveVideo.textTracks?.addEventListener?.('addtrack', onTextTrackAdded)
      liveVideo.textTracks?.addEventListener?.('change', syncCaptionPreferenceFromTracks)
    })
    onUnmounted(() => {
      clearTimeout(chipsTimer)
      clearTimeout(tuneInExitTimer)
    })
    usePausedResync(syncLivePaused)
    useRotateToFullscreen({
      isEligible: () => live.open && !mini.value && !multi.active && live.phase === 'live',
      enter: () => enterStageFullscreen({ stage: frameEl.value, video: liveVideo }),
      getVideo: () => liveVideo,
    })

    const retryLive = () => watchLive({ channel: live.channel, nowTitle: live.nowTitle })

    const onTextTrackAdded = (e) => {
      e.track?.addEventListener?.('cuechange', placeLiveCaptions)
      if (!liveHls) applyLiveCaptions()
    }

    const infoOpen = liveInfoOpen
    const airing = ref(EMPTY_AIRING)
    const bufferedAiring = ref(null)
    let airingTimer = null
    let bufferedLoading = false

    const tuneInShown = computed(() => tuneInInfo.value && !infoOpen.value && !mini.value && !multi.active)
    const panelOpen = computed(() => infoOpen.value || tuneInShown.value)
    const prePlayChrome = computed(() => showsPrePlayChrome({ phase: live.phase, headingHeld: headingHeld.value }))

    watch([() => live.open, () => live.phase, () => live.channel?.id], ([open, phase, channelId]) => {
      if (!open) {
        confirmedChannelId = null
        return clearTuneIn()
      }
      if (startsTuneInInfo({ phase, channelId, confirmedChannelId, multiview: multi.active })) startTuneIn()
      confirmedChannelId = confirmedChannelAfter({ phase, channelId, confirmedChannelId })
    }, { immediate: true })

    const dismissTuneIn = () => {
      if (canDismissTuneIn({ phase: live.phase })) endTuneIn()
    }

    const closePanel = () => {
      if (tuneInShown.value) return dismissTuneIn()
      infoOpen.value = false
    }
    const panelShown = computed({
      get: () => panelOpen.value,
      set: (open) => {
        if (!open) closePanel()
      },
    })

    const toggleInfo = () => {
      if (tuneInShown.value) return dismissTuneIn()
      infoOpen.value = !infoOpen.value
    }
    const toggleLiveFullscreen = () => toggleStageFullscreen({ stage: frameEl.value, video: liveVideo })
    live.customControls = true

    const bufferSpan = computed(() =>
      (live.bufferFrom == null || live.bufferTo == null ? 0 : live.bufferTo - live.bufferFrom))
    const hasBufferBar = computed(() => live.phase === 'live' && (live.fromStart
      ? live.bufferTo != null
      : live.bufferSeconds > 0 && canRewind({ span: bufferSpan.value })))
    const shownLivePosition = computed(() => (live.scrubbing ? live.scrubValue : live.position))
    const liveFillPercent = computed(() =>
      (bufferSpan.value
        ? percentWithin({ value: shownLivePosition.value, min: live.bufferFrom, max: live.bufferTo })
        : 100))
    const shownBehindSeconds = computed(() =>
      (live.scrubbing && live.bufferTo != null ? live.bufferTo - live.scrubValue : live.behindSeconds))
    watch(shownBehindSeconds, (seconds) => {
      const previous = live.scrubbing ? 0 : behindMinutes.value
      behindMinutes.value = live.phase === 'live' ? steadyBehindMinutesOf({ seconds, previous }) : 0
    }, { immediate: true })
    const scrubberPill = computed(() => {
      if (live.fromStart) return { text: behindLiveText(behindMinutes.value * 60), live: false }
      if (behindMinutes.value > 0) return { text: behindPillText(behindMinutes.value), live: false }
      return live.paused ? { text: 'PAUSED', live: false } : { text: 'LIVE', live: true }
    })
    const liveEdge = computed(() => liveEdgeOf({ behindMinutes: behindMinutes.value, fromStart: live.fromStart }))
    const bufferStartText = computed(() => (live.fromStart
      ? fmtClockTz(live.fromStart.recordingStartedAt)
      : fmtClockTz(now.value.getTime() - bufferSpan.value * 1000)))
    const bufferEndText = computed(() => fmtClockTz(now.value.getTime()))
    const hintText = computed(() => (live.fromStart
      ? `Watching ${live.fromStart.title || 'the recording'} from the start while it keeps recording.`
      : liveHintText(live.bufferSeconds)))

    const fromStartFinished = computed(() => live.fromStart?.growing === false)
    const fromStartEdge = computed(() => {
      const playable = live.bufferTo ?? 0
      return fromStartFinished.value ? live.fromStart.edgeSeconds || playable : playable
    })
    const fromStartHeldScale = ref(null)
    const fromStartScale = computed(() => fromStartScaleOf({
      scheduledSeconds: scheduledSecondsOf({
        startedAtMs: live.fromStart?.recordingStartedAt, scheduledEndMs: live.fromStart?.scheduledEndAt,
      }),
      edgeSeconds: fromStartEdge.value,
      heldSeconds: fromStartHeldScale.value,
      finished: fromStartFinished.value,
    }))
    watch(fromStartScale, (seconds) => { fromStartHeldScale.value = live.fromStart ? seconds : null })
    watch(() => live.fromStart?.dvrUuid, () => { fromStartHeldScale.value = null })
    const liveScrubber = computed(() => {
      if (!live.fromStart) {
        return {
          min: live.bufferFrom ?? 0, max: live.bufferTo ?? 0, value: shownLivePosition.value,
          fillPercent: liveFillPercent.value, bufferPercent: 100, edgePercent: null, growing: false,
          startText: bufferStartText.value, endText: bufferEndText.value, ariaLabel: 'Position in the live buffer',
        }
      }
      const timeline = fromStartTimelineOf({
        position: shownLivePosition.value, edgeSeconds: fromStartEdge.value, scaleSeconds: fromStartScale.value,
      })
      const startedAtMs = live.fromStart.recordingStartedAt
      return {
        min: 0, max: fromStartScale.value, value: timeline.position,
        fillPercent: timeline.playedPercent, bufferPercent: timeline.availablePercent,
        edgePercent: fromStartFinished.value ? null : timeline.edgePercent, growing: true,
        startText: fmtClockTz(startedAtMs),
        endText: fmtClockTz(fromStartEndMsOf({ startedAtMs, scaleSeconds: fromStartScale.value })),
        ariaLabel: 'Position in the recording',
      }
    })

    const onLiveScrubInput = (value) => {
      live.scrubbing = true
      live.scrubValue = live.fromStart ? clampFromStartSeek({ value, edgeSeconds: fromStartEdge.value }) : value
    }

    const onLiveScrubCommit = (value) => {
      live.scrubbing = false
      seekLiveTo(value)
    }

    const startOverOpen = ref(false)
    const fromStartRecording = computed(() => fromStartRecordingOf({
      active: recordingNow.value.active,
      channelId: live.channel?.id,
      nowMs: now.value.getTime(),
    }))
    const startOverOptions = computed(() => startOverOptionsOf({
      recording: fromStartRecording.value || (live.fromStart ? { ...live.fromStart, canPlayFromStart: true, start: live.fromStart.recordingStartedAt } : null),
      hasBuffer: live.bufferSeconds > 0 && !live.fromStart,
      bufferStartMs: hasBufferBar.value && !live.fromStart ? now.value.getTime() - bufferSpan.value * 1000 : null,
      nowMs: now.value.getTime(),
      clockText: fmtClockTz,
    }))
    const startOverNote = computed(() => startOverNoteOf(startOverOptions.value))
    const startOverAction = computed(() => startOverActionOf(startOverOptions.value))
    const startOverButtonTitle = computed(() => {
      if (startOverAction.value.kind === 'direct') return startOverAction.value.title
      if (startOverAction.value.kind === 'none') return NOTHING_BUFFERED_TEXT
      return 'Start over'
    })
    const openStartOver = () => {
      const action = startOverAction.value
      if (action.kind === 'direct') return chooseStartOver(action.key)
      if (action.kind === 'sheet') startOverOpen.value = true
    }
    const chooseStartOver = (key) => {
      startOverOpen.value = false
      if (key === 'tuned-in') return live.bufferFrom != null && seekLiveAndPlay(live.bufferFrom)
      if (live.fromStart) return seekLiveAndPlay(0)
      if (fromStartRecording.value) watchFromStart(fromStartRecording.value)
    }

    const { canPip, pipActive, togglePip } = usePictureInPicture({ videoEl })

    const minimise = () => {
      infoOpen.value = false
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
      mini.value = true
    }
    const expand = () => { mini.value = false }

    const miniMeta = computed(() => miniMetaOf([
      live.channel?.name,
      live.fromStart ? behindLiveText(behindMinutes.value * 60) : minutesLeftText({ endMs: info.value.now?.end, nowMs: now.value.getTime() }),
    ]))
    const miniProgress = computed(() => infoProgress.value)

    const pickerOpen = ref(false)
    const pickerTarget = ref('add')
    const openPicker = () => {
      pickerTarget.value = !multi.active || canAddPicture.value ? 'add' : 'secondary'
      pickerOpen.value = true
    }
    const openPickerFor = (picture) => {
      pickerTarget.value = picture
      pickerOpen.value = true
    }
    const openAddPicker = () => openPickerFor('add')
    const choosePickerChannel = (channel) => {
      pickerOpen.value = false
      if (pickerTarget.value === 'add') return watchAlongside(channel)
      changePictureChannel({ picture: pickerTarget.value, channel })
    }
    const primarySlotClass = computed(() => slotClassOf('primary'))
    const primarySlotStyle = computed(() => slotStyleOf('primary'))
    const multiFrameStyle = computed(insetStyleOf)

    const {
      controlsShown, revealControls, hideControls, onPointerMove: onControlsPointerMove, onPointerDown: onControlsPointerDown,
    } = useControlsAutoHide({
      enabled: computed(() => live.open && !mini.value && !multi.active),
      holdShown: computed(() => shownPaused.value || live.phase !== 'live' || live.scrubbing || infoOpen.value || tuneInShown.value
        || (chips.value !== 'hidden' && !tuneInExit.value) || programmeSheetOpen.value),
      quietRelease: takesQuietRelease,
      rootEl: frameEl,
    })
    watch(controlsShown, (shown) => {
      if (shown && !tuneInInfo.value && !tuneInExit.value) headingHeld.value = false
      live.captionsLifted = shown
      placeLiveCaptions()
    }, { immediate: true })
    watch(mini, placeLiveCaptions)

    const { onSwipePointerDown, onSwipePointerUp } = useSwipeDown({
      enabled: () => live.open && !mini.value && !multi.active && !infoOpen.value,
      onSwipe: minimise,
    })
    const isFullPlayerTap = () => !mini.value && !multi.active
    const onFramePointerDownAll = (e) => {
      if (!isFullPlayerTap()) return
      onControlsPointerDown(e)
      onSwipePointerDown(e)
      onFramePointerDown(e)
    }
    const onFramePointerUpAll = (e) => {
      if (!isFullPlayerTap()) return
      if (onSwipePointerUp(e)) return cancelLiveTap()
      onFramePointerUp(e)
    }
    const onFrameClickAll = (e) => {
      if (isFullPlayerTap()) onFrameClick(e)
    }
    const onFrameDoubleClickAll = (e) => {
      if (isFullPlayerTap()) onFrameDoubleClick(e)
    }

    const { onFramePointerDown, onFramePointerUp, onFrameClick, onFrameDoubleClick } = useInfoDismissTaps({
      infoOpen: panelShown,
      onPointerDown: onLivePointerDown,
      onPointerUp: (e) => onLivePointerUp(e, {
        onSingleTap: singleTapActionFor({ pointerType: e.pointerType, controlsShown, revealControls, hideControls, togglePause: toggleLivePause }),
      }),
      onClick: onLiveClick,
      onDoubleClick: onLiveDoubleClick,
    })

    usePlayerFocus({ isOpen: computed(() => live.open), isMini: mini, rootEl: frameEl })

    usePlayerKeys({
      isActive: () => live.open && !mini.value && !programmeSheetOpen.value && !startOverOpen.value && !pickerOpen.value,
      infoOpen: panelShown,
      close: stopLive,
      toggleInfo,
      canToggleCaptions: () => live.captions && !infoOpen.value,
      toggleCaptions: toggleLiveCaptions,
      togglePause: () => (multi.active ? toggleKeyPicturePause() : toggleLivePause()),
      skip: skipLiveByKey,
      toggleFullscreen: toggleLiveFullscreen,
      toggleMute: () => (multi.active ? toggleKeyPictureSound() : togglePlayerMuted()),
    })

    const isCurrentChannel = (channelId) => live.open && live.channel?.id === channelId

    const loadAiring = async () => {
      clearTimeout(airingTimer)
      const channelId = live.channel?.id
      if (!isCurrentChannel(channelId)) return
      const result = await fetchChannelAiring({ channelId, atMs: Date.now() })
      if (!isCurrentChannel(channelId)) return
      airing.value = result
      const boundary = airingBoundary(result)
      if (boundary == null) return
      airingTimer = setTimeout(loadAiring, Math.max(0, boundary - Date.now()) + AIRING_BOUNDARY_GRACE_MS)
    }

    const loadBufferedAiring = async (atMs) => {
      const channelId = live.channel?.id
      bufferedLoading = true
      const result = await fetchChannelAiring({ channelId, atMs })
      bufferedLoading = false
      if (isCurrentChannel(channelId)) bufferedAiring.value = result
    }

    watch(() => live.open && live.channel?.id, (id) => {
      clearTimeout(airingTimer)
      airing.value = EMPTY_AIRING
      bufferedAiring.value = null
      if (!live.open) infoOpen.value = false
      if (id) loadAiring()
    }, { immediate: true })

    const playingAtMs = computed(() => now.value.getTime() - live.behindSeconds * 1000)

    watch(playingAtMs, (atMs) => {
      if (!isBehindLive.value || live.fromStart || bufferedLoading) return
      if (!airingCovers({ airing: bufferedAiring.value, atMs })) loadBufferedAiring(atMs)
    })

    const fromStartGuide = ref(null)
    const loadFromStartGuide = async () => {
      const fromStart = live.fromStart
      fromStartGuide.value = null
      const atMs = fromStart && recordedProgrammeAtMsOf(fromStart)
      if (atMs == null || !live.channel?.id) return
      const result = await fetchChannelAiring({ channelId: live.channel.id, atMs })
      if (live.fromStart === fromStart) fromStartGuide.value = result
    }
    watch(() => live.open && live.fromStart?.dvrUuid, loadFromStartGuide, { immediate: true })

    const info = computed(() => {
      if (live.fromStart) return fromStartAiringOf({ programme: live.fromStart.programme, fetched: fromStartGuide.value })
      return (isBehindLive.value && bufferedAiring.value) || airing.value
    })

    watch(info, (shown) => {
      if (shown.now) live.nowTitle = shown.now.title
    })

    const playerTitle = computed(() => info.value.now?.title || live.nowTitle || live.channel?.name || '')

    const playerSubtitle = computed(() => joinedParts([
      live.channel?.name,
      programmeRangeText({ program: info.value.now, clockText: fmtClockTz }),
      info.value.next ? `Next: ${info.value.next.title}` : '',
    ]))

    const infoChannelLabel = computed(() =>
      [channelNumberLabel(live.channel?.number), live.channel?.name].filter(Boolean).join(' '))

    const infoEpisodeLine = computed(() => {
      const program = info.value.now
      return program ? [seasonEpisodeOf(program), program.episode_title].filter(Boolean).join(' · ') : ''
    })

    const infoMetaLine = computed(() => genreLabel(info.value.now?.genre))
    const infoClassification = computed(() => ratingLabel(info.value.now))

    const tuneInClassification = ref(null)
    let tuneInTimer = null
    let lastBadgeKey = null
    let panelBadgeKey = null

    const hideTuneInBadge = () => {
      clearTimeout(tuneInTimer)
      tuneInClassification.value = null
    }

    const showTuneInBadge = (code) => {
      hideTuneInBadge()
      if (!code || mini.value || multi.active) return
      tuneInClassification.value = code
      tuneInTimer = setTimeout(hideTuneInBadge, TUNE_IN_BADGE_MS)
    }

    const badgeKey = computed(() => {
      const program = info.value.now
      return program && live.channel ? `${live.channel.id}|${program.program_id}` : null
    })
    const videoShowing = computed(() => live.open && live.phase === 'live' && chips.value === 'hidden')

    watch(() => live.open && live.channel?.id, () => {
      lastBadgeKey = null
      panelBadgeKey = null
      hideTuneInBadge()
    })

    watch([badgeKey, tuneInShown], ([key, shown]) => {
      if (key && shown) panelBadgeKey = key
    })

    watch([badgeKey, videoShowing], ([key, showing]) => {
      if (!key || !showing || key === lastBadgeKey) return
      lastBadgeKey = key
      if (showsTuneInBadge({ key, panelKey: panelBadgeKey })) showTuneInBadge(infoClassification.value)
    })

    watch(() => mini.value || multi.active, (hidden) => {
      if (hidden) hideTuneInBadge()
    })

    const infoProgress = computed(() => {
      const program = info.value.now
      if (!program || !Number.isFinite(program.start) || !Number.isFinite(program.end)) return 0
      return programmeProgress({ program, atMs: live.fromStart ? now.value.getTime() : playingAtMs.value })
    })

    onUnmounted(() => {
      clearTimeout(airingTimer)
      clearTimeout(tuneInTimer)
    })

    const recordButton = computed(() => liveRecordButton({
      program: airing.value.now,
      nowMs: now.value.getTime(),
      recordingProgramIds: recordingProgramIdsOf(recordingNow.value.active),
    }))

    const { openProgramme } = useProgrammeSheet()

    const openNowInSheet = (focus) => openProgramme({
      channelId: live.channel.id,
      channelHint: live.channel,
      programme: airing.value.now,
      focus,
      freshState: true,
    })

    const recordFromLive = () => {
      if (!recordButton.value.disabled) openNowInSheet('record')
    }

    const liveSeriesTags = ref(null)
    const liveChannels = ref([])

    const loadLiveSeriesState = async ({ fresh = false } = {}) => {
      const [state, onNowAll] = await Promise.all([
        api('GET', `/api/epg/state${fresh ? '?fresh=1' : ''}`).catch(() => null),
        api('GET', '/api/epg/now?all=1').catch(() => null),
      ])
      liveSeriesTags.value = state && !state.stale ? state.seriesTags || [] : null
      liveChannels.value = onNowAll?.entries || []
    }

    watch(() => live.open && live.channel?.id, (id) => {
      liveSeriesTags.value = null
      if (!id) return
      loadLiveSeriesState()
      pollRecordingNow()
    }, { immediate: true })

    watch(programmeSheetOpen, (open) => {
      if (!open && live.open) loadLiveSeriesState({ fresh: true })
    })

    watch(recordingChangeTick, () => {
      if (live.open) loadLiveSeriesState({ fresh: true })
    })

    watch(recordingNow, () => {
      if (live.open && !programmeSheetOpen.value) loadLiveSeriesState()
    })

    const liveChannelName = (id) =>
      liveChannels.value.find((e) => String(e.channel?.id) === String(id))?.channel?.name || ''

    const seriesButton = computed(() => liveSeriesButton({
      program: airing.value.now,
      nowMs: now.value.getTime(),
      seriesTags: liveSeriesTags.value,
      channelName: liveChannelName,
    }))

    const recordSeriesFromLive = () => {
      if (!seriesButton.value.disabled) openNowInSheet('series')
    }

    const topActions = computed(() => [
      {
        key: 'multiview', order: 1, priority: 4, icon: 'watch-alongside-icon', label: 'Multiview',
        ariaLabel: 'Multiview: add a second channel', menuLabel: 'Multiview', hidden: live.phase !== 'live' || Boolean(live.fromStart),
      },
      {
        key: 'series', order: 3, priority: 2, icon: 'series-record-icon', iconProps: { set: seriesButton.value.set }, label: 'Series',
        ariaLabel: seriesButton.value.ariaLabel, title: seriesButton.value.title, disabled: seriesButton.value.disabled,
        pressed: seriesButton.value.set, on: seriesButton.value.set, hidden: seriesButton.value.hidden,
        menuLabel: seriesButton.value.set ? 'Series recording set' : 'Record series',
      },
    ])
    const onTopAction = (key) => {
      if (key === 'multiview') return openPicker()
      if (key === 'series') recordSeriesFromLive()
    }

    return {
      recordButton, recordFromLive, seriesButton, recordSeriesFromLive, toggleLivePause, topActions, onTopAction, shownPaused,
      live, videoEl, chips, chipsRun, stopLive, retryLive, statusText, conflictText, liveHolderText,
      isBehindLive, jumpToLive, hasBufferBar, liveScrubber, liveEdge, shownLivePosition, liveFillPercent, scrubberPill,
      bufferStartText, bufferEndText, hintText, playerTitle, playerSubtitle,
      returnToLive, startOverOpen, startOverOptions, startOverNote, startOverAction, startOverButtonTitle, openStartOver, chooseStartOver,
      canPip, pipActive, togglePip, playerMuted, togglePlayerMuted, mini, minimise, expand, miniMeta, miniProgress,
      multi, primarySlotClass, primarySlotStyle, multiFrameStyle, pickerOpen, pickerTarget, openPicker, openPickerFor,
      openAddPicker, choosePickerChannel,
      onFramePointerDownAll, onFramePointerUpAll, onFrameClickAll, onFrameDoubleClickAll,
      onLiveScrubInput, onLiveScrubCommit, controlsShown, onControlsPointerMove, cancelLiveTap, frameEl, toggleLiveFullscreen, isStageFullscreen, onFramePointerDown, onFramePointerUp, onFrameClick, onFrameDoubleClick,
      infoOpen, toggleInfo, tuneInShown, tuneInExit, headingHeld, prePlayChrome, panelOpen, slowTune, SLOW_TUNE_TEXT, info, infoChannelLabel, infoEpisodeLine, infoMetaLine, infoClassification, infoProgress,
      tuneInClassification,
      captionsOn: liveCaptionsOn, toggleLiveCaptions,
      fmtClockTz, NO_GUIDE_TEXT, TUNING_TEXT,
    }
  },
}

const fetchChannelAiring = async ({ channelId, atMs }) => {
  const params = new URLSearchParams({ channel: channelId, at: String(Math.round(atMs)) })
  try {
    const { now, next } = await api('GET', `/api/epg/channel-now?${params}`)
    return { now, next, atMs, loaded: true }
  } catch {
    return { ...EMPTY_AIRING, atMs, loaded: true }
  }
}

const EMPTY_AIRING = { now: null, next: null, atMs: 0, loaded: false }
const AIRING_BOUNDARY_GRACE_MS = 1_000

const TUNE_IN_BADGE_MS = 5_000

const CHIPS_HANDOFF_MS = 440
const CHIPS_MIN_SHOWN_MS = 1_800
const TUNING_TEXT = 'Tuning…'
const SLOW_TUNE_TEXT = 'Still waiting for a signal'

const HAVE_FUTURE_DATA = 3

const PLAYER_OPEN_CLASS = 'player-open'
const PLAYER_MINI_CLASS = 'player-mini-open'

