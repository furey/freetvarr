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
  const attendedSince = new Map()
  const tasks = new Set()

  const track = (work) => {
    const task = Promise.resolve()
      .then(work)
      .catch((err) => warn(`watch tracking failed: ${err.message}`))
      .finally(() => tasks.delete(task))
    tasks.add(task)
    return task
  }

  const logAttended = ({ session, from, to, reason = null }) => track(async () => {
    const programmes = await programmesFor({ channelId: session.channelId, fromMs: from, toMs: to })
    liveWatchEndsOf({
      channelId: session.channelId,
      startedAt: from,
      endedAt: to,
      programmes,
      meta: { session_id: session.id, reason, attended: true },
    }).forEach(log)
  })

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

  const liveAttentionChanged = (session, attending) => {
    const from = attendedSince.get(session.id)
    if (attending) {
      if (from == null) attendedSince.set(session.id, now())
      return Promise.resolve()
    }
    attendedSince.delete(session.id)
    if (from == null) return Promise.resolve()
    return logAttended({ session, from, to: now(), reason: 'unattended' })
  }

  const liveEnded = (session, reason) => {
    const endedAt = endTimeOf({ session, reason, nowMs: now() })
    const from = attendedSince.get(session.id)
    attendedSince.delete(session.id)
    if (from == null) return Promise.resolve()
    return logAttended({ session, from, to: endedAt, reason: reason?.code ?? null })
  }

  const playStarted = (session) => {
    const existing = viewings.get(session.recordingId)
    if (existing) {
      clearTimeout(existing.closeTimer)
      existing.sessionId = session.id
      existing.activeSince = null
      existing.progress = resetPositionAnchor(existing.progress)
      return Promise.resolve()
    }
    const viewing = {
      recordingId: session.recordingId,
      sessionId: session.id,
      activeSince: null,
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
    if (!viewing || viewing.activeSince == null) return
    viewing.progress = positionProgressOf({ progress: viewing.progress, seconds, atMs: now() })
  }

  const playAttentionChanged = (session, attending) => {
    const viewing = viewingOf(session)
    if (!viewing) return Promise.resolve()
    if (attending && viewing.activeSince == null) viewing.activeSince = now()
    if (!attending && viewing.activeSince != null) pauseViewing({ viewing, endedAt: now() })
    viewing.progress = resetPositionAnchor(viewing.progress)
    return Promise.resolve()
  }

  const playEnded = (session, reason) => {
    const viewing = viewingOf(session)
    if (!viewing) return
    if (viewing.activeSince != null) pauseViewing({ viewing, endedAt: endTimeOf({ session, reason, nowMs: now() }) })
    clearTimeout(viewing.closeTimer)
    viewing.closeTimer = setTimeout(() => close(session.recordingId), graceMs)
    viewing.closeTimer.unref?.()
  }

  const viewingOf = (session) => {
    const viewing = viewings.get(session.recordingId)
    return viewing && viewing.sessionId === session.id ? viewing : null
  }

  const close = (recordingId) => {
    const viewing = viewings.get(recordingId)
    if (!viewing) return Promise.resolve()
    clearTimeout(viewing.closeTimer)
    viewings.delete(recordingId)
    if (viewing.activeSince != null) pauseViewing({ viewing, endedAt: now() })
    if (!(viewing.wallMs > 0)) return Promise.resolve()
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
        meta: { watched: Boolean(row?.watched_at), resumed_from: viewing.startOffset, attended: true },
      })
    })
  }

  const settle = async () => {
    await Promise.all([...viewings.keys()].map(close))
    await Promise.all([...tasks])
  }

  return {
    liveStarted, liveAttentionChanged, liveEnded, playStarted, playAttentionChanged, playEnded, positionSaved, settle,
    openViewings: () => viewings.size,
  }
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
