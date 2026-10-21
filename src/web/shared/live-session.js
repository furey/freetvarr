import { ref, watch } from '/vendor/vue.esm-browser.prod.js'
import {
  DOUBLE_TAP_MS,
  emptyTapState,
  isTap,
  registerTap,
  clampSkip,
  nativeClickPlan,
} from '/double-tap.js'
import {
  CAPTION_LINE_PERCENT,
  captionsShowing,
  captionPreferenceAfterChange,
} from '/live-captions.js'
import { isReadyToStart } from '/live-start.js'
import { liveWindowOf, steadyLiveWindowOf, videoLiveInputOf, rangesOf } from '/live-edge.js'
import { captionLineOf } from '/mini-player.js'
import { initialPausedState, pausedStateAfter } from '/player-paused.js'
import { csrfToken, api } from '/shared/api.js'
import { addAttentionSource, reportAttention } from '/shared/attention-session.js'
import {
  live,
  liveCaptionsOn,
  captionTracksOf,
  playerWindowed,
  toggleStageFullscreen,
  createSkipHintFlasher,
  tapZoneOf,
  isPictureTarget,
  FILLED_CAPTION_LINE,
  playback,
  playbackHooks,
  playerMini,
} from '/shared/player-shared.js'

export let liveVideo = null
export let liveHls = null
let liveHlsBuffered = false
let liveAttached = false
let liveStarted = false
let liveStartTimer = null
let liveMetadataAt = 0
let liveEdgeAnchor = null
let livePollTimer = null
let liveRun = 0
let fromStartBeatTimer = null

export const liveStopHooks = new Set()

export const liveChannelOf = (channel) => ({
  id: channel.id,
  name: channel.name,
  number: channel.number ?? null,
  hasLogo: (channel.logos || []).length > 0,
})

export const watchLive = ({ channel, nowTitle }) => {
  if (live.open && live.channel?.id === channel.id && live.phase !== 'ended') return
  if (playback.open) playbackHooks.stopPlayback()
  stopLive()
  playerWindowed.value = false
  playerMini.value = false
  Object.assign(live, {
    open: true, channel, nowTitle, sessionId: null,
    phase: 'tuning', message: '', holders: [], conflict: null, tuningStartedAt: Date.now(),
  })
  unlockLiveVideo()
  startLiveSession(liveRun)
}

export const watchRecordingFromStart = ({ channel, recording, nowTitle = '' }) => {
  if (playback.open) playbackHooks.stopPlayback()
  stopLive()
  playerWindowed.value = false
  playerMini.value = false
  Object.assign(live, {
    open: true, channel, nowTitle, sessionId: null,
    phase: 'tuning', message: '', holders: [], conflict: null, tuningStartedAt: Date.now(),
  })
  unlockLiveVideo()
  watchFromStart(recording)
}

const unlockLiveVideo = () => {
  if (!liveVideo) return
  liveVideo.play()?.catch(() => {})
  liveVideo.pause()
}

export const stopLive = () => {
  liveRun += 1
  clearTimeout(livePollTimer)
  detachLiveVideo()
  if (live.sessionId) api('DELETE', `/api/live/${live.sessionId}`).catch(() => {})
  stopFromStartSession()
  Object.assign(live, {
    open: false, sessionId: null, phase: 'idle', message: '', holders: [], conflict: null, captions: false,
  })
  playerMini.value = false
  for (const hook of liveStopHooks) hook()
}

export const adoptLiveSession = ({ channel, session, nowTitle = '' }) => {
  liveRun += 1
  const run = liveRun
  clearTimeout(livePollTimer)
  detachLiveVideo()
  if (live.sessionId && live.sessionId !== session.id) api('DELETE', `/api/live/${live.sessionId}`).catch(() => {})
  stopFromStartSession()
  Object.assign(live, {
    channel, nowTitle, sessionId: session.id, phase: 'tuning', message: '', holders: [], conflict: null,
    tuningStartedAt: Date.now(), bufferSeconds: session.bufferSeconds || 0, captions: Boolean(session.captions),
  })
  attachLiveVideo(run, session.playlist)
  pollLive(run)
}

