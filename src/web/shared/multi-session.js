import { reactive, ref, watch } from '/vendor/vue.esm-browser.prod.js'
import {
  initialMultiView,
  tapSound,
  swapPictures,
  makeMain,
  setLayout,
  slotOf,
  isMutedIn,
  otherPictureOf,
} from '/multi-view.js'
import { EMPTY_TUNER_STATUS } from '/tuner-status.js'
import { api, csrfToken } from '/shared/api.js'
import {
  liveVideo,
  liveStopHooks,
  adoptLiveSession,
  retuneLive,
  liveReasonText,
} from '/shared/live-session.js'
import { live } from '/shared/player-shared.js'

const emptySecondary = () => ({
  channel: null, sessionId: null, playlist: '', bufferSeconds: 0, captions: false, phase: 'idle', message: '',
})

export const multi = reactive({
  active: false,
  view: initialMultiView(),
  secondary: emptySecondary(),
  insetBox: null,
  tunerStatus: EMPTY_TUNER_STATUS,
  tunerLoaded: false,
})

export const portraitPhone = ref(false)

const portraitPhoneQuery = window.matchMedia?.('(max-width: 767px) and (orientation: portrait)')
portraitPhone.value = Boolean(portraitPhoneQuery?.matches)
portraitPhoneQuery?.addEventListener?.('change', (e) => { portraitPhone.value = e.matches })

export let companionVideo = null
let companionHls = null
let companionRun = 0
let companionPollTimer = null
let companionAttached = false
let tunerTimer = null
let tunerWatchers = 0

export const setCompanionVideo = (el) => { companionVideo = el }

export const slotClassOf = (picture) => (multi.active
  ? `mv-slot-${slotOf({ state: multi.view, picture, portraitPhone: portraitPhone.value })}`
  : '')

export const watchAlongside = (channel) => {
  if (multi.active) return changeSecondary(channel)
  Object.assign(multi, { active: true, view: initialMultiView(), insetBox: null })
  startCompanion(channel)
}

export const tapPictureSound = (picture) => { multi.view = tapSound(multi.view, picture) }

export const swapMultiPictures = () => { multi.view = swapPictures(multi.view) }

export const makeMainPicture = (picture) => { multi.view = makeMain(multi.view, picture) }

export const setMultiLayout = (layout) => { multi.view = setLayout(multi.view, layout) }

export const setInsetCorner = (corner) => { multi.view = { ...multi.view, insetCorner: corner } }

export const changePictureChannel = ({ picture, channel }) => {
  if (picture === 'secondary') return changeSecondary(channel)
  retuneLive({ channel, nowTitle: '' })
}

export const stopWatchingPicture = (picture) => {
  if (picture === 'secondary') {
    stopCompanion()
    return exitMulti()
  }
  const { channel, sessionId, playlist, bufferSeconds, captions } = multi.secondary
  if (!sessionId) {
    stopCompanion()
    return exitMulti()
  }
  releaseCompanionVideo()
  multi.secondary = emptySecondary()
  exitMulti()
  adoptLiveSession({ channel, session: { id: sessionId, playlist, bufferSeconds, captions } })
}

export const fullScreenPicture = (picture) => stopWatchingPicture(otherPictureOf(picture))

export const toggleSecondaryPause = () => {
  if (!companionVideo || !companionAttached) return
  if (companionVideo.paused) companionVideo.play()?.catch(() => {})
  else companionVideo.pause()
}

export const loadTunerStatus = async () => {
  try {
    multi.tunerStatus = { ...EMPTY_TUNER_STATUS, ...(await api('GET', '/api/live/tuner-status')) }
  } catch {
    multi.tunerStatus = EMPTY_TUNER_STATUS
  }
  multi.tunerLoaded = true
}

export const watchTunerStatus = () => {
  tunerWatchers += 1
  if (tunerWatchers === 1) pollTunerStatus()
  return () => {
    tunerWatchers = Math.max(0, tunerWatchers - 1)
    if (!tunerWatchers) clearTimeout(tunerTimer)
  }
}

const pollTunerStatus = async () => {
  clearTimeout(tunerTimer)
  await loadTunerStatus()
  if (tunerWatchers) tunerTimer = setTimeout(pollTunerStatus, TUNER_POLL_MS)
}

const exitMulti = () => {
  multi.active = false
  multi.insetBox = null
  multi.view = initialMultiView()
  if (liveVideo) liveVideo.muted = false
}

const changeSecondary = (channel) => {
  stopCompanion()
  startCompanion(channel)
}

const startCompanion = async (channel) => {
  const run = ++companionRun
  multi.secondary = { ...emptySecondary(), channel, phase: 'tuning' }
  applyMuting()
  try {
    const r = await api('POST', '/api/live', { channel_id: channel.id })
    if (run !== companionRun) {
      api('DELETE', `/api/live/${r.session.id}`).catch(() => {})
      return
    }
    Object.assign(multi.secondary, {
      sessionId: r.session.id,
      playlist: r.session.playlist,
      bufferSeconds: r.session.bufferSeconds || 0,
      captions: Boolean(r.session.captions),
    })
    if (r.session.status === 'ended') return endCompanion(run, liveReasonText(r.session.reason))
    if (r.session.status === 'live') await attachCompanion(run, r.session.playlist)
    pollCompanion(run)
  } catch (err) {
    if (run !== companionRun) return
    multi.secondary.phase = 'ended'
    multi.secondary.message = companionErrorText(err)
  }
}

