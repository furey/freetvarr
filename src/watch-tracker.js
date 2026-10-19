import {
  EMPTY_PROGRESS,
  liveWatchEndsOf,
  positionProgressOf,
  programmeAt,
  programmeFieldsOf,
  resetPositionAnchor,
  watchedSecondsOf,
} from './user-events.js'

export const createWatchTracker = ({
  log,
  programmesFor = async () => [],
  recordingFor = async () => null,
  now = Date.now,
  graceMs = 15_000,
  warn = (message) => console.warn(`[events] ${message}`),
}) => {
  const viewings = new Map()
  const tasks = new Set()

  const track = (work) => {
    const task = Promise.resolve()
      .then(work)
      .catch((err) => warn(`watch tracking failed: ${err.message}`))
      .finally(() => tasks.delete(task))
    tasks.add(task)
    return task
  }

  const liveStarted = (session) => track(async () => {
    const programmes = await programmesFor({ channelId: session.channelId, fromMs: session.startedAt, toMs: session.startedAt + 1 })
    const programme = programmeAt({ programmes, atMs: session.startedAt })
    log({
      kind: 'watch_start',
      ts: session.startedAt,
      channel_id: session.channelId,
      ...programmeFieldsOf(programme),
      position_s: programme ? (session.startedAt - programme.start) / 1000 : null,
      source: 'live',
      meta: { session_id: session.id },
    })
  })

  const liveEnded = (session, reason) => {
    const endedAt = endTimeOf({ session, reason, nowMs: now() })
    return track(async () => {
      const programmes = await programmesFor({ channelId: session.channelId, fromMs: session.startedAt, toMs: endedAt })
      liveWatchEndsOf({
        channelId: session.channelId,
        startedAt: session.startedAt,
        endedAt,
        programmes,
        meta: { session_id: session.id, reason: reason?.code ?? null },
      }).forEach(log)
    })
  }

  const playStarted = (session) => {
    const existing = viewings.get(session.recordingId)
    if (existing) {
      clearTimeout(existing.closeTimer)
      existing.activeSince = session.startedAt
      existing.progress = resetPositionAnchor(existing.progress)
      return Promise.resolve()
    }
    const viewing = {
      recordingId: session.recordingId,
      activeSince: session.startedAt,
      endedAt: session.startedAt,
      wallMs: 0,
      progress: EMPTY_PROGRESS,
      duration: session.duration ?? null,
      startOffset: session.offset ?? 0,
      source: session.inProgress ? 'in_progress' : 'recording',
      closeTimer: null,
    }
    viewings.set(session.recordingId, viewing)
    return track(async () => {
      const row = await recordingFor(session.recordingId)
      log({
        kind: 'watch_start',
        ts: session.startedAt,
        ...recordingFieldsOf({ row, viewing }),
        position_s: viewing.startOffset,
        source: viewing.source,
      })
    })
  }

  const positionSaved = ({ recordingId, seconds }) => {
    const viewing = viewings.get(recordingId)
    if (!viewing) return
    viewing.progress = positionProgressOf({ progress: viewing.progress, seconds, atMs: now() })
  }

  const playEnded = (session, reason) => {
    const viewing = viewings.get(session.recordingId)
    if (!viewing || viewing.activeSince == null) return
    pauseViewing({ viewing, endedAt: endTimeOf({ session, reason, nowMs: now() }) })
    viewing.closeTimer = setTimeout(() => close(session.recordingId), graceMs)
    viewing.closeTimer.unref?.()
  }

  const close = (recordingId) => {
    const viewing = viewings.get(recordingId)
    if (!viewing) return Promise.resolve()
    clearTimeout(viewing.closeTimer)
    viewings.delete(recordingId)
    if (viewing.activeSince != null) pauseViewing({ viewing, endedAt: now() })
    return track(async () => {
      const row = await recordingFor(recordingId)
      const fields = recordingFieldsOf({ row, viewing })
      log({
        kind: 'watch_end',
        ts: viewing.endedAt,
        ...fields,
        duration_s: watchedSecondsOf({ progress: viewing.progress, wallMs: viewing.wallMs, lengthSeconds: fields.programme_len_s }),
        position_s: viewing.progress.lastSeconds ?? row?.playback_position_s ?? null,
        source: viewing.source,
        meta: { watched: Boolean(row?.watched_at), resumed_from: viewing.startOffset },
      })
    })
  }

  const settle = async () => {
    await Promise.all([...viewings.keys()].map(close))
    await Promise.all([...tasks])
  }

  return { liveStarted, liveEnded, playStarted, playEnded, positionSaved, settle, openViewings: () => viewings.size }
}

const pauseViewing = ({ viewing, endedAt }) => {
  viewing.wallMs += Math.max(0, endedAt - viewing.activeSince)
  viewing.endedAt = endedAt
  viewing.activeSince = null
}

const endTimeOf = ({ session, reason, nowMs }) =>
  (reason?.code === 'idle' && session.lastSeenAt ? Math.min(nowMs, session.lastSeenAt) : nowMs)

const recordingFieldsOf = ({ row, viewing }) => ({
  recording_id: viewing.recordingId,
  title: row?.title ?? null,
  programme_start: row?.aired_at ?? null,
  channel_id: row?.channel_id ?? null,
  programme_len_s: row?.duration_s ?? viewing.duration,
})
