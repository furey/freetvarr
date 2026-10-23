export const minutesAgo = ({ atMs, nowMs }) => Math.max(0, Math.round((nowMs - atMs) / 60_000))

export const minutesAgoText = (minutes) => {
  if (minutes < 1) return 'just now'
  return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`
}

export const fromStartOption = ({ recording, clockText }) => {
  if (!recording?.canPlayFromStart) return null
  const title = recording.title || 'this programme'
  return {
    key: 'from-start',
    title: 'From the start',
    detail: `Watch ${title} from ${clockText(playsFromMsOf(recording))} while it keeps recording`,
  }
}

export const playsFromMsOf = ({ start, recordingStartedAt }) => (
  recordingStartedAt != null && (start == null || recordingStartedAt - start > LATE_START_GRACE_MS)
    ? recordingStartedAt
    : start)

export const tunedInOption = ({ bufferStartMs, hasBuffer = bufferStartMs != null, nowMs, clockText }) => {
  if (!hasBuffer) return null
  if (bufferStartMs == null) {
    return { key: 'tuned-in', title: 'Back to when you tuned in', detail: NOTHING_BUFFERED_TEXT, disabled: true }
  }
  const minutes = minutesAgo({ atMs: bufferStartMs, nowMs })
  return {
    key: 'tuned-in',
    title: 'Back to when you tuned in',
    detail: `${clockText(bufferStartMs)} · ${minutesAgoText(minutes)}`,
    disabled: false,
  }
}

export const startOverOptionsOf = ({ recording, bufferStartMs, hasBuffer, nowMs, clockText }) => [
  fromStartOption({ recording, clockText }),
  tunedInOption({ bufferStartMs, hasBuffer, nowMs, clockText }),
].filter(Boolean)

export const startOverActionOf = (options = []) => {
  const enabled = options.filter((option) => !option.disabled)
  if (enabled.length === 0) return { kind: 'none' }
  if (enabled.length === 1) return { kind: 'direct', key: enabled[0].key, title: `${enabled[0].title}: ${enabled[0].detail}` }
  return { kind: 'sheet' }
}

export const LATE_START_GRACE_MS = 60_000

export const NOTHING_BUFFERED_TEXT = 'Nothing to go back to yet. Ready a few seconds after you tune in.'

export const behindLiveText = (seconds) => {
  const minutes = Math.max(1, Math.round(seconds / 60))
  return `${minutes} min behind live`
}

export const fromStartRecordingOf = ({ active = [], channelId, nowMs }) => active.find((r) => !r.failed
  && r.canPlayFromStart
  && r.dvrUuid
  && String(r.channelId) === String(channelId)
  && r.start <= nowMs
  && nowMs < r.stopPadded) || null

export const startOverNoteOf = (options) => (options.some((o) => o.key === 'from-start')
  ? ''
  : '"From the start" shows only when Freetvarr is recording the programme.')