export const retuneLive = ({ channel, nowTitle = '' }) => {
  liveRun += 1
  clearTimeout(livePollTimer)
  detachLiveVideo()
  if (live.sessionId) api('DELETE', `/api/live/${live.sessionId}`).catch(() => {})
  stopFromStartSession()
  Object.assign(live, {
    channel, nowTitle, sessionId: null, phase: 'tuning', message: '', holders: [], conflict: null,
    tuningStartedAt: Date.now(),
  })
  startLiveSession(liveRun)
}

export const watchFromStart = async (recording) => {
  liveRun += 1
  const run = liveRun
  clearTimeout(livePollTimer)
  detachLiveVideo()
  if (live.sessionId) api('DELETE', `/api/live/${live.sessionId}`).catch(() => {})
  const replace = live.fromStart?.sessionId
  Object.assign(live, {
    sessionId: null, phase: 'tuning', message: '', holders: [], conflict: null, tuningStartedAt: Date.now(),
    fromStart: {
      dvrUuid: recording.dvrUuid, title: recording.title, sessionId: null,
      recordingStartedAt: recording.recordingStartedAt ?? recording.startPadded ?? recording.start,
      edgeSeconds: 0, growing: true,
    },
  })
  try {
    const r = await api('POST', '/api/play/in-progress', {
      dvrUuid: recording.dvrUuid, player: FROM_START_PLAYER, ...(replace ? { replace } : {}),
    })
    if (run !== liveRun) {
      api('DELETE', `/api/play/${r.session.id}`).catch(() => {})
      return
    }
    Object.assign(live.fromStart, {
      sessionId: r.session.id,
      recordingStartedAt: r.session.recordingStartedAt ?? live.fromStart.recordingStartedAt,
      edgeSeconds: r.session.liveEdgeSeconds || 0,
    })
    live.captions = Boolean(r.session.captions)
    attachLiveVideo(run, r.session.playlist, { config: FROM_START_HLS_CONFIG })
    scheduleFromStartBeat(run)
  } catch (err) {
    if (run !== liveRun) return
    live.phase = 'ended'
    live.message = fromStartErrorText(err)
  }
}

export const returnToLive = () => {
  if (!live.fromStart) return jumpToLive()
  retuneLive({ channel: live.channel, nowTitle: live.nowTitle })
}

const stopFromStartSession = () => {
  clearTimeout(fromStartBeatTimer)
  const sessionId = live.fromStart?.sessionId
  if (sessionId) api('DELETE', `/api/play/${sessionId}`).catch(() => {})
  live.fromStart = null
}

const scheduleFromStartBeat = (run) => {
  clearTimeout(fromStartBeatTimer)
  fromStartBeatTimer = setTimeout(() => beatFromStart(run), FROM_START_HEARTBEAT_MS)
}

const beatFromStart = async (run) => {
  const sessionId = live.fromStart?.sessionId
  if (run !== liveRun || !sessionId) return
  try {
    const r = await api('POST', `/api/play/${sessionId}/heartbeat`)
    if (run !== liveRun || !live.fromStart) return
    live.fromStart.edgeSeconds = r.session?.liveEdgeSeconds ?? live.fromStart.edgeSeconds
    live.fromStart.growing = r.session?.growing !== false
  } catch (err) {
    if (run !== liveRun) return
    if (err.status === 404) return endLive(run, { code: 'gone' })
  }
  scheduleFromStartBeat(run)
}

const fromStartErrorText = (err) => {
  if (err.code === 'stream-limit') return streamLimitText(err)
  if (err.code === 'not-recording') return 'The recording has stopped, so it cannot play from the start.'
  if (err.code === 'missing') return 'Freetvarr cannot read this recording yet.'
  return `Error: ${err.message}`
}

const streamLimitText = (err) => {
  const limit = err.data?.limit ?? err.limit
  const playing = (err.data?.playing || []).filter(Boolean).join(', ')
  const count = limit === 1 ? '1 stream' : `${limit || 'all'} streams`
  return playing ? `This NAS is already playing ${count}: ${playing}.` : `This NAS is already playing ${count}.`
}

