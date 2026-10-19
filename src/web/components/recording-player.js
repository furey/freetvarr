import { ref, computed, onMounted, watch } from '/vendor/vue.esm-browser.prod.js'
import { adBreakAt, fmtPlayTime } from '/playback.js'
import {
  adsText,
  airedRangeText,
  durationText,
  libraryStatusOf,
  libraryStatusText,
  recordingEpisodeLine,
  savesToLine,
  sourceBadgeText,
  watchedPercent,
} from '/recording-info.js'
import { CAPTION_LINE_PERCENT } from '/live-captions.js'
import { PLAYER_CHROME_COMPONENTS } from '/components/player-chrome.js'
import { adMarkersOf, leftPillText, percentWithin, joinedParts } from '/player-labels.js'
import {
  usePlayerKeys,
  singleTapActionFor,
  useControlsAutoHide,
  useInfoDismissTaps,
} from '/components/player-controls.js'
import {
  playInfoOpen,
  applyPlayCaptions,
  syncPlayCaptionPreference,
  togglePlayCaptions,
  playVideo,
  playHls,
  stopPlayback,
  savePlaybackPosition,
  seekPlaybackTo,
  togglePlayback,
  skipCurrentAd,
  startPlaybackOver,
  onPlayPointerDown,
  cancelPlayTap,
  onPlayPointerUp,
  onPlayDoubleClick,
  skipPlaybackByKey,
  setPlayVideo,
  resetAutoRestarts,
} from '/shared/playback-session.js'
import {
  liveCaptionsOn,
  captionTracksOf,
  isStageFullscreen,
  toggleStageFullscreen,
  FILLED_CAPTION_LINE,
  playback,
} from '/shared/player-shared.js'
import { tz, fmtTime } from '/shared/time.js'
import { SKIP_STEP_S } from '/double-tap.js'

