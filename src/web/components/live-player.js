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
  singleTapActionFor,
  useControlsAutoHide,
  useInfoDismissTaps,
} from '/components/player-controls.js'
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
  onLivePause,
  setLiveVideo,
} from '/shared/live-session.js'
import {
  live,
  liveCaptionsOn,
  isStageFullscreen,
  playerLayoutOf,
  exitPlayerFullscreen,
  toggleStageFullscreen,
} from '/shared/player-shared.js'
import { recordingNow, pollRecordingNow, recordingChangeTick } from '/shared/recording-now.js'
import { recordDialogOverPlayer, openInGuide } from '/shared/store.js'
import { now, fmtClockTz } from '/shared/time.js'

export const LivePlayer = {
  template: `
    <teleport to="body">
    <transition name="epg-sheet">
    <div v-show="live.open" :class="['epg-modal-backdrop', 'live-backdrop', layout]">
      <section class="panel epg-modal live-modal" role="dialog" aria-label="Live TV">
        <player-header :channel-id="live.channel?.id" :has-logo="Boolean(live.channel?.hasLogo)" :title="live.channel?.name"
          :subtitle="live.nowTitle" close-label="Stop and close" @close="stopLive" />
        <div ref="frameEl" :class="['live-frame', { 'is-controls-hidden': !controlsShown }]" @pointerdown="onFramePointerDown" @pointerup="onFramePointerUp"
          @pointercancel="cancelLiveTap" @pointermove="onControlsPointerMove" @click.capture="onFrameClick" @dblclick.capture="onFrameDoubleClick">
          <video ref="videoEl" :class="['live-video', { 'is-veiled': chips !== 'hidden' }]" playsinline :controls="!infoOpen && !customControls" controlslist="nofullscreen"></video>
          <div v-if="customControls" class="player-tap-layer" aria-hidden="true"></div>
          <div v-if="chips !== 'hidden'" :key="chipsRun" :class="['live-chips', chips]" aria-hidden="true">
            <span v-for="n in 3" :key="n" class="live-chip-orbit" :style="{ '--i': n - 1 }">
              <span class="live-chip-arm"><i class="live-chip"></i></span>
            </span>
          </div>
          <div v-if="chips === 'ended'" class="live-chips-row" aria-hidden="true">
            <i v-for="n in 3" :key="n" class="live-chip"></i>
          </div>
          <span v-if="chips === 'tuning' || chips === 'ended'" class="live-chip-caption">{{ live.channel?.name }} · {{ statusText }}</span>
          <player-info-panel :open="infoOpen" panel-id="live-info">
            <template #image>
            <programme-image v-if="info.now" :key="info.now.program_id" class="live-info-image" variant="info"
              :event-id="info.now.has_image ? info.now.program_id : null" :title="info.now.title"
              :channel-id="live.channel?.id" :has-logo="Boolean(live.channel?.hasLogo)" />
            </template>
              <p class="live-info-channel">
                <channel-logo class="live-info-logo" :channel-id="live.channel?.id" :has-logo="Boolean(live.channel?.hasLogo)" />
                <span class="truncate">{{ infoChannelLabel }}</span>
                <span v-if="isBehindLive" class="live-info-buffer">FROM BUFFER</span>
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
                NEXT <span class="live-info-next-title">{{ info.next.title }}</span> {{ fmtClockTz(info.next.start) }}
              </p>
          </player-info-panel>
          <player-overlay-buttons :info-open="infoOpen" info-id="live-info" :has-captions="Boolean(live.captions)"
            :captions-on="captionsOn" close-label="Stop and close" :fullscreen="isStageFullscreen || layout['is-filled']"
            @toggle-info="toggleInfo" @toggle-captions="toggleLiveCaptions" @close="stopLive" @exit-fullscreen="exitPlayerFullscreen" />
          <div v-if="customControls && !infoOpen" class="play-controls live-controls">
            <div class="play-scrub">
              <span class="play-time live-controls-status">{{ barStatus }}</span>
              <input v-if="hasBufferBar" type="range" class="play-range" step="any"
                :min="live.bufferFrom" :max="live.bufferTo" :value="shownLivePosition"
                :style="{ '--fill': liveFillPercent }"
                @input="onLiveScrubInput" @change="onLiveScrubCommit"
                aria-label="Position in the live buffer">
            </div>
            <div class="play-buttons">
              <button v-if="isBehindLive" type="button" class="btn btn-icon" aria-label="Go live" @click="jumpToLive"><go-live-icon /></button>
              <button type="button" :class="['btn', 'btn-icon', 'live-record-button', { 'is-recording': recordButton.recording }]"
                :disabled="recordButton.disabled" :title="recordButton.title" :aria-label="recordButton.ariaLabel" @click="recordFromLive">
                <span v-if="recordButton.recording" class="led-dot live live-record-dot" aria-hidden="true"></span><record-icon v-else />
              </button>
              <button v-if="!seriesButton.hidden" type="button" :class="['btn', 'btn-icon', 'live-series-button', { 'is-on': seriesButton.set }]"
                :disabled="seriesButton.disabled" :title="seriesButton.title" :aria-label="seriesButton.ariaLabel"
                :aria-pressed="String(seriesButton.set)" @click="recordSeriesFromLive"><series-record-icon :set="seriesButton.set" /></button>
              <button type="button" class="btn btn-icon" :disabled="live.phase !== 'live'"
                :aria-label="live.paused ? 'Play' : 'Pause'" @click="toggleLivePause">
                <play-icon v-if="live.paused" /><pause-icon v-else />
              </button>
            </div>
          </div>
          <div v-if="live.skipHint" :key="live.skipHint.key" :class="['live-skip-hint', live.skipHint.side]" aria-hidden="true">
            <span>{{ live.skipHint.label }}</span>
          </div>
          <span class="sr-only" aria-live="polite">{{ live.skipHint?.spoken || '' }}</span>
        </div>
        <div class="panel-body space-y-3">
          <ul v-if="live.holders.length" class="space-y-1 font-mono text-xs text-ink-dim">
            <li v-for="h in live.holders" :key="h.tuner">{{ liveHolderText(h) }}</li>
          </ul>
          <player-action-row :info-open="infoOpen" info-id="live-info" :has-captions="Boolean(live.captions)"
            :captions-on="captionsOn" :status-text="statusText" :status-kind="statusKind"
            @toggle-info="toggleInfo" @toggle-captions="toggleLiveCaptions">
            <template #icons>
              <button type="button" class="btn btn-icon live-action-icon player-wide-only" @click="toggleLiveFullscreen" aria-label="Full screen"><fullscreen-icon /></button>
            </template>
            <template #menu>
              <button type="button" class="player-menu-item" role="menuitem" @click="toggleLiveFullscreen"><fullscreen-icon /> FULL SCREEN</button>
            </template>
            <button v-if="live.phase === 'ended'" type="button" class="btn" @click="retryLive"><refresh-icon /> RETRY</button>
            <template v-else>
              <button v-if="isBehindLive" type="button" class="btn live-action-wide" aria-label="GO LIVE" @click="jumpToLive"><go-live-icon /> <span class="live-action-label">GO LIVE</span></button>
              <button type="button" :class="['btn', 'live-action-wide', 'live-record-button', { 'is-recording': recordButton.recording }]"
                :disabled="recordButton.disabled" :title="recordButton.title" :aria-label="recordButton.ariaLabel" @click="recordFromLive">
                <span v-if="recordButton.recording" class="led-dot live live-record-dot" aria-hidden="true"></span><record-icon v-else />
                <span class="live-action-label">{{ recordButton.label }}</span>
              </button>
              <button v-if="!seriesButton.hidden" type="button"
                :class="['btn', 'live-action-wide', 'live-series-button', { 'is-on': seriesButton.set }]"
                :disabled="seriesButton.disabled" :title="seriesButton.title" :aria-label="seriesButton.ariaLabel"
                :aria-pressed="String(seriesButton.set)" @click="recordSeriesFromLive">
                <series-record-icon :set="seriesButton.set" /> <span class="live-action-label">SERIES</span>
              </button>
              <button type="button" class="btn live-action-wide live-pause-button" :disabled="live.phase !== 'live'"
                :aria-label="live.paused ? 'Play' : 'Pause'" @click="toggleLivePause">
                <play-icon v-if="live.paused" /><pause-icon v-else />
                <span class="live-action-label">{{ live.paused ? 'PLAY' : 'PAUSE' }}</span>
              </button>
            </template>
          </player-action-row>
        </div>
      </section>
    </div>
    </transition>
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
      if (live.phase === 'tuning') {
        const slow = now.value.getTime() - live.tuningStartedAt > TUNING_SLOW_MS
        return slow ? 'TUNING… STILL WAITING FOR A SIGNAL' : 'TUNING…'
      }
      const lead = liveLeadText()
      if (!live.conflict) return lead
      const wait = fmtCountdown(live.conflict.startsAt - now.value.getTime())
      return `${lead} · "${live.conflict.title}" needs this tuner at ${fmtClockTz(live.conflict.startsAt)} (in ${wait})`
    })

    const liveLeadText = () => {
      if (live.paused) return 'PAUSED'
      return isBehindLive.value ? `${fmtCountdown(live.behindSeconds * 1000)} BEHIND LIVE` : 'LIVE'
    }

    const statusKind = computed(() => {
      if (live.phase === 'ended' || live.conflict) return 'err'
      if (live.paused) return 'info'
      return live.phase === 'live' ? 'ok' : 'info'
    })

    onMounted(() => {
      setLiveVideo(videoEl.value)
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
    const layout = computed(() => playerLayoutOf({ canFill: live.phase !== 'ended' && !live.holders.length }))
    const customControls = computed(() => layout.value['is-filled'] || isStageFullscreen.value)
    watch(customControls, (on) => { live.customControls = on }, { immediate: true })

    const bufferSpan = computed(() =>
      (live.bufferFrom == null || live.bufferTo == null ? 0 : live.bufferTo - live.bufferFrom))
    const hasBufferBar = computed(() =>
      live.phase === 'live' && live.bufferSeconds > 0 && bufferSpan.value >= MIN_BUFFER_BAR_S)
    const shownLivePosition = computed(() => (live.scrubbing ? live.scrubValue : live.position))
    const liveFillPercent = computed(() => {
      if (!bufferSpan.value) return '100%'
      const share = (shownLivePosition.value - live.bufferFrom) / bufferSpan.value
      return `${Math.max(0, Math.min(100, share * 100))}%`
    })
    const barStatus = computed(() => {
      if (live.phase === 'tuning') return 'TUNING…'
      if (live.scrubbing && live.bufferTo != null) return `-${fmtCountdown((live.bufferTo - live.scrubValue) * 1000)}`
      if (live.paused) return 'PAUSED'
      return isBehindLive.value ? `-${fmtCountdown(live.behindSeconds * 1000)}` : 'LIVE'
    })

    const onLiveScrubInput = (e) => {
      live.scrubbing = true
      live.scrubValue = Number(e.target.value)
    }

    const onLiveScrubCommit = (e) => {
      live.scrubbing = false
      seekLiveTo(Number(e.target.value))
    }

    const { controlsShown, revealControls, onPointerMove: onControlsPointerMove } = useControlsAutoHide({
      enabled: computed(() => live.open && customControls.value),
      holdShown: computed(() => live.paused || live.phase !== 'live' || live.scrubbing || infoOpen.value
        || chips.value !== 'hidden' || recordDialogOverPlayer.value),
      rootEl: frameEl,
    })
    watch([customControls, controlsShown], ([custom, shown]) => {
      live.captionsLifted = custom && shown
      placeLiveCaptions()
    }, { immediate: true })

    const { onFramePointerDown, onFramePointerUp, onFrameClick, onFrameDoubleClick } = useInfoDismissTaps({
      infoOpen,
      onPointerDown: onLivePointerDown,
      onPointerUp: (e) => onLivePointerUp(e, {
        onSingleTap: singleTapActionFor({ pointerType: e.pointerType, controlsShown, revealControls, togglePause: toggleLivePause }),
      }),
      onClick: onLiveClick,
      onDoubleClick: onLiveDoubleClick,
    })

    usePlayerKeys({
      isActive: () => live.open && !recordDialogOverPlayer.value,
      infoOpen,
      close: stopLive,
      toggleInfo,
      canToggleCaptions: () => live.captions && !infoOpen.value,
      toggleCaptions: toggleLiveCaptions,
      togglePause: toggleLivePause,
      skip: skipLiveByKey,
      toggleFullscreen: toggleLiveFullscreen,
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
        returnTo: window.location.hash || '#/dashboard',
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
      live, videoEl, chips, chipsRun, stopLive, retryLive, statusText, statusKind, liveHolderText,
      isBehindLive, jumpToLive, customControls, hasBufferBar, shownLivePosition, liveFillPercent, barStatus,
      onLiveScrubInput, onLiveScrubCommit, controlsShown, onControlsPointerMove, cancelLiveTap, frameEl, toggleLiveFullscreen, isStageFullscreen, layout, exitPlayerFullscreen, onFramePointerDown, onFramePointerUp, onFrameClick, onFrameDoubleClick,
      infoOpen, toggleInfo, info, infoChannelLabel, infoEpisodeLine, infoMetaLine, infoProgress,
      captionsOn: liveCaptionsOn, toggleLiveCaptions,
      fmtClockTz, NO_GUIDE_TEXT,
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

const BEHIND_LIVE_SHOWN_S = 10

const HAVE_FUTURE_DATA = 3

const MIN_BUFFER_BAR_S = 10