const startLiveSession = async (run) => {
  try {
    const r = await api('POST', '/api/live', { channel_id: live.channel.id })
    if (run !== liveRun) {
      api('DELETE', `/api/live/${r.session.id}`).catch(() => {})
      return
    }
    live.sessionId = r.session.id
    live.bufferSeconds = r.session.bufferSeconds || 0
    live.captions = Boolean(r.session.captions)
    live.conflict = r.conflict
    if (r.session.status === 'ended') return endLive(run, r.session.reason)
    attachLiveVideo(run, r.session.playlist, { eager: true })
    pollLive(run)
  } catch (err) {
    if (run !== liveRun) return
    live.phase = 'ended'
    live.message = liveStartErrorText(err)
    live.holders = err.data?.holders || []
  }
}

const pollLive = async (run) => {
  if (run !== liveRun) return
  try {
    const params = new URLSearchParams({ channel: live.channel.id, session: live.sessionId })
    const r = await api('GET', `/api/live/preflight?${params}`)
    if (run !== liveRun) return
    live.conflict = r.conflict
    const session = r.session
    if (!session || session.id !== live.sessionId || session.status === 'ended') {
      return endLive(run, session?.reason)
    }
    live.captions = Boolean(session.captions)
    if (session.status === 'live' && !liveAttached) await attachLiveVideo(run, session.playlist)
  } catch {
    if (run !== liveRun) return
  }
  clearTimeout(livePollTimer)
  livePollTimer = setTimeout(() => pollLive(run), liveAttached ? LIVE_POLL_PLAYING_MS : LIVE_POLL_TUNING_MS)
}

const playsHlsOnlyNatively = () =>
  !('MediaSource' in window) && liveVideo.canPlayType('application/vnd.apple.mpegurl') !== ''

const attachLiveVideo = async (run, playlist, { eager = false, config = LIVE_HLS_CONFIG } = {}) => {
  liveAttached = true
  liveEdgeAnchor = null
  if (!playsHlsOnlyNatively()) return attachHlsJs(run, playlist, { eager, config })
  liveVideo.addEventListener('loadedmetadata', () => {
    if (live.fromStart && run === liveRun) {
      liveVideo.currentTime = 0
      playAfterSeek()
    }
    markLiveStarted(run)
  }, { once: true })
  liveVideo.addEventListener('error', () => {
    if (run !== liveRun || !liveAttached || liveHls) return
    clearVideoSource()
    if (eager) return abandonEagerAttach(run)
    attachHlsJs(run, playlist)
  }, { once: true })
  liveVideo.src = playlist
  liveVideo.play()?.catch(() => {})
}

const markLiveStarted = (run) => {
  if (run !== liveRun || !liveAttached || live.phase === 'ended') return
  liveStarted = true
  live.phase = 'live'
}

const startWhenBuffered = (run) => {
  clearTimeout(liveStartTimer)
  if (run !== liveRun || !liveAttached || live.phase === 'ended') return
  if (liveStarted) return liveVideo.play()?.catch(() => {})
  const ready = isReadyToStart({
    ranges: rangesOf(liveVideo.buffered),
    position: liveVideo.currentTime,
    waitedMs: msSinceLiveMetadata(),
  })
  if (!ready) {
    liveStartTimer = setTimeout(() => startWhenBuffered(run), LIVE_START_CHECK_MS)
    return
  }
  markLiveStarted(run)
  liveVideo.play()?.catch(() => {})
}

const msSinceLiveMetadata = () => {
  if (liveVideo.readyState < HAVE_METADATA) return 0
  if (!liveMetadataAt) liveMetadataAt = Date.now()
  return Date.now() - liveMetadataAt
}

const abandonEagerAttach = (run) => {
  if (run !== liveRun) return
  detachLiveVideo()
}