export const RecordingPlayer = {
  components: PLAYER_CHROME_COMPONENTS,
  template: `
    <teleport to="body">
    <transition name="pl-fade">
    <div v-show="playback.open" class="pl-backdrop" role="dialog" aria-label="Recording player">
      <div ref="stageEl" :class="['play-stage', 'live-frame', 'pl-frame', { 'is-info-open': infoOpen, 'is-controls-hidden': !controlsShown }]"
        @pointerdown="onFramePointerDown" @pointerup="onFramePointerUp" @pointercancel="cancelPlayTap"
        @pointermove="onControlsPointerMove" @click.capture="onFrameClick" @dblclick.capture="onFrameDoubleClick">
        <video ref="videoEl" :class="['live-video', 'pl-video', { 'is-veiled': playback.phase !== 'playing' }]" playsinline x-webkit-airplay="allow" preload="auto"></video>
        <div class="player-tap-layer" aria-hidden="true"></div>
        <span v-if="overlayText && playback.phase !== 'ended'" class="pl-caption" role="status">{{ overlayText }}</span>
        <div class="pl-scrim is-top" aria-hidden="true"></div>
        <div class="pl-scrim is-bottom" aria-hidden="true"></div>
        <player-info-panel :open="infoOpen" panel-id="play-info">
          <template #image>
            <programme-image v-if="recording" :key="recording.recording_id" class="live-info-image" variant="info"
              :source="imageSource" :title="recording.title" :channel-id="recording.channel_id" :has-logo="Boolean(recording.channel_id)" />
          </template>
          <p class="live-info-channel">
            <channel-logo v-if="recording?.channel_id" class="live-info-logo" :channel-id="recording.channel_id" has-logo />
            <span class="truncate">{{ recording?.channel_name }}</span>
            <span v-if="sourceBadge" class="live-info-buffer">{{ sourceBadge }}</span>
          </p>
          <p class="live-info-title">{{ recording?.title }}</p>
          <p v-if="episodeLine" class="live-info-episode">{{ episodeLine }}</p>
          <div v-if="airedText" class="live-info-times">
            <span>{{ airedText }}</span>
            <div class="progress-track"><div class="progress-fill" :style="{ width: watched + '%' }"></div></div>
          </div>
          <p v-if="metaLine" class="live-info-meta">{{ metaLine }}</p>
          <p v-if="recording?.synopsis" class="live-info-synopsis">{{ recording.synopsis }}</p>
          <p v-for="line in infoLines" :key="line.label" class="live-info-next">
            {{ line.label }} <span class="live-info-next-title">{{ line.text }}</span>
          </p>
        </player-info-panel>
        <player-top-bar :channel-id="recording?.channel_id" has-logo :title="header.title" :subtitle="header.subtitle"
          back-label="Close" :info-open="infoOpen" info-id="play-info" :has-captions="playback.captions"
          :captions-on="captionsOn" :fullscreen="isStageFullscreen"
          @back="stopPlayback" @toggle-info="toggleInfo" @toggle-captions="togglePlayCaptions" @toggle-fullscreen="toggleFullscreen">
          <button v-if="playback.airplay" type="button" class="pl-pill" aria-label="AirPlay" @click="showAirplay">
            <airplay-icon /><span class="pl-pill-label">AirPlay</span>
          </button>
        </player-top-bar>
        <player-center-controls v-if="playback.phase !== 'ended' && !infoOpen" :paused="playback.paused"
          :show-start-over="playback.resumed" @start-over="startPlaybackOver" @toggle-pause="togglePlayback" />
        <div v-if="playback.phase === 'ended'" class="pl-ended">
          <p class="pl-ended-message">{{ playback.message }}</p>
          <div class="pl-ended-actions">
            <button type="button" class="ui-button ui-button-primary" @click="togglePlayback"><refresh-icon /> Try again</button>
            <button type="button" class="ui-button ui-button-secondary" @click="stopPlayback">Close</button>
          </div>
        </div>
        <button v-if="inAdBreak && !infoOpen" type="button" class="pl-pill pl-skip-ad" @click="skipCurrentAd">Skip ad</button>
        <footer v-if="playback.phase !== 'ended' && !infoOpen" class="pl-bottom">
          <player-scrubber :min="0" :max="scrubMax" :value="Math.floor(shownPosition)" :step="1"
            :fill-percent="fillPercent" :buffer-percent="0" :markers="adMarkers" :start-text="fmtPlayTime(shownPosition)"
            :end-text="fmtPlayTime(playback.duration)" :pill-text="leftText" aria-label="Position"
            :value-text="fmtPlayTime(shownPosition)" @scrub="onScrubInput" @commit="onScrubCommit" />
          <p class="pl-hint">{{ hintText }}</p>
        </footer>
        <div v-if="playback.skipHint" :key="playback.skipHint.key" :class="['live-skip-hint', playback.skipHint.side]" aria-hidden="true">
          <span>{{ playback.skipHint.label }}</span>
        </div>
        <span class="sr-only" aria-live="polite">{{ playback.skipHint?.spoken || '' }}</span>
      </div>
    </div>
    </transition>
    </teleport>
  `,
  setup() {
    const videoEl = ref(null)
    const stageEl = ref(null)
    const recording = computed(() => playback.recording)
    const infoOpen = playInfoOpen

    const header = computed(() => {
      const r = playback.recording
      if (!r) return { title: '', subtitle: '' }
      return { title: r.title, subtitle: joinedParts([r.channel_name, recordingEpisodeLine(r)]) }
    })

    const imageSource = computed(() => {
      const r = playback.recording
      return r?.image_path ? `/api/recordings/${encodeURIComponent(r.recording_id)}/image` : null
    })

    const episodeLine = computed(() => (playback.recording ? recordingEpisodeLine(playback.recording) : ''))

    const airedText = computed(() => airedRangeText({
      airedAt: playback.recording?.aired_at,
      durationSeconds: playback.recording?.duration_s || playback.duration,
      timeZone: tz.value,
    }))

    const watched = computed(() => watchedPercent({ position: playback.position, duration: playback.duration }))

    const metaLine = computed(() => {
      const r = playback.recording
      if (!r) return ''
      return [
        durationText(r.duration_s || playback.duration),
        libraryStatusText({ status: libraryStatusOf(r), imported: fmtTime(r.imported_at), deletedFromTvh: Boolean(r.deleted_from_tvh_at) }),
      ].filter(Boolean).join(' · ')
    })

    const sourceBadge = computed(() => sourceBadgeText(playback.source))

    const infoLines = computed(() => {
      const r = playback.recording
      if (!r) return []
      return [{ label: 'ADS', text: adsText(r) }, savesToLine(r)].filter((line) => line?.text)
    })

    const toggleInfo = () => { infoOpen.value = !infoOpen.value }

    const inAdBreak = computed(() =>
      playback.phase === 'playing' && adBreakAt({ breaks: playback.adBreaks, time: playback.position }) !== null)

    const shownPosition = computed(() => (playback.scrubbing ? playback.scrubValue : playback.position))
    const scrubMax = computed(() => Math.max(1, Math.floor(playback.duration || 0)))
    const fillPercent = computed(() => percentWithin({ value: shownPosition.value, min: 0, max: scrubMax.value }))
    const adMarkers = computed(() => adMarkersOf({ breaks: playback.adBreaks, duration: playback.duration }))
    const leftText = computed(() =>
      (playback.duration > 0 ? leftPillText(Math.max(0, playback.duration - shownPosition.value)) : ''))
    const hintText = RECORDING_HINT_TEXT

    const statusText = computed(() => {
      if (playback.phase === 'ended') return playback.message
      if (playback.phase === 'starting') {
        return playback.position > 0 ? `Loading at ${fmtPlayTime(playback.position)}…` : 'Loading…'
      }
      if (playback.waiting) return 'Buffering…'
      return playback.paused ? 'Paused' : 'Playing'
    })

    const overlayText = computed(() => {
      if (playback.phase === 'ended') return playback.message
      if (playback.phase === 'starting' || playback.waiting) return statusText.value
      return ''
    })

    const onScrubInput = (value) => {
      playback.scrubbing = true
      playback.scrubValue = value
    }

    const onScrubCommit = (value) => {
      playback.scrubbing = false
      seekPlaybackTo(value)
    }

    const toggleFullscreen = () => toggleStageFullscreen({ stage: stageEl.value, video: playVideo })
    const { controlsShown, revealControls, onPointerMove: onControlsPointerMove } = useControlsAutoHide({
      enabled: computed(() => playback.open),
      holdShown: computed(() => playback.paused || playback.phase !== 'playing' || playback.waiting
        || playback.scrubbing || infoOpen.value),
      rootEl: stageEl,
    })
    const captionLine = computed(() => (controlsShown.value ? FILLED_CAPTION_LINE : CAPTION_LINE_PERCENT))
    const placeCaptions = () => {
      for (const track of captionTracksOf(playVideo)) {
        for (const cue of track.cues || []) if (cue.line !== captionLine.value) cue.line = captionLine.value
      }
    }
    watch(captionLine, placeCaptions)

    const showAirplay = () => playVideo?.webkitShowPlaybackTargetPicker?.()

    const { onFramePointerDown, onFramePointerUp, onFrameClick, onFrameDoubleClick } = useInfoDismissTaps({
      infoOpen,
      onPointerDown: onPlayPointerDown,
      onPointerUp: (e) => onPlayPointerUp(e, {
        onSingleTap: singleTapActionFor({ pointerType: e.pointerType, controlsShown, revealControls, togglePause: togglePlayback }),
      }),
      onClick: () => {},
      onDoubleClick: onPlayDoubleClick,
    })

    usePlayerKeys({
      isActive: () => playback.open,
      infoOpen,
      close: stopPlayback,
      toggleInfo,
      canToggleCaptions: () => playback.captions && !infoOpen.value,
      toggleCaptions: togglePlayCaptions,
      togglePause: togglePlayback,
      skip: skipPlaybackByKey,
      toggleFullscreen,
      ignoreSelector: 'button, select, textarea, input:not(.pl-range)',
    })

    const onTimeUpdate = () => {
      if (playback.phase !== 'playing') return
      playback.position = playback.offset + playVideo.currentTime
    }

    const onPlaying = () => {
      playback.started = true
      playback.waiting = false
      playback.paused = false
      resetAutoRestarts()
    }

    const onPause = () => {
      playback.paused = true
      if (playback.phase === 'playing') savePlaybackPosition()
    }

    const onEnded = () => {
      playback.paused = true
      playback.position = playback.duration || playback.position
      savePlaybackPosition()
    }

    onMounted(() => {
      setPlayVideo(videoEl.value)
      playVideo.addEventListener('timeupdate', onTimeUpdate)
      playVideo.addEventListener('playing', onPlaying)
      playVideo.addEventListener('play', () => { playback.paused = false })
      playVideo.addEventListener('pause', onPause)
      playVideo.addEventListener('waiting', () => { playback.waiting = true })
      playVideo.addEventListener('ended', onEnded)
      playVideo.textTracks?.addEventListener?.('addtrack', (e) => {
        e.track?.addEventListener?.('cuechange', placeCaptions)
        if (!playHls) applyPlayCaptions()
      })
      playVideo.textTracks?.addEventListener?.('change', syncPlayCaptionPreference)
      playVideo.addEventListener('webkitplaybacktargetavailabilitychanged', (e) => {
        playback.airplay = e.availability === 'available'
      })
    })

    return {
      playback, recording, header, imageSource, episodeLine, airedText, watched, metaLine, sourceBadge, infoLines,
      infoOpen, toggleInfo, videoEl, stageEl, shownPosition, scrubMax, fillPercent, adMarkers, leftText, hintText,
      controlsShown, onControlsPointerMove, cancelPlayTap,
      statusText, overlayText, fmtPlayTime, inAdBreak, skipCurrentAd,
      stopPlayback, togglePlayback, startPlaybackOver, onScrubInput, onScrubCommit,
      toggleFullscreen, isStageFullscreen, showAirplay,
      captionsOn: liveCaptionsOn, togglePlayCaptions, onFramePointerDown, onFramePointerUp, onFrameClick, onFrameDoubleClick,
    }
  },
}

const RECORDING_HINT_TEXT = `Double-tap either side to skip ${SKIP_STEP_S} seconds.`
