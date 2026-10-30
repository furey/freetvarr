export const STUCK_AFTER_MS = 3_000

export const VIDEO_STATE_EVENTS = [
  'play', 'playing', 'pause', 'waiting', 'stalled', 'seeking', 'canplay', 'emptied', 'ended', 'seeked', 'timeupdate', 'webkitendfullscreen',
]

export const PAGE_RESYNC_EVENTS = [
  { target: 'document', type: 'visibilitychange' },
  { target: 'window', type: 'pageshow' },
  { target: 'window', type: 'focus' },
]

export const initialPausedState = { paused: true, stuck: false, buffering: false, lastTime: null, lastMovedAt: 0 }

export const pausedStateAfter = (state, { type, video, nowMs, pageVisible = true }) => {
  const paused = Boolean(video?.paused ?? true)
  const currentTime = video?.currentTime ?? null
  const buffering = bufferingAfter({ state, type, video })
  const moved = paused || buffering || !pageVisible || !hasData(video) || RESTARTING_EVENTS.has(type) || currentTime !== state.lastTime
  const lastMovedAt = moved ? nowMs : state.lastMovedAt
  return {
    paused,
    stuck: !paused && !video?.ended && nowMs - lastMovedAt >= STUCK_AFTER_MS,
    buffering: !paused && buffering,
    lastTime: currentTime,
    lastMovedAt,
  }
}

export const shownPausedOf = (state) => state.paused || state.stuck

const bufferingAfter = ({ state, type, video }) => {
  if (BUFFERING_EVENTS.has(type) || video?.seeking) return true
  if (RESUMED_EVENTS.has(type)) return false
  if (hasData(video) && video.currentTime !== state.lastTime && state.lastTime != null) return false
  return state.buffering || video?.networkState === NETWORK_LOADING && !hasData(video)
}

const hasData = (video) => (video?.readyState ?? 0) >= HAVE_FUTURE_DATA

const RESTARTING_EVENTS = new Set(['play', 'playing', 'seeked', 'canplay'])
const BUFFERING_EVENTS = new Set(['waiting', 'stalled', 'seeking'])
const RESUMED_EVENTS = new Set(['playing', 'canplay'])
const HAVE_FUTURE_DATA = 3
const NETWORK_LOADING = 2
