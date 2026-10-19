import { ref, watch } from '/vendor/vue.esm-browser.prod.js'
import { seekPlan, adBreakAt, SEEK_EDGE_MARGIN_S } from '/playback.js'
import { DOUBLE_TAP_MS, emptyTapState, isTap, registerTap, clampSkip } from '/double-tap.js'
import { captionsShowing, captionPreferenceAfterChange } from '/live-captions.js'
import { csrfToken, api } from '/shared/api.js'
import { stopLive } from '/shared/live-session.js'
import {
  live,
  liveCaptionsOn,
  captionTracksOf,
  playerWindowed,
  toggleStageFullscreen,
  finiteOrNull,
  createSkipHintFlasher,
  tapZoneOf,
  isPictureTarget,
  playback,
  playbackHooks,
  playerMini,
} from '/shared/player-shared.js'
import { wait } from '/shared/utils.js'

const SEEK_RESTART_DELAY_MS = 400

const PLAYER_TOKEN = crypto.randomUUID?.() ?? String(Math.random()).slice(2)

export const playInfoOpen = ref(false)
let playHlsBuffered = false

export const applyPlayCaptions = () => {
  const showing = playback.captions && liveCaptionsOn.value && !playInfoOpen.value
  if (playHls) {
    if (playHlsBuffered) playHls.subtitleTrack = showing ? 0 : -1
    return
  }
  for (const track of captionTracksOf(playVideo)) track.mode = showing ? 'showing' : 'disabled'
}

export const syncPlayCaptionPreference = () => {
  if (!playback.captions || (playHls && !playHlsBuffered)) return
  liveCaptionsOn.value = captionPreferenceAfterChange({
    observedShowing: captionsShowing(captionTracksOf(playVideo)),
    expectedShowing: playback.captions && liveCaptionsOn.value && !playInfoOpen.value,
    preference: liveCaptionsOn.value,
  })
}

export const togglePlayCaptions = () => {
  if (playback.captions && !playInfoOpen.value) liveCaptionsOn.value = !liveCaptionsOn.value
}

watch([liveCaptionsOn, () => playback.captions, playInfoOpen], applyPlayCaptions)

export let playVideo = null
export let playHls = null
let playRun = 0
let playHeartbeatTimer = null
let lastSavedPosition = null
let autoRestarts = 0

export const playRecording = (recording, { fromStart = false } = {}) => {
  if (live.open) stopLive()
  stopPlayback()
  lastSavedPosition = recording.playback_position_s ?? null
  playerWindowed.value = false
  playerMini.value = false
  Object.assign(playback, {
    open: true, recording, sessionId: null, offset: 0, duration: recording.duration_s || 0,
    position: 0, phase: 'starting', message: '', resumed: false, started: false,
    paused: false, waiting: false, scrubbing: false, skipHint: null, adBreaks: [], source: '', captions: false,
  })
  playInfoOpen.value = false
  playVideo?.play()?.catch(() => {})
  startPlaybackAt(fromStart ? 0 : null)
}

export const stopPlayback = () => {
  if (playback.open) savePlaybackPosition()
  playRun += 1
  clearTimeout(playHeartbeatTimer)
  clearTimeout(playSingleTapTimer)
  detachPlayVideo()
  if (playback.sessionId) api('DELETE', `/api/play/${playback.sessionId}`).catch(() => {})
  Object.assign(playback, { open: false, sessionId: null, phase: 'idle', message: '' })
  playInfoOpen.value = false
  if (!live.open) playerMini.value = false
}

const startPlaybackAt = async (offset, { delayMs = 0 } = {}) => {
  const run = ++playRun
  const replace = playback.sessionId
  clearTimeout(playHeartbeatTimer)
  detachPlayVideo()
  playback.phase = 'starting'
  playback.message = ''
  if (offset != null) playback.position = offset
  if (delayMs) await wait(delayMs)
  if (run !== playRun) return
  const recordingId = encodeURIComponent(playback.recording.recording_id)
  try {
    const r = await api('POST', `/api/recordings/${recordingId}/play`, {
      ...(offset == null ? {} : { offset }),
      ...(replace ? { replace } : {}),
      player: PLAYER_TOKEN,
    })
    if (run !== playRun) {
      api('DELETE', `/api/play/${r.session.id}`).catch(() => {})
      return
    }
    Object.assign(playback, {
      sessionId: r.session.id,
      offset: r.session.offset,
      duration: r.session.duration || playback.duration,
      position: r.session.offset,
      phase: 'playing',
      waiting: true,
      captions: Boolean(r.session.captions),
    })
    if (offset == null) playback.resumed = Boolean(r.resumed)
    playback.adBreaks = r.adBreaks || []
    playback.source = r.source || ''

    attachPlayVideo(run, r.session.playlist)
    schedulePlayHeartbeat(run)
  } catch (err) {
    if (run !== playRun) return
    playback.sessionId = null
    endPlayback(run, `Error: ${err.message}`)
  }
}

