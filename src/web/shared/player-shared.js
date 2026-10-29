import { ref, reactive, watch, onMounted, onUnmounted } from '/vendor/vue.esm-browser.prod.js'
import { zoneOf, skipLabel, skipSpoken } from '/double-tap.js'
import { LIVE_CAPTIONS_KEY } from '/shared/constants.js'
import { storedFlag, browserStorage } from '/shared/storage.js'
import { loadPlayerMuted, savePlayerMuted } from '/player-mute.js'
import { PAGE_RESYNC_EVENTS } from '/player-paused.js'
import { initialRotateState, rotateStepOf, fullscreenExitedState, isPhoneScreen } from '/rotate-fullscreen.js'

export const live = reactive({
  open: false,
  channel: null,
  nowTitle: '',
  sessionId: null,
  phase: 'idle',
  message: '',
  holders: [],
  conflict: null,
  tuningStartedAt: 0,
  behindSeconds: 0,
  bufferSeconds: 0,
  bufferFrom: null,
  bufferTo: null,
  position: 0,
  scrubbing: false,
  scrubValue: 0,
  customControls: false,
  captionsLifted: false,
  skipHint: null,
  captions: false,
  paused: false,
  stuck: false,
  fromStart: null,
})

export const playerMini = ref(false)

export const liveCaptionsOn = storedFlag({ key: LIVE_CAPTIONS_KEY, fallback: false })

export const playerMuted = ref(loadPlayerMuted(browserStorage()))

watch(playerMuted, (muted) => savePlayerMuted(browserStorage(), muted))

export const captionTracksOf = (video) =>
  [...(video?.textTracks || [])].filter((t) => t.kind === 'subtitles' || t.kind === 'captions')

export const isStageFullscreen = ref(false)

document.addEventListener('fullscreenchange', () => { isStageFullscreen.value = Boolean(document.fullscreenElement) })

const shortLandscapeQuery = window.matchMedia?.('(orientation: landscape) and (max-height: 500px)')
const isShortLandscape = ref(Boolean(shortLandscapeQuery?.matches))
export const playerWindowed = ref(false)

shortLandscapeQuery?.addEventListener?.('change', (e) => {
  isShortLandscape.value = e.matches
  playerWindowed.value = false
})

export const playerLayoutOf = ({ canFill }) => {
  const filled = isShortLandscape.value && !playerWindowed.value && canFill
  return { 'is-filled': filled, 'is-windowed': isShortLandscape.value && !filled }
}

export const exitPlayerFullscreen = () => {
  if (document.fullscreenElement) return document.exitFullscreen?.().catch(() => {})
  playerWindowed.value = true
}

export const toggleStageFullscreen = ({ stage, video }) => {
  if (!document.fullscreenElement && isShortLandscape.value && playerWindowed.value) {
    playerWindowed.value = false
    return
  }
  if (document.fullscreenElement) return document.exitFullscreen?.().catch(() => {})
  if (stage?.requestFullscreen) return stage.requestFullscreen().catch(() => {})
  video?.webkitEnterFullscreen?.()
}

export const enterStageFullscreen = ({ stage, video }) => {
  if (document.fullscreenElement || video?.webkitDisplayingFullscreen) return
  if (stage?.requestFullscreen) return stage.requestFullscreen().catch(() => {})
}

export const useRotateToFullscreen = ({ isEligible, enter, getVideo }) => {
  const landscapeQuery = window.matchMedia?.('(orientation: landscape)')
  let state = initialRotateState(landscapeQuery?.matches)
  const isFullscreen = () => Boolean(document.fullscreenElement || getVideo()?.webkitDisplayingFullscreen)
  const isPhone = () => isPhoneScreen({
    coarsePointer: window.matchMedia?.('(pointer: coarse)').matches,
    screenWidth: window.screen?.width ?? window.innerWidth,
    screenHeight: window.screen?.height ?? window.innerHeight,
  })
  const onTurn = () => {
    const step = rotateStepOf(state, {
      landscape: landscapeQuery?.matches,
      eligible: isPhone() && isEligible(),
      fullscreen: isFullscreen(),
      nowMs: Date.now(),
    })
    state = step.state
    if (step.enter) enter()
  }
  const onFullscreenChange = () => {
    if (!isFullscreen()) state = fullscreenExitedState(state, Date.now())
  }
  let video = null
  onMounted(() => {
    video = getVideo()
    landscapeQuery?.addEventListener?.('change', onTurn)
    window.screen?.orientation?.addEventListener?.('change', onTurn)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    video?.addEventListener('webkitendfullscreen', onFullscreenChange)
  })
  onUnmounted(() => {
    landscapeQuery?.removeEventListener?.('change', onTurn)
    window.screen?.orientation?.removeEventListener?.('change', onTurn)
    document.removeEventListener('fullscreenchange', onFullscreenChange)
    video?.removeEventListener('webkitendfullscreen', onFullscreenChange)
  })
}

export const usePausedResync = (resync) => {
  const targetOf = (name) => (name === 'document' ? document : window)
  onMounted(() => {
    for (const { target, type } of PAGE_RESYNC_EVENTS) targetOf(target).addEventListener(type, resync)
  })
  onUnmounted(() => {
    for (const { target, type } of PAGE_RESYNC_EVENTS) targetOf(target).removeEventListener(type, resync)
  })
}

export const finiteOrNull = (seconds) => (Number.isFinite(seconds) ? seconds : null)

export const createSkipHintFlasher = (target) => {
  let timer = null
  return ({ side, seconds }) => {
    target.skipHint = { side, label: skipLabel({ side, seconds }), spoken: skipSpoken({ side, seconds }), key: Date.now() }
    clearTimeout(timer)
    timer = setTimeout(() => { target.skipHint = null }, SKIP_HINT_MS)
  }
}

export const tapZoneOf = ({ video, event, bottomInsetPx }) => {
  const box = video.getBoundingClientRect()
  return zoneOf({
    x: event.clientX - box.left,
    y: event.clientY - box.top,
    width: box.width,
    height: box.height,
    bottomInsetPx,
  })
}

export const isPictureTarget = (el, video) => el === video || Boolean(el?.classList?.contains('player-tap-layer'))

const SKIP_HINT_MS = 1_600

export const FILLED_CAPTION_LINE = 70

export const playback = reactive({
  open: false,
  recording: null,
  sessionId: null,
  offset: 0,
  duration: 0,
  position: 0,
  phase: 'idle',
  message: '',
  resumed: false,
  started: false,
  paused: true,
  stuck: false,
  waiting: false,
  scrubbing: false,
  scrubValue: 0,
  skipHint: null,
  airplay: false,
  adBreaks: [],
  source: '',
  captions: false,
})

export const playbackHooks = { stopPlayback: () => {} }
