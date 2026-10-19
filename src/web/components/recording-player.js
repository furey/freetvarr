import { ref, computed, onMounted, watch } from '/vendor/vue.esm-browser.prod.js'
import { adBreakAt, fmtPlayTime } from '/playback.js'
import {
  adsText,
  airedRangeText,
  durationText,
  libraryStatusOf,
  libraryStatusText,
  recordingEpisodeLine,
  recordingHeaderLine,
  savesToLine,
  sourceBadgeText,
  watchedPercent,
} from '/recording-info.js'
import { CAPTION_LINE_PERCENT } from '/live-captions.js'
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
  playerLayoutOf,
  exitPlayerFullscreen,
  toggleStageFullscreen,
  FILLED_CAPTION_LINE,
  playback,
} from '/shared/player-shared.js'
import { tz, fmtTime } from '/shared/time.js'

export const RecordingPlayer = {
  template: `
    <teleport to="body">
    <transition name="epg-sheet">
    <div v-show="playback.open" :class="['epg-modal-backdrop', 'live-backdrop', layout]">
      <section class="panel epg-modal live-modal play-modal" role="dialog" aria-label="Recording player">
        <player-header :channel-id="recording?.channel_id" has-logo :title="header.title" :subtitle="header.subtitle"
          @close="stopPlayback" />
        <div ref="stageEl" :class="['play-stage', { 'is-info-open': infoOpen, 'is-controls-hidden': !controlsShown }]">
          <div class="live-frame" @pointerdown="onFramePointerDown" @pointerup="onFramePointerUp" @pointercancel="cancelPlayTap"
            @pointermove="onControlsPointerMove" @click.capture="onFrameClick" @dblclick.capture="onFrameDoubleClick">
            <video ref="videoEl" :class="['live-video', { 'is-veiled': playback.phase !== 'playing' }]" playsinline x-webkit-airplay="allow" preload="auto"></video>
            <div class="player-tap-layer" aria-hidden="true"></div>
            <span v-if="overlayText" class="play-caption">{{ overlayText }}</span>
            <player-overlay-buttons :info-open="infoOpen" info-id="play-info" :has-captions="playback.captions"
              :captions-on="captionsOn" :fullscreen="isStageFullscreen || layout['is-filled']"
              @toggle-info="toggleInfo" @toggle-captions="togglePlayCaptions" @close="stopPlayback" @exit-fullscreen="exitPlayerFullscreen" />
            <div v-if="playback.skipHint" :key="playback.skipHint.key" :class="['live-skip-hint', playback.skipHint.side]" aria-hidden="true">
              <span>{{ playback.skipHint.label }}</span>
            </div>
            <span class="sr-only" aria-live="polite">{{ playback.skipHint?.spoken || '' }}</span>
            <button v-if="inAdBreak && !infoOpen" type="button" class="btn play-skip-ad" @click="skipCurrentAd">SKIP AD</button>
          </div>
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
          <div class="play-controls">
            <div class="play-scrub">
              <span class="play-time">{{ fmtPlayTime(shownPosition) }}</span>
              <input type="range" class="play-range" min="0" step="1"
                :max="scrubMax" :value="Math.floor(shownPosition)"
                :style="{ '--fill': fillPercent }"
                @input="onScrubInput" @change="onScrubCommit"
                aria-label="Position">
              <span class="play-time">{{ fmtPlayTime(playback.duration) }}</span>
            </div>
            <div class="play-buttons play-overlay-buttons">
              <button v-if="playback.resumed" type="button" class="btn btn-icon" @click="startPlaybackOver" aria-label="Start over"><start-over-icon /></button>
              <button v-if="playback.airplay" type="button" class="btn btn-icon" @click="showAirplay" aria-label="AirPlay"><airplay-icon /></button>
              <button type="button" class="btn btn-icon" @click="togglePlayback" :aria-label="playback.paused ? 'Play' : 'Pause'">
                <play-icon v-if="playback.paused" /><pause-icon v-else />
              </button>
            </div>
          </div>
        </div>
        <div class="panel-body">
          <player-action-row :info-open="infoOpen" info-id="play-info" :has-captions="playback.captions"
            :captions-on="captionsOn" :status-text="statusText" :status-kind="statusKind"
            @toggle-info="toggleInfo" @toggle-captions="togglePlayCaptions">
            <template #icons>
              <button type="button" class="btn btn-icon live-action-icon player-wide-only" @click="toggleFullscreen" aria-label="Full screen"><fullscreen-icon /></button>
              <button v-if="playback.airplay" type="button" class="btn btn-icon live-action-icon player-wide-only" @click="showAirplay" aria-label="AirPlay"><airplay-icon /></button>
            </template>
            <template #menu>
              <button type="button" class="player-menu-item" role="menuitem" @click="toggleFullscreen"><fullscreen-icon /> FULL SCREEN</button>
              <button v-if="playback.airplay" type="button" class="player-menu-item" role="menuitem" @click="showAirplay"><airplay-icon /> AIRPLAY</button>
              <button v-if="playback.resumed && playback.phase !== 'ended'" type="button" class="player-menu-item" role="menuitem" @click="startPlaybackOver"><start-over-icon /> START OVER</button>
            </template>
            <button v-if="playback.phase === 'ended'" type="button" class="btn" @click="togglePlayback"><refresh-icon /> RETRY</button>
            <template v-else>
              <button v-if="playback.resumed" type="button" class="btn live-action-wide player-wide-only" aria-label="START OVER" @click="startPlaybackOver">
                <start-over-icon /> <span class="live-action-label">START OVER</span>
              </button>
              <button type="button" class="btn live-action-wide live-pause-button" :aria-label="playback.paused ? 'Play' : 'Pause'" @click="togglePlayback">
                <play-icon v-if="playback.paused" /><pause-icon v-else />
                <span class="live-action-label">{{ playback.paused ? 'PLAY' : 'PAUSE' }}</span>
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
    const stageEl = ref(null)
    const recording = computed(() => playback.recording)
    const infoOpen = playInfoOpen

    const header = computed(() => {
      const r = playback.recording
      if (!r) return { title: '', subtitle: '' }
      if (!r.channel_name) return { title: r.title, subtitle: recordingEpisodeLine(r) }
      return { title: r.channel_name, subtitle: recordingHeaderLine(r) }
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
    const fillPercent = computed(() => `${Math.min(100, (shownPosition.value / scrubMax.value) * 100)}%`)

    const statusText = computed(() => {
      if (playback.phase === 'ended') return playback.message
      if (playback.phase === 'starting') {
        return playback.position > 0 ? `LOADING AT ${fmtPlayTime(playback.position)}…` : 'LOADING…'
      }
      if (playback.waiting) return 'BUFFERING…'
      return playback.paused ? 'PAUSED' : 'PLAYING'
    })

    const statusKind = computed(() => {
      if (playback.phase === 'ended') return 'err'
      return playback.phase === 'playing' && !playback.waiting ? 'ok' : 'info'
    })

    const overlayText = computed(() => {
      if (playback.phase === 'ended') return playback.message
      if (playback.phase === 'starting' || playback.waiting) return statusText.value
      return ''
    })

    const onScrubInput = (e) => {
      playback.scrubbing = true
      playback.scrubValue = Number(e.target.value)
    }

    const onScrubCommit = (e) => {
      playback.scrubbing = false
      seekPlaybackTo(Number(e.target.value))
    }

    const toggleFullscreen = () => toggleStageFullscreen({ stage: stageEl.value, video: playVideo })
    const layout = computed(() => playerLayoutOf({ canFill: playback.phase !== 'ended' }))
    const customControls = computed(() => layout.value['is-filled'] || isStageFullscreen.value)
    const { controlsShown, revealControls, onPointerMove: onControlsPointerMove } = useControlsAutoHide({
      enabled: computed(() => playback.open && customControls.value),
      holdShown: computed(() => playback.paused || playback.phase !== 'playing' || playback.waiting
        || playback.scrubbing || infoOpen.value),
      rootEl: stageEl,
    })
    const captionLine = computed(() => (customControls.value && controlsShown.value ? FILLED_CAPTION_LINE : CAPTION_LINE_PERCENT))
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
      ignoreSelector: 'button, select, textarea, input:not(.play-range)',
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
      infoOpen, toggleInfo, videoEl, stageEl, shownPosition, scrubMax, fillPercent, controlsShown, onControlsPointerMove, cancelPlayTap,
      statusText, statusKind, overlayText, fmtPlayTime, inAdBreak, skipCurrentAd,
      stopPlayback, togglePlayback, startPlaybackOver, onScrubInput, onScrubCommit,
      toggleFullscreen, isStageFullscreen, layout, exitPlayerFullscreen, showAirplay,
      captionsOn: liveCaptionsOn, togglePlayCaptions, onFramePointerDown, onFramePointerUp, onFrameClick, onFrameDoubleClick,
    }
  },
}
