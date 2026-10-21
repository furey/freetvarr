import { reactive, ref, computed, watch } from '/vendor/vue.esm-browser.prod.js'
import { PHONE_LAYOUT_QUERY } from '/shared/constants.js'
import {
  initialMultiView,
  tapSound,
  swapPictures,
  makeMain,
  setLayout,
  slotOf,
  isMutedIn,
  addPicture,
  removePicture,
  promoteIntoPrimary,
  soundAfterStop,
  canAddPictureOf,
  nextPictureOf,
  COMPANIONS,
  PICTURES,
} from '/multi-view.js'
import { EMPTY_TUNER_STATUS } from '/tuner-status.js'
import { SIZES_KEY, parseSizes, sizesAfterSet } from '/multi-resize.js'
import { keyPictureOf } from '/multi-picture.js'
import { steadyLiveWindowOf, videoLiveInputOf } from '/live-edge.js'
import { api, csrfToken } from '/shared/api.js'
import { addAttentionSource } from '/shared/attention-session.js'
import {
  liveVideo,
  liveStopHooks,
  adoptLiveSession,
  retuneLive,
  liveReasonText,
  toggleLivePause,
} from '/shared/live-session.js'
import { live, playerMuted, captionTracksOf } from '/shared/player-shared.js'
import { captionsShowing } from '/live-captions.js'

const emptyCompanion = () => ({
  channel: null, sessionId: null, playlist: '', bufferSeconds: 0, captions: false, phase: 'idle', message: '',
  paused: false, behindSeconds: 0, bufferFrom: null, bufferTo: null, position: 0,
})

const emptyCompanions = () => Object.fromEntries(COMPANIONS.map((id) => [id, emptyCompanion()]))

export const multi = reactive({
  active: false,
  view: initialMultiView(),
  companions: emptyCompanions(),
  insetBox: null,
  resizeFrom: null,
  boxes: {},
  tunerStatus: EMPTY_TUNER_STATUS,
  tunerLoaded: false,
})

export const portraitPhone = ref(false)

const readSizes = () => {
  try {
    return parseSizes(localStorage.getItem(SIZES_KEY))
  } catch {
    return {}
  }
}

const saveSizes = (sizes) => {
  try { localStorage.setItem(SIZES_KEY, JSON.stringify(sizes)) } catch {}
}

export const multiSizes = ref(readSizes())

export const setMultiSize = (key, share) => {
  multiSizes.value = sizesAfterSet({ sizes: multiSizes.value, key, share })
  saveSizes(multiSizes.value)
}

export const resetMultiSize = (key) => setMultiSize(key, null)

export const compactScreen = ref(false)

const watchQuery = (query, target) => {
  const list = window.matchMedia?.(query)
  target.value = Boolean(list?.matches)
  list?.addEventListener?.('change', (e) => { target.value = e.matches })
}

watchQuery('(max-width: 767px) and (orientation: portrait)', portraitPhone)
watchQuery(PHONE_LAYOUT_QUERY, compactScreen)

export const canAddPicture = computed(() => canAddPictureOf({
  count: multi.view.order.length,
  compact: compactScreen.value,
  streams: multi.tunerStatus.streams,
}))

const rigs = Object.fromEntries(COMPANIONS.map((id) => [id, {
  video: null, hls: null, edgeAnchor: null, run: 0, pollTimer: null, attached: false, track: () => trackCompanion(id),
}]))

export const setCompanionVideo = (id, el) => {
  const rig = rigs[id]
  if (!rig || rig.video === el) return
  for (const type of COMPANION_TRACK_EVENTS) rig.video?.removeEventListener(type, rig.track)
  rig.video = el
  for (const type of COMPANION_TRACK_EVENTS) rig.video?.addEventListener(type, rig.track)
  if (el) applyMuting()
}

export const trackCompanions = () => {
  for (const id of companionsShown()) trackCompanion(id)
}

export const trackCompanion = (id) => {
  const rig = rigs[id]
  const state = multi.companions[id]
  const video = rig.video
  const ready = rig.attached && video?.readyState >= HAVE_CURRENT_DATA
  if (!ready) rig.edgeAnchor = null
  const edge = ready ? companionWindow(id) : null
  Object.assign(state, {
    paused: Boolean(ready && video.paused && state.phase === 'live'),
    behindSeconds: edge ? edge.behind : 0,
    bufferTo: edge ? edge.target : null,
    bufferFrom: edge ? edge.floor : null,
    position: ready ? video.currentTime : 0,
  })
}