const attachHlsJs = async (run, playlist, { rebuilt = false, eager = false, config = LIVE_HLS_CONFIG } = {}) => {
  const { default: Hls } = await import('/vendor/hls.mjs')
  if (run !== liveRun) return
  if (!Hls.isSupported()) return endLive(run, { code: 'unsupported' })
  liveHls = new Hls(config)
  liveHlsBuffered = false
  let recovered = false
  liveHls.once(Hls.Events.FRAG_BUFFERED, () => {
    liveHlsBuffered = true
    applyLiveCaptions()
  })
  liveHls.on(Hls.Events.ERROR, (event, data) => {
    if (!data.fatal || run !== liveRun) return
    if (eager && data.type === Hls.ErrorTypes.NETWORK_ERROR) return abandonEagerAttach(run)
    if (data.type !== Hls.ErrorTypes.MEDIA_ERROR) return endLive(run, { code: 'playback', detail: data.details })
    if (!recovered) {
      recovered = true
      return liveHls.recoverMediaError()
    }
    if (rebuilt) return endLive(run, { code: 'playback', detail: data.details })
    liveHls.destroy()
    liveHls = null
    attachHlsJs(run, playlist, { rebuilt: true, config })
  })
  liveHls.loadSource(playlist)
  liveHls.attachMedia(liveVideo)
  startWhenBuffered(run)
}

const endLive = (run, reason) => {
  if (run !== liveRun) return
  clearTimeout(livePollTimer)
  detachLiveVideo()
  if (live.sessionId) api('DELETE', `/api/live/${live.sessionId}`).catch(() => {})
  live.sessionId = null
  clearTimeout(fromStartBeatTimer)
  if (live.fromStart?.sessionId) {
    api('DELETE', `/api/play/${live.fromStart.sessionId}`).catch(() => {})
    live.fromStart.sessionId = null
  }
  live.phase = 'ended'
  live.message = liveReasonText(reason)
}

export const applyLiveCaptions = () => {
  const showing = live.captions && liveCaptionsOn.value && !liveInfoOpen.value
  if (liveHls) {
    if (liveHlsBuffered) liveHls.subtitleTrack = showing ? 0 : -1
    return
  }
  for (const track of captionTracksOf(liveVideo)) track.mode = showing ? 'showing' : 'disabled'
}

export const syncCaptionPreferenceFromTracks = () => {
  if (!live.captions || (liveHls && !liveHlsBuffered)) return
  liveCaptionsOn.value = captionPreferenceAfterChange({
    observedShowing: captionsShowing(captionTracksOf(liveVideo)),
    expectedShowing: live.captions && liveCaptionsOn.value && !liveInfoOpen.value,
    preference: liveCaptionsOn.value,
  })
}

export const toggleLiveCaptions = () => {
  if (live.captions && !liveInfoOpen.value) liveCaptionsOn.value = !liveCaptionsOn.value
}

export const liveInfoOpen = ref(false)

watch([liveCaptionsOn, () => live.captions, liveInfoOpen], applyLiveCaptions)

const detachLiveVideo = () => {
  liveHls?.destroy()
  liveHls = null
  liveHlsBuffered = false
  liveAttached = false
  liveStarted = false
  liveMetadataAt = 0
  clearTimeout(liveStartTimer)
  liveEdgeAnchor = null
  live.behindSeconds = 0
  if (!liveVideo) return
  liveVideo.pause()
  clearVideoSource()
}

const clearVideoSource = () => {
  liveVideo.removeAttribute('src')
  liveVideo.load()
}

