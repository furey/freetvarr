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
import { startOverOptionsOf, startOverNoteOf, behindLiveText, fromStartRecordingOf } from '/start-over.js'
import { behindPillText, liveEdgeOf, liveHintText, percentWithin, programmeRangeText, joinedParts } from '/player-labels.js'
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
  setLiveVideo,
} from '/shared/live-session.js'
import { multi, slotClassOf, watchAlongside, changePictureChannel, applySingleMuting, togglePlayerMuted } from '/shared/multi-session.js'
import {
  live,
  playback,
  liveCaptionsOn,
  isStageFullscreen,
  toggleStageFullscreen,
  playerMini,
  playerMuted,
} from '/shared/player-shared.js'
import { recordingNow, pollRecordingNow, recordingChangeTick } from '/shared/recording-now.js'
import { recordDialogOverPlayer, openInGuide } from '/shared/store.js'
import { now, fmtClockTz } from '/shared/time.js'

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
    <div v-show="live.open" :class="['pl-backdrop', { 'is-mini': mini }]" :role="mini ? 'region' : 'dialog'" :aria-label="mini ? 'Mini player' : 'Live TV'">
      <div ref="frameEl" tabindex="-1" :class="['live-frame', 'pl-frame', { 'is-controls-hidden': !controlsShown && !mini, 'is-multi': multi.active }]"
        :style="multiFrameStyle" @pointerdown="onFramePointerDownAll" @pointerup="onFramePointerUpAll"
        @pointercancel="cancelLiveTap" @pointermove="onControlsPointerMove" @click.capture="onFrameClickAll" @dblclick.capture="onFrameDoubleClickAll">
        <video ref="videoEl" :class="['live-video', 'pl-video', primarySlotClass, { 'is-veiled': chips !== 'hidden' }]" playsinline controlslist="nofullscreen"></video>
        <div class="player-tap-layer" aria-hidden="true"></div>
        <div v-if="chips !== 'hidden'" :key="chipsRun" :class="['live-chips', chips]" aria-hidden="true">
          <span v-for="n in 3" :key="n" class="live-chip-orbit" :style="{ '--i': n - 1 }">
            <span class="live-chip-arm"><i class="live-chip"></i></span>
          </span>
        </div>
        <div v-if="chips === 'ended'" class="live-chips-row" aria-hidden="true">
          <i v-for="n in 3" :key="n" class="live-chip"></i>
        </div>
        <span v-if="chips === 'tuning'" class="live-chip-caption">{{ live.channel?.name }} · {{ statusText || TUNING_TEXT }}</span>
        <div class="pl-scrim is-top" aria-hidden="true"></div>
        <div class="pl-scrim is-bottom" aria-hidden="true"></div>
        <player-info-panel :open="infoOpen" panel-id="live-info">
          <template #image>
          <programme-image v-if="info.now" :key="info.now.program_id" class="live-info-image" variant="info"
            :event-id="info.now.has_image ? info.now.program_id : null" :title="info.now.title"
            :channel-id="live.channel?.id" :has-logo="Boolean(live.channel?.hasLogo)" />
          </template>
            <p class="live-info-channel">
              <channel-logo class="live-info-logo" :channel-id="live.channel?.id" :has-logo="Boolean(live.channel?.hasLogo)" />
              <span class="truncate">{{ infoChannelLabel }}</span>
              <span v-if="isBehindLive" class="live-info-buffer">From buffer</span>
            </p>
            <template v-if="info.now">
              <p class="live-info-title">{{ info.now.title }}</p>
              <p v-if="infoEpisodeLine" class="live-info-episode">{{ infoEpisodeLine }}</p>
              <div class="live-info-times">
                <span>{{ fmtClockTz(info.now.start) }}–{{ fmtClockTz(info.now.end) }}</span>
                <div class="progress-track"><div class="progress-fill" :style="{ width: infoProgress + '%' }"></div></div>
              </div>
              <p v-if="infoMetaLine" class="live-info-meta">{{ infoMetaLine }}</p>
              <p v-if="info.now.synopsis" class="live-info-synopsis">{{ info.now.synopsis }}</p>
            </template>
            <p v-else-if="info.loaded && !info.next" class="live-info-empty">{{ NO_GUIDE_TEXT }}</p>
            <p v-if="info.next" class="live-info-next">
              Next <span class="live-info-next-title">{{ info.next.title }}</span> {{ fmtClockTz(info.next.start) }}
            </p>
        </player-info-panel>
        <player-top-bar :channel-id="live.channel?.id" :has-logo="Boolean(live.channel?.hasLogo)" :title="playerTitle"
          :subtitle="playerSubtitle" back-label="Stop and close" :info-open="infoOpen" info-id="live-info"
          :has-captions="Boolean(live.captions)" :captions-on="captionsOn" :fullscreen="isStageFullscreen"
          :can-pip="canPip" :pip-active="pipActive" :can-minimise="true" :muted="playerMuted"
          @back="stopLive" @toggle-info="toggleInfo" @toggle-captions="toggleLiveCaptions" @toggle-fullscreen="toggleLiveFullscreen"
          @toggle-pip="togglePip" @minimise="minimise" @toggle-mute="togglePlayerMuted">
          <template #lead>
            <button v-if="live.phase === 'live' && !live.fromStart" type="button" class="pl-pill" aria-label="Multiview: add a second channel"
              @click="openPicker"><watch-alongside-icon /><span class="pl-pill-label">Multiview</span></button>
          </template>
          <template #before>
            <button v-if="!seriesButton.hidden" type="button" :class="['pl-pill', { 'is-on': seriesButton.set }]"
              :disabled="seriesButton.disabled" :title="seriesButton.title" :aria-label="seriesButton.ariaLabel"
              :aria-pressed="String(seriesButton.set)" @click="recordSeriesFromLive">
              <series-record-icon :set="seriesButton.set" /><span class="pl-pill-label">Series</span>
            </button>
          </template>
          <button type="button" :class="['pl-pill', 'is-record', { 'is-recording': recordButton.recording }]"
            :disabled="recordButton.disabled" :title="recordButton.title" :aria-label="recordButton.ariaLabel" @click="recordFromLive">
            <span class="pl-record-dot" aria-hidden="true"></span>{{ recordButton.recording ? 'Recording' : 'Record' }}
          </button>
        </player-top-bar>
        <p v-if="conflictText && live.phase === 'live'" class="pl-notice" role="status">{{ conflictText }}</p>
        <player-center-controls v-if="live.phase === 'live' && chips === 'hidden' && !infoOpen" :paused="live.paused"
          :show-start-over="true" :start-over-disabled="!startOverOptions.length" start-over-title="Start over"
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
        <footer v-if="live.phase === 'live' && !infoOpen" class="pl-bottom">
          <player-scrubber v-if="hasBufferBar" :min="live.bufferFrom" :max="live.bufferTo" :value="shownLivePosition"
            :fill-percent="liveFillPercent" :start-text="bufferStartText" :end-text="bufferEndText"
            aria-label="Position in the live buffer"
            :value-text="scrubberPill.text" @scrub="onLiveScrubInput" @commit="onLiveScrubCommit" />
          <p class="pl-hint">{{ hintText }}</p>
        </footer>
        <div v-if="live.skipHint" :key="live.skipHint.key" :class="['live-skip-hint', live.skipHint.side]" aria-hidden="true">
          <span>{{ live.skipHint.label }}</span>
        </div>
        <span class="sr-only" aria-live="polite">{{ live.skipHint?.spoken || '' }}</span>
        <multi-view-layer v-if="multi.active && !mini" :primary-title="playerTitle" :primary-meta="miniMeta"
          @change-channel="openPickerFor" @close="stopLive" />
        <player-mini v-if="mini" :title="playerTitle" :meta="miniMeta" is-live :progress="miniProgress"
          :paused="live.paused" :pause-disabled="live.phase !== 'live'" :can-pip="canPip" :pip-active="pipActive" :muted="playerMuted"
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

    watch(now, trackBehindLive)

    watch(() => live.phase, (phase) => {
      syncLivePaused()
      if (phase === 'tuning') return showChips('tuning')
      if (phase === 'ended') return showChips('ended')
      if (phase === 'idle') return showChips('hidden')
    })

    const isBehindLive = computed(() => live.phase === 'live' && live.behindSeconds >= BEHIND_LIVE_SHOWN_S)

    const statusText = computed(() => {
      if (live.phase === 'ended') return live.message
      if (live.phase !== 'tuning') return ''
      const slow = now.value.getTime() - live.tuningStartedAt > TUNING_SLOW_MS
      return slow ? 'Tuning… still waiting for a signal' : TUNING_TEXT
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
      liveVideo.addEventListener('pause', syncLivePaused)
      liveVideo.addEventListener('play', syncLivePaused)
      liveVideo.addEventListener('play', keepSeekInsideBuffer)
      liveVideo.addEventListener('emptied', syncLivePaused)
      liveVideo.addEventListener('seeked', trackBehindLive)
      liveVideo.addEventListener('timeupdate', trackBehindLive)
      liveVideo.addEventListener('pause', trackBehindLive)
      liveVideo.addEventListener('seeking', keepSeekInsideBuffer)
      liveVideo.addEventListener('playing', handOffToVideo)
      liveVideo.addEventListener('canplay', handOffToVideo)
      liveVideo.textTracks?.addEventListener?.('addtrack', onTextTrackAdded)
      liveVideo.textTracks?.addEventListener?.('change', syncCaptionPreferenceFromTracks)
    })
    onUnmounted(() => clearTimeout(chipsTimer))

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

    const toggleInfo = () => { infoOpen.value = !infoOpen.value }
    const toggleLiveFullscreen = () => toggleStageFullscreen({ stage: frameEl.value, video: liveVideo })
    live.customControls = true

    const bufferSpan = computed(() =>
      (live.bufferFrom == null || live.bufferTo == null ? 0 : live.bufferTo - live.bufferFrom))
    const hasBufferBar = computed(() =>
      live.phase === 'live' && live.bufferSeconds > 0 && bufferSpan.value >= MIN_BUFFER_BAR_S)
    const shownLivePosition = computed(() => (live.scrubbing ? live.scrubValue : live.position))
    const liveFillPercent = computed(() =>
      (bufferSpan.value
        ? percentWithin({ value: shownLivePosition.value, min: live.bufferFrom, max: live.bufferTo })
        : 100))
    const shownBehindSeconds = computed(() =>
      (live.scrubbing && live.bufferTo != null ? live.bufferTo - live.scrubValue : live.behindSeconds))
    const scrubberPill = computed(() => {
      if (live.fromStart) return { text: behindLiveText(shownBehindSeconds.value), live: false }
      if (shownBehindSeconds.value >= BEHIND_LIVE_SHOWN_S) return { text: behindPillText(shownBehindSeconds.value), live: false }
      return live.paused ? { text: 'PAUSED', live: false } : { text: 'LIVE', live: true }
    })
    const liveEdge = computed(() => liveEdgeOf({
      behindSeconds: shownBehindSeconds.value,
      fromStart: live.fromStart,
      thresholdSeconds: BEHIND_LIVE_SHOWN_S,
    }))
    const bufferStartText = computed(() => (live.fromStart
      ? fmtClockTz(live.fromStart.recordingStartedAt)
      : fmtClockTz(now.value.getTime() - bufferSpan.value * 1000)))
    const bufferEndText = computed(() => fmtClockTz(now.value.getTime()))
    const hintText = computed(() => (live.fromStart
      ? `Watching ${live.fromStart.title || 'the recording'} from the start while it keeps recording.`
      : liveHintText(live.bufferSeconds)))

    const onLiveScrubInput = (value) => {
      live.scrubbing = true
      live.scrubValue = value
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
      bufferStartMs: hasBufferBar.value && !live.fromStart ? now.value.getTime() - bufferSpan.value * 1000 : null,
      nowMs: now.value.getTime(),
      clockText: fmtClockTz,
    }))
    const startOverNote = computed(() => startOverNoteOf(startOverOptions.value))
    const openStartOver = () => { startOverOpen.value = true }
    const chooseStartOver = (key) => {
      startOverOpen.value = false
      if (key === 'tuned-in') return live.bufferFrom != null && seekLiveTo(live.bufferFrom)
      if (live.fromStart) return seekLiveTo(0)
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
      live.fromStart ? behindLiveText(live.behindSeconds) : minutesLeftText({ endMs: info.value.now?.end, nowMs: now.value.getTime() }),
    ]))
    const miniProgress = computed(() => infoProgress.value)

    const pickerOpen = ref(false)
    const pickerTarget = ref('add')
    const openPicker = () => {
      pickerTarget.value = multi.active ? 'secondary' : 'add'
      pickerOpen.value = true
    }
    const openPickerFor = (picture) => {
      pickerTarget.value = picture
      pickerOpen.value = true
    }
    const choosePickerChannel = (channel) => {
      pickerOpen.value = false
      if (pickerTarget.value === 'add') return watchAlongside(channel)
      changePictureChannel({ picture: pickerTarget.value, channel })
    }
    const primarySlotClass = computed(() => slotClassOf('primary'))
    const multiFrameStyle = computed(() => {
      const box = multi.active ? multi.insetBox : null
      if (!box) return null
      return {
        '--mv-inset-left': `${box.left}px`,
        '--mv-inset-top': `${box.top}px`,
        '--mv-inset-w': `${box.width}px`,
        '--mv-inset-h': `${box.height}px`,
      }
    })

    const { controlsShown, revealControls, onPointerMove: onControlsPointerMove } = useControlsAutoHide({
      enabled: computed(() => live.open && !mini.value && !multi.active),
      holdShown: computed(() => live.paused || live.phase !== 'live' || live.scrubbing || infoOpen.value
        || chips.value !== 'hidden' || recordDialogOverPlayer.value),
      rootEl: frameEl,
    })
    watch(controlsShown, (shown) => {
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
      infoOpen,
      onPointerDown: onLivePointerDown,
      onPointerUp: (e) => onLivePointerUp(e, {
        onSingleTap: singleTapActionFor({ pointerType: e.pointerType, controlsShown, revealControls, togglePause: toggleLivePause }),
      }),
      onClick: onLiveClick,
      onDoubleClick: onLiveDoubleClick,
    })

    usePlayerFocus({ isOpen: computed(() => live.open), isMini: mini, rootEl: frameEl })

    usePlayerKeys({
      isActive: () => live.open && !mini.value && !recordDialogOverPlayer.value && !startOverOpen.value && !pickerOpen.value,
      infoOpen,
      close: stopLive,
      toggleInfo,
      canToggleCaptions: () => live.captions && !infoOpen.value,
      toggleCaptions: toggleLiveCaptions,
      togglePause: toggleLivePause,
      skip: skipLiveByKey,
      toggleFullscreen: toggleLiveFullscreen,
      toggleMute: togglePlayerMuted,
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
      if (!isBehindLive.value || bufferedLoading) return
      if (!airingCovers({ airing: bufferedAiring.value, atMs })) loadBufferedAiring(atMs)
    })

    const info = computed(() => (isBehindLive.value && bufferedAiring.value) || airing.value)

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

    const infoMetaLine = computed(() => {
      const program = info.value.now
      return program ? [genreLabel(program.genre), ratingLabel(program)].filter(Boolean).join(' · ') : ''
    })

    const infoProgress = computed(() => {
      const program = info.value.now
      return program ? programmeProgress({ program, atMs: playingAtMs.value }) : 0
    })

    onUnmounted(() => clearTimeout(airingTimer))

    const recordButton = computed(() => liveRecordButton({
      program: airing.value.now,
      nowMs: now.value.getTime(),
      recordingProgramIds: recordingProgramIdsOf(recordingNow.value.active),
    }))

    const openNowInGuide = (focus) => {
      recordDialogOverPlayer.value = true
      openInGuide({
        channelId: live.channel.id,
        program: airing.value.now,
        returnTo: window.location.hash || '#/home',
        focus,
      })
    }

    const recordFromLive = () => {
      if (!recordButton.value.disabled) openNowInGuide('record')
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

    watch(recordDialogOverPlayer, (open) => {
      if (!open && live.open) loadLiveSeriesState({ fresh: true })
    })

    watch(recordingChangeTick, () => {
      if (live.open) loadLiveSeriesState({ fresh: true })
    })

    watch(recordingNow, () => {
      if (live.open && !recordDialogOverPlayer.value) loadLiveSeriesState()
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
      if (!seriesButton.value.disabled) openNowInGuide('series')
    }

    return {
      recordButton, recordFromLive, seriesButton, recordSeriesFromLive, toggleLivePause,
      live, videoEl, chips, chipsRun, stopLive, retryLive, statusText, conflictText, liveHolderText,
      isBehindLive, jumpToLive, hasBufferBar, liveEdge, shownLivePosition, liveFillPercent, scrubberPill,
      bufferStartText, bufferEndText, hintText, playerTitle, playerSubtitle,
      returnToLive, startOverOpen, startOverOptions, startOverNote, openStartOver, chooseStartOver,
      canPip, pipActive, togglePip, playerMuted, togglePlayerMuted, mini, minimise, expand, miniMeta, miniProgress,
      multi, primarySlotClass, multiFrameStyle, pickerOpen, pickerTarget, openPicker, openPickerFor, choosePickerChannel,
      onFramePointerDownAll, onFramePointerUpAll, onFrameClickAll, onFrameDoubleClickAll,
      onLiveScrubInput, onLiveScrubCommit, controlsShown, onControlsPointerMove, cancelLiveTap, frameEl, toggleLiveFullscreen, isStageFullscreen, onFramePointerDown, onFramePointerUp, onFrameClick, onFrameDoubleClick,
      infoOpen, toggleInfo, info, infoChannelLabel, infoEpisodeLine, infoMetaLine, infoProgress,
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

const CHIPS_HANDOFF_MS = 440
const CHIPS_MIN_SHOWN_MS = 1_800
const TUNING_SLOW_MS = 15_000
const TUNING_TEXT = 'Tuning…'

const BEHIND_LIVE_SHOWN_S = 10

const HAVE_FUTURE_DATA = 3

const PLAYER_OPEN_CLASS = 'player-open'
const PLAYER_MINI_CLASS = 'player-mini-open'

const MIN_BUFFER_BAR_S = 10