const companionWindow = (id) => {
  const rig = rigs[id]
  const steady = steadyLiveWindowOf({
    ...videoLiveInputOf(rig.video),
    hlsSyncPosition: rig.hls?.liveSyncPosition ?? null,
    hlsOldestSecond: rig.hls?.latestLevelDetails?.fragments?.[0]?.start ?? null,
    bufferSeconds: multi.companions[id].bufferSeconds,
    anchor: rig.edgeAnchor,
    wallS: performance.now() / 1000,
  })
  rig.edgeAnchor = steady.anchor
  return steady
}

export const seekCompanionTo = (id, second) => {
  const rig = rigs[id]
  const { bufferFrom, bufferTo } = multi.companions[id]
  if (!rig.attached || bufferFrom == null || bufferTo == null) return false
  rig.video.currentTime = Math.max(bufferFrom, Math.min(bufferTo, second))
  trackCompanion(id)
  return true
}

export const goLiveCompanion = (id) => {
  const rig = rigs[id]
  if (!rig.attached) return
  const { bufferTo } = multi.companions[id]
  if (bufferTo != null) rig.video.currentTime = bufferTo
  rig.video.play()?.catch(() => {})
  trackCompanion(id)
}

export const startCompanionOver = (id) => {
  if (seekCompanionTo(id, multi.companions[id].bufferFrom ?? 0)) rigs[id].video.play()?.catch(() => {})
}

export const togglePicturePause = (picture) => (picture === 'primary' ? toggleLivePause() : toggleCompanionPause(picture))

export const toggleKeyPicturePause = () => togglePicturePause(keyPictureOf(multi.view))

export const toggleKeyPictureSound = () => tapPictureSound(keyPictureOf(multi.view))

export const slotClassOf = (picture) => (multi.active
  ? `mv-slot-${slotOf({ state: multi.view, picture, portraitPhone: portraitPhone.value })}`
  : '')

export const slotStyleOf = (picture) => {
  const box = multi.active ? multi.boxes[picture] : null
  if (!box) return null
  const from = multi.resizeFrom?.boxes?.[picture] ?? box
  return {
    '--mv-x': `${box.left}px`,
    '--mv-y': `${box.top}px`,
    '--mv-w': `${from.width}px`,
    '--mv-h': `${from.height}px`,
    '--mv-s': String(scaleBetween(from, box)),
  }
}

export const insetStyleOf = () => {
  const box = multi.active ? multi.insetBox : null
  if (!box) return null
  const from = multi.resizeFrom?.inset ?? box
  return {
    '--mv-inset-left': `${box.left}px`,
    '--mv-inset-top': `${box.top}px`,
    '--mv-inset-w': `${from.width}px`,
    '--mv-inset-h': `${from.height}px`,
    '--mv-inset-s': String(scaleBetween(from, box)),
  }
}

const scaleBetween = (from, to) => (from.width ? to.width / from.width : 1)

export const companionsShown = () => multi.view.order.filter((id) => id !== 'primary')

export const pictureStateOf = (picture) => (picture === 'primary' ? live : multi.companions[picture])

export const watchAlongside = (channel) => {
  if (multi.active) return addPictureChannel(channel)
  Object.assign(multi, { active: true, view: initialMultiView({ muted: playerMuted.value }), insetBox: null, boxes: {} })
  startCompanion('secondary', channel)
}

export const addPictureChannel = (channel) => {
  const picture = nextPictureOf(multi.view.order)
  if (!picture || !canAddPicture.value) return changeCompanion('secondary', channel)
  multi.view = addPicture(multi.view)
  startCompanion(picture, channel)
}

export const tapPictureSound = (picture) => { multi.view = tapSound(multi.view, picture) }

export const swapMultiPictures = () => { multi.view = swapPictures(multi.view) }

export const makeMainPicture = (picture) => { multi.view = makeMain(multi.view, picture) }

export const setMultiLayout = (layout) => { multi.view = setLayout(multi.view, layout) }

export const setInsetCorner = (corner) => { multi.view = { ...multi.view, insetCorner: corner } }

export const changePictureChannel = ({ picture, channel }) => {
  if (picture !== 'primary') return changeCompanion(picture, channel)
  retuneLive({ channel, nowTitle: '' })
}

export const stopWatchingPicture = (picture) => {
  if (multi.view.order.length > 2) return removeOneOfMany(picture)
  if (picture !== 'primary' || !multi.companions[companionsShown()[0]]?.sessionId) {
    for (const id of companionsShown()) stopCompanion(id)
    return exitMultiKeepingSound('primary')
  }
  const survivor = companionsShown()[0]
  const { channel, sessionId, playlist, bufferSeconds, captions } = multi.companions[survivor]
  releaseCompanionVideo(survivor)
  multi.companions[survivor] = emptyCompanion()
  exitMultiKeepingSound(survivor)
  adoptLiveSession({ channel, session: { id: sessionId, playlist, bufferSeconds, captions } })
}