const attachPlayVideo = async (run, playlist) => {
  if (playsNativeHlsOnly(playVideo)) {
    playVideo.src = playlist
    playVideo.play()?.catch(() => {})
    return
  }
  const { default: Hls } = await import('/vendor/hls.mjs')
  if (run !== playRun) return
  if (!Hls.isSupported()) return endPlayback(run, 'This browser cannot play recordings.')
  playHls = new Hls(PLAY_HLS_CONFIG)
  playHlsBuffered = false
  playHls.once(Hls.Events.FRAG_BUFFERED, () => {
    playHlsBuffered = true
    applyPlayCaptions()
  })
  let recovered = false
  playHls.on(Hls.Events.ERROR, (event, data) => {
    if (!data.fatal || run !== playRun) return
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) {
      recovered = true
      return playHls.recoverMediaError()
    }
    recoverPlayback(run, `Playback failed: ${data.details}`)
  })
  playHls.loadSource(playlist)
  playHls.attachMedia(playVideo)
  playVideo.play()?.catch(() => {})
}

const playsNativeHlsOnly = (video) =>
  !('MediaSource' in window) && video.canPlayType('application/vnd.apple.mpegurl') !== ''

const recoverPlayback = (run, message) => {
  if (run !== playRun) return
  if (autoRestarts >= PLAY_MAX_AUTO_RESTARTS) return endPlayback(run, message)
  autoRestarts += 1
  playback.sessionId = null
  startPlaybackAt(Math.floor(playback.position))
}

const endPlayback = (run, message) => {
  if (run !== playRun) return
  clearTimeout(playHeartbeatTimer)
  detachPlayVideo()
  if (playback.sessionId) api('DELETE', `/api/play/${playback.sessionId}`).catch(() => {})
  playback.sessionId = null
  playback.phase = 'ended'
  playback.message = message
}

const detachPlayVideo = () => {
  playHls?.destroy()
  playHls = null
  playHlsBuffered = false
  playback.waiting = false
  if (!playVideo) return
  playVideo.pause()
  playVideo.removeAttribute('src')
  playVideo.load()
}

const schedulePlayHeartbeat = (run) => {
  clearTimeout(playHeartbeatTimer)
  playHeartbeatTimer = setTimeout(() => playHeartbeat(run), PLAY_HEARTBEAT_MS)
}

const playHeartbeat = async (run) => {
  if (run !== playRun || !playback.sessionId) return
  try {
    await api('POST', `/api/play/${playback.sessionId}/heartbeat`)
  } catch (err) {
    if (run !== playRun) return
    if (err.status === 404) return onPlaybackSessionGone(run)
  }
  if (playback.started && !playback.paused) savePlaybackPosition()
  schedulePlayHeartbeat(run)
}

const onPlaybackSessionGone = (run) => {
  if (run !== playRun) return
  playback.sessionId = null
  if (!playback.paused) recoverPlayback(run, 'Stopped: the stream ended.')
}

export const savePlaybackPosition = ({ keepalive = false } = {}) => {
  const recording = playback.recording
  if (!recording || !playback.started) return
  const seconds = Math.round(playback.position)
  if (seconds === lastSavedPosition) return
  lastSavedPosition = seconds
  recording.playback_position_s = seconds
  const url = `/api/recordings/${encodeURIComponent(recording.recording_id)}/position`
  if (!keepalive) return api('POST', url, { seconds }).catch(() => {})
  fetch(url, {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken || '' },
    body: JSON.stringify({ seconds }),
  }).catch(() => {})
}

const producedEndOf = () => {
  const last = playHls?.latestLevelDetails?.fragments?.at(-1)
  if (last) return last.start + last.duration
  const { seekable } = playVideo
  return seekable.length ? finiteOrNull(seekable.end(seekable.length - 1)) : null
}

export const seekPlaybackTo = (target) => {
  const restartAt = (offset) => startPlaybackAt(offset, { delayMs: SEEK_RESTART_DELAY_MS })
  if (!playback.open || playback.phase === 'ended') return restartAt(Math.max(0, Math.floor(target)))
  if (!playback.sessionId || playback.phase !== 'playing') return restartAt(Math.max(0, Math.floor(target)))
  const plan = seekPlan({
    target,
    offset: playback.offset,
    producedEnd: producedEndOf(),
    duration: playback.duration,
  })
  if (plan.kind === 'restart') return restartAt(plan.offset)
  playVideo.currentTime = plan.time
  playback.position = playback.offset + plan.time
  if (playVideo.paused) playVideo.play()?.catch(() => {})
}