export const liveReasonText = (reason) => {
  const detail = reason?.detail ? `: ${reason.detail}` : '.'
  if (!reason) return 'Stopped: the stream ended.'
  if (reason.code === 'preempted') return `Stopped for a recording: ${reason.recording}`
  if (reason.code === 'stream-limit') return streamLimitText(reason)
  if (reason.code === 'no-input') return 'Stopped: TVHeadend gets no signal for this channel.'
  if (reason.code === 'gone') return 'Stopped: TVHeadend ended the stream.'
  if (reason.code === 'idle') return 'Stopped: nobody was watching.'
  if (reason.code === 'shutdown') return 'Stopped: Freetvarr restarted.'
  if (reason.code === 'no-tuner') return 'No free tuner.'
  if (reason.code === 'no-source') return "Stopped: TVHeadend can't tune this channel. It isn't broadcasting, or every tuner is busy."
  if (reason.code === 'ffmpeg') return `ffmpeg failed${detail}`
  if (reason.code === 'upstream') return `TVHeadend refused the stream${detail}`
  if (reason.code === 'playback') return `Playback failed${detail}`
  if (reason.code === 'unsupported') return 'This browser cannot play live TV.'
  return 'Stopped.'
}

const liveStartErrorText = (err) => {
  if (err.code === 'stream-limit') return streamLimitText(err)
  if (err.code === 'no-tuner') return 'No free tuner. Every tuner is busy on another multiplex:'
  if (err.code === 'off-air') return err.message
  return `Error: ${err.message}`
}

export const liveHolderText = (h) => `${h.tuner} · ${h.mux} · ${h.holders.join(', ') || 'in use'}`

export const fmtCountdown = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}

const sendFromStartBeacon = () => {
  const sessionId = live.fromStart?.sessionId
  if (!sessionId) return
  fetch(`/api/play/${sessionId}`, {
    method: 'DELETE',
    keepalive: true,
    headers: { 'x-csrf-token': csrfToken || '' },
  }).catch(() => {})
}

const sendLiveBeacon = ({ method, suffix = '' }) => {
  if (!live.sessionId) return
  fetch(`/api/live/${live.sessionId}${suffix}`, {
    method,
    keepalive: true,
    headers: { 'x-csrf-token': csrfToken || '' },
  }).catch(() => {})
}

const liveCaptionsShown = () => Boolean(live.captions && liveCaptionsOn.value && !liveInfoOpen.value)

addAttentionSource(() => [
  { kind: 'live', sessionId: live.sessionId, video: liveVideo, captions: liveCaptionsShown(), picture: true },
  { kind: 'play', sessionId: live.fromStart?.sessionId, video: liveVideo, captions: liveCaptionsShown(), picture: true },
])

watch(liveCaptionsShown, reportAttention)

window.addEventListener('pagehide', (event) => {
  if (event.persisted) return sendLiveBeacon({ method: 'POST', suffix: '/hold' })
  sendLiveBeacon({ method: 'DELETE' })
  sendFromStartBeacon()
})

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') return sendLiveBeacon({ method: 'POST', suffix: '/hold' })
  if (live.fromStart?.sessionId) return beatFromStart(liveRun)
  if (!live.sessionId) return
  clearTimeout(livePollTimer)
  pollLive(liveRun)
})

const FULLSCREEN_EXIT_RESUME_MS = 1_500

let resumeAfterFullscreenUntil = 0

const resumeAfterFullscreen = () => {
  if (!live.open || live.phase === 'ended' || !liveVideo) return
  liveVideo.play()?.catch(() => {})
}

export const onLiveFullscreenExit = () => {
  resumeAfterFullscreenUntil = Date.now() + FULLSCREEN_EXIT_RESUME_MS
  setTimeout(resumeAfterFullscreen, 100)
}

const liveWindowInput = () => ({
  ...videoLiveInputOf(liveVideo),
  hlsSyncPosition: liveHls?.liveSyncPosition ?? null,
  hlsOldestSecond: liveHls?.latestLevelDetails?.fragments?.[0]?.start ?? null,
  fromStart: Boolean(live.fromStart),
  bufferSeconds: live.fromStart ? 0 : live.bufferSeconds,
})

const currentLiveWindow = () => liveWindowOf(liveWindowInput())

const steadyLiveWindow = () => {
  const steady = steadyLiveWindowOf({ ...liveWindowInput(), anchor: liveEdgeAnchor, wallS: performance.now() / 1000 })
  liveEdgeAnchor = steady.anchor
  return steady
}