export const fullScreenPicture = (picture) => {
  for (const id of companionsShown().filter((id) => id !== picture)) {
    if (multi.view.order.length > 2) removeOneOfMany(id)
  }
  const other = multi.view.order.find((id) => id !== picture)
  if (other) stopWatchingPicture(other)
}

export const toggleCompanionPause = (id) => {
  const rig = rigs[id]
  if (!rig?.video || !rig.attached) return
  if (rig.video.paused) rig.video.play()?.catch(() => {})
  else rig.video.pause()
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

export const applySingleMuting = () => {
  if (liveVideo) liveVideo.muted = playerMuted.value
}

export const togglePlayerMuted = () => {
  if (!multi.active) playerMuted.value = !playerMuted.value
}

export const isMultiActive = () => multi.active && live.open

let tunerTimer = null
let tunerWatchers = 0

const removeOneOfMany = (picture) => {
  if (picture !== 'primary') {
    stopCompanion(picture)
    multi.view = removePicture(multi.view, picture)
    return
  }
  const survivor = companionsShown().find((id) => multi.companions[id].sessionId) ?? companionsShown()[0]
  const { channel, sessionId, playlist, bufferSeconds, captions } = multi.companions[survivor]
  releaseCompanionVideo(survivor)
  multi.companions[survivor] = emptyCompanion()
  multi.view = promoteIntoPrimary(multi.view, survivor)
  if (sessionId) return adoptLiveSession({ channel, session: { id: sessionId, playlist, bufferSeconds, captions } })
  retuneLive({ channel, nowTitle: '' })
}

const pollTunerStatus = async () => {
  clearTimeout(tunerTimer)
  await loadTunerStatus()
  if (tunerWatchers) tunerTimer = setTimeout(pollTunerStatus, TUNER_POLL_MS)
}

const exitMulti = () => {
  multi.active = false
  multi.insetBox = null
  multi.boxes = {}
  multi.view = initialMultiView()
  applySingleMuting()
}

const exitMultiKeepingSound = (survivor) => {
  playerMuted.value = isMutedIn({ audible: multi.view.audible, picture: survivor })
  exitMulti()
}

const changeCompanion = (id, channel) => {
  stopCompanion(id)
  startCompanion(id, channel)
}

const startCompanion = async (id, channel) => {
  const rig = rigs[id]
  const run = ++rig.run
  multi.companions[id] = { ...emptyCompanion(), channel, phase: 'tuning' }
  applyMuting()
  try {
    const r = await api('POST', '/api/live', { channel_id: channel.id, picture_rank: PICTURES.indexOf(id) })
    if (run !== rig.run) {
      api('DELETE', `/api/live/${r.session.id}`).catch(() => {})
      return
    }
    Object.assign(multi.companions[id], {
      sessionId: r.session.id,
      playlist: r.session.playlist,
      bufferSeconds: r.session.bufferSeconds || 0,
      captions: Boolean(r.session.captions),
    })
    if (r.session.status === 'ended') return endCompanion(id, run, liveReasonText(r.session.reason))
    if (r.session.status === 'live') await attachCompanion(id, run, r.session.playlist)
    pollCompanion(id, run)
  } catch (err) {
    if (run !== rig.run) return
    multi.companions[id].phase = 'ended'
    multi.companions[id].message = companionErrorText(err)
  }
}

const pollCompanion = async (id, run) => {
  const rig = rigs[id]
  if (run !== rig.run) return
  const state = multi.companions[id]
  try {
    const params = new URLSearchParams({ channel: state.channel.id, session: state.sessionId })
    const r = await api('GET', `/api/live/preflight?${params}`)
    if (run !== rig.run) return
    const session = r.session
    if (!session || session.id !== state.sessionId || session.status === 'ended') {
      return endCompanion(id, run, liveReasonText(session?.reason))
    }
    if (session.status === 'live' && !rig.attached) await attachCompanion(id, run, session.playlist)
  } catch {
    if (run !== rig.run) return
  }
  rig.pollTimer = setTimeout(() => pollCompanion(id, run), rig.attached ? POLL_PLAYING_MS : POLL_TUNING_MS)
}

const attachCompanion = async (id, run, playlist) => {
  const rig = rigs[id]
  if (!rig.video) return
  rig.attached = true
  applyMuting()
  const video = rig.video
  const nativeOnly = !('MediaSource' in window) && video.canPlayType('application/vnd.apple.mpegurl') !== ''
  if (nativeOnly) {
    video.addEventListener('loadedmetadata', () => markCompanionLive(id, run), { once: true })
    video.src = playlist
    video.play()?.catch(() => {})
    return
  }
  const { default: Hls } = await import('/vendor/hls.mjs')
  if (run !== rig.run) return
  if (!Hls.isSupported()) return endCompanion(id, run, 'This browser cannot play live TV.')
  const hls = new Hls(COMPANION_HLS_CONFIG)
  rig.hls = hls
  let recovered = false
  hls.on(Hls.Events.ERROR, (event, data) => {
    if (!data.fatal || run !== rig.run) return
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) {
      recovered = true
      return hls.recoverMediaError()
    }
    endCompanion(id, run, `Playback failed: ${data.details}`)
  })
  hls.once(Hls.Events.FRAG_BUFFERED, () => markCompanionLive(id, run))
  hls.loadSource(playlist)
  hls.attachMedia(video)
  video.play()?.catch(() => {})
}