export const togglePlayback = () => {
  if (playback.phase === 'ended') return startPlaybackAt(Math.floor(playback.position))
  if (!playback.sessionId && playback.phase === 'playing') return startPlaybackAt(Math.floor(playback.position))
  if (!playVideo || playback.phase !== 'playing') return
  if (playVideo.ended) return seekPlaybackTo(0)
  if (playVideo.paused) return playVideo.play()?.catch(() => {})
  playVideo.pause()
}

const flashPlaybackSkipHint = createSkipHintFlasher(playback)

const skipPlayback = ({ side, total, base }) => {
  const direction = side === 'back' ? -1 : 1
  const { to, applied } = clampSkip({
    base,
    delta: direction * total,
    floor: 0,
    ceiling: playback.duration ? playback.duration - SEEK_EDGE_MARGIN_S : null,
  })
  if (!applied) return
  flashPlaybackSkipHint({ side, seconds: applied })
  seekPlaybackTo(to)
}

export const skipCurrentAd = () => {
  const current = adBreakAt({ breaks: playback.adBreaks, time: playback.position })
  if (current) seekPlaybackTo(current.end)
}

export const startPlaybackOver = () => {
  playback.resumed = false
  seekPlaybackTo(0)
}

let playTapState = emptyTapState()
let playTapStart = null
let playSingleTapTimer = null

const registerPlayTap = ({ side, force }) => {
  const step = registerTap(playTapState, { side, at: Date.now(), position: playback.position, force })
  playTapState = step.state
  return step.result
}

export const onPlayPointerDown = (e) => {
  playTapStart = e.isPrimary && isPictureTarget(e.target, playVideo)
    ? { x: e.clientX, y: e.clientY, at: Date.now() }
    : null
}

export const cancelPlayTap = () => { playTapStart = null }

export const onPlayPointerUp = (e, { onSingleTap = togglePlayback } = {}) => {
  const start = playTapStart
  playTapStart = null
  if (!start || playback.phase !== 'playing') return
  const tap = {
    startX: start.x, startY: start.y, endX: e.clientX, endY: e.clientY,
    ms: Date.now() - start.at, pointerType: e.pointerType,
  }
  if (!isTap(tap)) return
  const side = tapZoneOf({ video: playVideo, event: e, bottomInsetPx: 0 })
  const result = registerPlayTap({ side, force: false })
  clearTimeout(playSingleTapTimer)
  if (result.kind === 'skip') return skipPlayback(result)
  playSingleTapTimer = setTimeout(onSingleTap, DOUBLE_TAP_MS)
}

export const onPlayDoubleClick = (e) => {
  if (!isPictureTarget(e.target, playVideo)) return
  e.preventDefault()
  e.stopPropagation()
  if (tapZoneOf({ video: playVideo, event: e, bottomInsetPx: 0 })) return
  clearTimeout(playSingleTapTimer)
  togglePlayFullscreen()
}

const togglePlayFullscreen = () => toggleStageFullscreen({ stage: playVideo?.closest('.play-stage'), video: playVideo })

export const skipPlaybackByKey = (side) => {
  const result = registerPlayTap({ side, force: true })
  if (result.kind === 'skip') skipPlayback(result)
  return true
}

const sendPlaybackBeacon = () => {
  if (!playback.sessionId) return
  fetch(`/api/play/${playback.sessionId}`, {
    method: 'DELETE',
    keepalive: true,
    headers: { 'x-csrf-token': csrfToken || '' },
  }).catch(() => {})
}

window.addEventListener('pagehide', (event) => {
  if (!playback.open) return
  savePlaybackPosition({ keepalive: true })
  if (!event.persisted) sendPlaybackBeacon()
})

document.addEventListener('visibilitychange', () => {
  if (!playback.open) return
  if (document.visibilityState === 'hidden') return savePlaybackPosition({ keepalive: true })
  if (playback.sessionId) playHeartbeat(playRun)
})

const PLAY_HLS_CONFIG = {
  workerPath: '/vendor/hls.worker.js',
  startPosition: 0,
  maxBufferLength: 30,
  backBufferLength: 60,
}
const PLAY_HEARTBEAT_MS = 15_000
const PLAY_MAX_AUTO_RESTARTS = 2

export const setPlayVideo = (el) => { playVideo = el }
export const resetAutoRestarts = () => { autoRestarts = 0 }

playbackHooks.stopPlayback = stopPlayback