export const trackBehindLive = () => {
  const ready = liveVideo?.readyState >= HAVE_CURRENT_DATA
  if (!ready) liveEdgeAnchor = null
  const liveWindow = ready ? steadyLiveWindow() : null
  live.behindSeconds = liveWindow ? liveWindow.behind : 0
  live.bufferTo = liveWindow ? liveWindow.target : null
  live.bufferFrom = liveWindow ? liveWindow.floor : null
  live.position = ready ? liveVideo.currentTime : 0
}

export const seekLiveTo = (second) => {
  if (!canSkip() || live.bufferFrom == null || live.bufferTo == null) return false
  const ceiling = Math.min(live.bufferTo, currentLiveWindow().target ?? live.bufferTo)
  liveVideo.currentTime = Math.max(live.bufferFrom, Math.min(ceiling, second))
  trackBehindLive()
  return true
}

export const seekLiveAndPlay = (second) => {
  if (!seekLiveTo(second)) return
  playAfterSeek()
}

const playAfterSeek = () => {
  liveVideo.play()?.catch(() => {})
  if (liveVideo.seeking) liveVideo.addEventListener('seeked', resumeIfPaused, { once: true })
}

const resumeIfPaused = () => {
  if (liveAttached && liveVideo.paused) liveVideo.play()?.catch(() => {})
}

export const placeLiveCaptions = () => {
  const line = captionLineOf({
    mini: playerMini.value,
    lifted: live.captionsLifted,
    liftedLine: FILLED_CAPTION_LINE,
    restingLine: CAPTION_LINE_PERCENT,
  })
  for (const track of captionTracksOf(liveVideo)) {
    for (const cue of track.cues || []) if (cue.line !== line) cue.line = line
  }
}

export const keepSeekInsideBuffer = () => {
  const { floor } = currentLiveWindow()
  if (floor != null && liveVideo.currentTime < floor) liveVideo.currentTime = floor
}

const flashLiveSkipHint = createSkipHintFlasher(live)

let liveTapState = emptyTapState()
let liveTapStart = null
let liveClickPlan = 'pass'
let liveSingleClickTimer = null

const canSkip = () => live.phase === 'live' && (live.bufferSeconds > 0 || Boolean(live.fromStart)) && liveAttached

export const onLivePointerDown = (e) => {
  liveTapStart = e.isPrimary && isPictureTarget(e.target, liveVideo)
    ? { x: e.clientX, y: e.clientY, at: Date.now() }
    : null
}

export const onLivePointerUp = (e, { onSingleTap = toggleLivePause } = {}) => {
  const start = liveTapStart
  liveTapStart = null
  liveClickPlan = 'pass'
  if (!start) return
  if (live.customControls) return onCustomControlsTap({ start, e, onSingleTap })
  if (!canSkip()) return
  const tap = {
    startX: start.x, startY: start.y, endX: e.clientX, endY: e.clientY,
    ms: Date.now() - start.at, pointerType: e.pointerType,
  }
  if (!isTap(tap)) return
  const side = tapZoneOf({ video: liveVideo, event: e, bottomInsetPx: NATIVE_CONTROL_BAR_PX })
  const result = registerLiveTap({ side, force: false })
  liveClickPlan = nativeClickPlan({ tap: result.kind, pointerType: e.pointerType })
  clearTimeout(liveSingleClickTimer)
  skipLive(result)
}

export const cancelLiveTap = () => { liveTapStart = null }

const onCustomControlsTap = ({ start, e, onSingleTap }) => {
  const tap = {
    startX: start.x, startY: start.y, endX: e.clientX, endY: e.clientY,
    ms: Date.now() - start.at, pointerType: e.pointerType,
  }
  if (!isTap(tap) || live.phase !== 'live') return
  const side = canSkip() ? tapZoneOf({ video: liveVideo, event: e, bottomInsetPx: 0 }) : null
  const result = registerLiveTap({ side, force: false })
  clearTimeout(liveSingleClickTimer)
  if (result.kind === 'skip') return skipLive(result)
  liveSingleClickTimer = setTimeout(onSingleTap, DOUBLE_TAP_MS)
}

