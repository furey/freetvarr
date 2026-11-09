import { ref } from '/vendor/vue.esm-browser.prod.js'
import { applyResolvedArt, loadArtworkStamps } from '/shared/artwork-stamps.js'

export const ART_STREAM_PATH = '/api/activity/stream'
export const RECONNECT_DELAYS_MS = [1000, 3000, 10_000, 30_000]

export const artStreamConnected = ref(false)
export const artStreamResets = ref(0)

export const createArtStream = ({
  eventSourceOf = () => globalThis.EventSource,
  doc = globalThis.document,
  onArt = applyResolvedArt,
  onReset = catchUp,
  connected = artStreamConnected,
  setTimer = (run, ms) => setTimeout(run, ms),
  clearTimer = (timer) => clearTimeout(timer),
  reconnectDelaysMs = RECONNECT_DELAYS_MS,
} = {}) => {
  const jobListeners = new Set()
  let source = null
  let cursor = null
  let retryTimer = null
  let failures = 0
  let running = false

  const start = () => {
    if (running) return
    running = true
    doc?.addEventListener('visibilitychange', onVisibility)
    open()
  }

  const stop = () => {
    running = false
    doc?.removeEventListener('visibilitychange', onVisibility)
    cancelReconnect()
    drop()
  }

  const onJobs = (listener) => {
    jobListeners.add(listener)
    if (jobListeners.size === 1) reopen()
    return () => {
      jobListeners.delete(listener)
      if (!jobListeners.size) reopen()
    }
  }

  const open = () => {
    const EventSourceImpl = eventSourceOf()
    if (!running || source || !isVisible() || typeof EventSourceImpl !== 'function') return
    cancelReconnect()
    const opened = new EventSourceImpl(urlOf())
    source = opened
    opened.addEventListener('open', () => {
      if (source === opened) connected.value = true
    })
    opened.addEventListener('art', (event) => { if (source === opened) receiveArt(event) })
    opened.addEventListener('jobs', (event) => { if (source === opened) receiveJobs(event) })
    opened.onerror = () => {
      if (source !== opened) return
      drop()
      reconnectLater()
    }
  }

  const receiveArt = (event) => {
    const batch = parsedOf(event.data)
    if (!batch) return
    const firstBatch = cursor == null
    cursor = batch.cursor ?? cursor
    failures = 0
    connected.value = true
    if (batch.stamps?.length) onArt(batch.stamps)
    if (batch.reset || firstBatch) onReset({ reload: Boolean(batch.reset) })
  }

  const receiveJobs = (event) => {
    const jobs = parsedOf(event.data)
    if (jobs) jobListeners.forEach((listener) => listener(jobs))
  }

  const urlOf = () => {
    const params = new URLSearchParams({ topics: jobListeners.size ? 'art,jobs' : 'art' })
    if (cursor) params.set('since', cursor)
    return `${ART_STREAM_PATH}?${params}`
  }

  const reopen = () => {
    if (!source) return
    drop()
    open()
  }

  const drop = () => {
    source?.close()
    source = null
    connected.value = false
  }

  const reconnectLater = () => {
    if (!running || retryTimer) return
    const delay = reconnectDelaysMs[Math.min(failures, reconnectDelaysMs.length - 1)]
    failures += 1
    retryTimer = setTimer(() => {
      retryTimer = null
      open()
    }, delay)
  }

  const cancelReconnect = () => {
    if (retryTimer) clearTimer(retryTimer)
    retryTimer = null
  }

  const onVisibility = () => {
    if (isVisible()) {
      failures = 0
      open()
      return
    }
    cancelReconnect()
    drop()
  }

  const isVisible = () => doc?.visibilityState !== 'hidden'

  return { start, stop, onJobs, cursorOf: () => cursor }
}

const catchUp = ({ reload }) => {
  if (reload) loadArtworkStamps().catch(() => {})
  artStreamResets.value += 1
}

const parsedOf = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export const artStream = createArtStream()