const pollCompanion = async (run) => {
  if (run !== companionRun) return
  try {
    const params = new URLSearchParams({ channel: multi.secondary.channel.id, session: multi.secondary.sessionId })
    const r = await api('GET', `/api/live/preflight?${params}`)
    if (run !== companionRun) return
    const session = r.session
    if (!session || session.id !== multi.secondary.sessionId || session.status === 'ended') {
      return endCompanion(run, liveReasonText(session?.reason))
    }
    if (session.status === 'live' && !companionAttached) await attachCompanion(run, session.playlist)
  } catch {
    if (run !== companionRun) return
  }
  companionPollTimer = setTimeout(() => pollCompanion(run), companionAttached ? POLL_PLAYING_MS : POLL_TUNING_MS)
}

const attachCompanion = async (run, playlist) => {
  if (!companionVideo) return
  companionAttached = true
  applyMuting()
  const nativeOnly = !('MediaSource' in window) && companionVideo.canPlayType('application/vnd.apple.mpegurl') !== ''
  if (nativeOnly) {
    companionVideo.addEventListener('loadedmetadata', () => markCompanionLive(run), { once: true })
    companionVideo.src = playlist
    companionVideo.play()?.catch(() => {})
    return
  }
  const { default: Hls } = await import('/vendor/hls.mjs')
  if (run !== companionRun) return
  if (!Hls.isSupported()) return endCompanion(run, 'This browser cannot play live TV.')
  companionHls = new Hls(COMPANION_HLS_CONFIG)
  let recovered = false
  companionHls.on(Hls.Events.ERROR, (event, data) => {
    if (!data.fatal || run !== companionRun) return
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) {
      recovered = true
      return companionHls.recoverMediaError()
    }
    endCompanion(run, `Playback failed: ${data.details}`)
  })
  companionHls.once(Hls.Events.FRAG_BUFFERED, () => markCompanionLive(run))
  companionHls.loadSource(playlist)
  companionHls.attachMedia(companionVideo)
  companionVideo.play()?.catch(() => {})
}

const markCompanionLive = (run) => {
  if (run !== companionRun || multi.secondary.phase === 'ended') return
  multi.secondary.phase = 'live'
  companionVideo?.play()?.catch(() => {})
}

const endCompanion = (run, message) => {
  if (run !== companionRun) return
  clearTimeout(companionPollTimer)
  detachCompanionVideo()
  if (multi.secondary.sessionId) api('DELETE', `/api/live/${multi.secondary.sessionId}`).catch(() => {})
  multi.secondary.sessionId = null
  multi.secondary.phase = 'ended'
  multi.secondary.message = message
}

const stopCompanion = () => {
  companionRun += 1
  clearTimeout(companionPollTimer)
  detachCompanionVideo()
  if (multi.secondary.sessionId) api('DELETE', `/api/live/${multi.secondary.sessionId}`).catch(() => {})
  multi.secondary = emptySecondary()
}

const releaseCompanionVideo = () => {
  companionRun += 1
  clearTimeout(companionPollTimer)
  detachCompanionVideo()
}

const detachCompanionVideo = () => {
  companionHls?.destroy()
  companionHls = null
  companionAttached = false
  if (!companionVideo) return
  companionVideo.pause()
  companionVideo.removeAttribute('src')
  companionVideo.load()
}

const applyMuting = () => {
  if (!multi.active) return
  if (liveVideo) liveVideo.muted = isMutedIn({ audible: multi.view.audible, picture: 'primary' })
  if (companionVideo) companionVideo.muted = isMutedIn({ audible: multi.view.audible, picture: 'secondary' })
}

watch(() => [multi.active, multi.view.audible], applyMuting)

const companionErrorText = (err) => {
  if (err.code === 'stream-limit') {
    const limit = err.data?.limit
    return limit === 1 ? 'This NAS is already playing 1 stream.' : `This NAS is already playing ${limit || 'all its'} streams.`
  }
  if (err.code === 'no-tuner') return 'No free tuner. Every tuner is busy on another multiplex.'
  if (err.code === 'off-air') return err.message
  return `Error: ${err.message}`
}

liveStopHooks.add(() => {
  stopCompanion()
  exitMulti()
})

window.addEventListener('pagehide', (event) => {
  const sessionId = multi.secondary.sessionId
  if (!sessionId) return
  fetch(`/api/live/${sessionId}${event.persisted ? '/hold' : ''}`, {
    method: event.persisted ? 'POST' : 'DELETE',
    keepalive: true,
    headers: { 'x-csrf-token': csrfToken || '' },
  }).catch(() => {})
})

export const isMultiActive = () => multi.active && live.open

const COMPANION_HLS_CONFIG = {
  workerPath: '/vendor/hls.worker.js',
  liveSyncDuration: 4,
  liveMaxLatencyDuration: Infinity,
  backBufferLength: 10,
}
const POLL_TUNING_MS = 1_000
const POLL_PLAYING_MS = 10_000
const TUNER_POLL_MS = 5_000