export const onLiveClick = (e) => {
  const plan = liveClickPlan
  liveClickPlan = 'pass'
  if (plan === 'pass' || !isPictureTarget(e.target, liveVideo)) return
  e.preventDefault()
  e.stopPropagation()
  if (plan === 'toggle-later') liveSingleClickTimer = setTimeout(toggleLivePause, DOUBLE_TAP_MS)
}

export const toggleLivePause = () => {
  if (!liveAttached) return
  if (!liveVideo.paused && !live.stuck) return liveVideo.pause()
  liveVideo.play()?.catch(() => {})
}

let livePausedState = initialPausedState

export const syncLivePaused = (event) => {
  livePausedState = pausedStateAfter(livePausedState, {
    type: event?.type ?? 'sync', video: liveVideo, nowMs: Date.now(), pageVisible: document.visibilityState !== 'hidden',
  })
  const isLive = live.phase === 'live'
  live.paused = livePausedState.paused && isLive
  live.stuck = livePausedState.stuck && isLive
}

export const onLiveDoubleClick = (e) => {
  if (!isPictureTarget(e.target, liveVideo) || (!live.customControls && isOnNativeControlBar(e))) return
  e.preventDefault()
  e.stopPropagation()
  const bottomInsetPx = live.customControls ? 0 : NATIVE_CONTROL_BAR_PX
  if (canSkip() && tapZoneOf({ video: liveVideo, event: e, bottomInsetPx })) return
  clearTimeout(liveSingleClickTimer)
  toggleStageFullscreen({ stage: liveVideo.closest('.live-frame'), video: liveVideo })
}

const isOnNativeControlBar = (e) => e.clientY > liveVideo.getBoundingClientRect().bottom - NATIVE_CONTROL_BAR_PX

const registerLiveTap = ({ side, force }) => {
  const step = registerTap(liveTapState, { side, at: Date.now(), position: liveVideo.currentTime, force })
  liveTapState = step.state
  return step.result
}

const skipLive = (result) => {
  if (result.kind !== 'skip') return
  const direction = result.side === 'back' ? -1 : 1
  const { floor, target } = currentLiveWindow()
  const { to, applied } = clampSkip({
    base: result.base,
    delta: direction * result.total,
    floor,
    ceiling: target,
  })
  if (!applied) return
  liveVideo.currentTime = to
  flashLiveSkipHint({ side: result.side, seconds: applied })
  trackBehindLive()
}

export const skipLiveByKey = (side) => {
  if (!canSkip()) return false
  skipLive(registerLiveTap({ side, force: true }))
  return true
}

export const jumpToLive = () => {
  if (!liveVideo) return
  const { target } = currentLiveWindow()
  if (target != null && Math.abs(target - liveVideo.currentTime) > LIVE_SEEK_EPSILON_S) liveVideo.currentTime = target
  playAfterSeek()
  trackBehindLive()
}

export const onLivePause = () => {
  if (Date.now() < resumeAfterFullscreenUntil) setTimeout(resumeAfterFullscreen, 100)
}

const LIVE_POLL_TUNING_MS = 1_000

const LIVE_HLS_CONFIG = {
  workerPath: '/vendor/hls.worker.js',
  liveSyncDuration: 4,
  liveMaxLatencyDuration: Infinity,
  backBufferLength: 30,
}
const FROM_START_HLS_CONFIG = {
  ...LIVE_HLS_CONFIG,
  startPosition: 0,
  backBufferLength: 90,
}
const FROM_START_HEARTBEAT_MS = 15_000
const FROM_START_PLAYER = `from-start-${crypto.randomUUID?.() ?? String(Math.random()).slice(2)}`
const LIVE_START_CHECK_MS = 100
const LIVE_POLL_PLAYING_MS = 10_000

const LIVE_SEEK_EPSILON_S = 0.5
const HAVE_METADATA = 1
const HAVE_CURRENT_DATA = 2

const NATIVE_CONTROL_BAR_PX = 48

export const setLiveVideo = (el) => { liveVideo = el }