const markCompanionLive = (id, run) => {
  if (run !== rigs[id].run || multi.companions[id].phase === 'ended') return
  multi.companions[id].phase = 'live'
  rigs[id].video?.play()?.catch(() => {})
}

const endCompanion = (id, run, message) => {
  const rig = rigs[id]
  if (run !== rig.run) return
  clearTimeout(rig.pollTimer)
  detachCompanionVideo(id)
  const state = multi.companions[id]
  if (state.sessionId) api('DELETE', `/api/live/${state.sessionId}`).catch(() => {})
  state.sessionId = null
  state.phase = 'ended'
  state.message = message
  moveSoundFrom(id)
}

const moveSoundFrom = (stopped) => {
  if (!multi.active) return
  const ended = PICTURES.filter((p) => pictureStateOf(p)?.phase === 'ended')
  multi.view = { ...multi.view, audible: soundAfterStop({ audible: multi.view.audible, stopped, order: multi.view.order, ended }) }
}

const stopCompanion = (id) => {
  const rig = rigs[id]
  rig.run += 1
  clearTimeout(rig.pollTimer)
  detachCompanionVideo(id)
  const state = multi.companions[id]
  if (state.sessionId) api('DELETE', `/api/live/${state.sessionId}`).catch(() => {})
  multi.companions[id] = emptyCompanion()
}

const releaseCompanionVideo = (id) => {
  const rig = rigs[id]
  rig.run += 1
  clearTimeout(rig.pollTimer)
  detachCompanionVideo(id)
}

const detachCompanionVideo = (id) => {
  const rig = rigs[id]
  rig.hls?.destroy()
  rig.hls = null
  rig.attached = false
  rig.edgeAnchor = null
  if (!rig.video) return
  rig.video.pause()
  rig.video.removeAttribute('src')
  rig.video.load()
}

const applyMuting = () => {
  if (!multi.active) return
  if (liveVideo) liveVideo.muted = isMutedIn({ audible: multi.view.audible, picture: 'primary' })
  for (const id of COMPANIONS) {
    if (rigs[id].video) rigs[id].video.muted = isMutedIn({ audible: multi.view.audible, picture: id })
  }
}

watch(() => [multi.active, multi.view.audible], applyMuting)

addAttentionSource(() => COMPANIONS.map((id) => ({
  kind: 'live',
  sessionId: multi.companions[id].sessionId,
  video: rigs[id].video,
  captions: captionsShowing(captionTracksOf(rigs[id].video)),
})))

watch(playerMuted, () => {
  if (!multi.active) applySingleMuting()
})

watch(() => live.phase, (phase) => {
  if (multi.active && phase === 'ended') moveSoundFrom('primary')
})

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
  for (const id of COMPANIONS) stopCompanion(id)
  exitMulti()
})

window.addEventListener('pagehide', (event) => {
  for (const id of COMPANIONS) {
    const sessionId = multi.companions[id].sessionId
    if (!sessionId) continue
    fetch(`/api/live/${sessionId}${event.persisted ? '/hold' : ''}`, {
      method: event.persisted ? 'POST' : 'DELETE',
      keepalive: true,
      headers: { 'x-csrf-token': csrfToken || '' },
    }).catch(() => {})
  }
})

const COMPANION_HLS_CONFIG = {
  workerPath: '/vendor/hls.worker.js',
  liveSyncDuration: 4,
  liveMaxLatencyDuration: Infinity,
  backBufferLength: 10,
}
const COMPANION_TRACK_EVENTS = ['play', 'pause', 'playing', 'seeked', 'timeupdate', 'waiting', 'loadeddata']
const HAVE_CURRENT_DATA = 2
const POLL_TUNING_MS = 1_000
const POLL_PLAYING_MS = 10_000
const TUNER_POLL_MS = 5_000
