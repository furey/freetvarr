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
    detail: `Watch ${title} from ${clockText(recording.start)} while it keeps recording`,
  }
}

export const tunedInOption = ({ bufferStartMs, nowMs, clockText }) => {
  if (bufferStartMs == null) return null
  const minutes = minutesAgo({ atMs: bufferStartMs, nowMs })
  return {
    key: 'tuned-in',
    title: 'Back to when you tuned in',
    detail: `${clockText(bufferStartMs)} · ${minutesAgoText(minutes)}`,
    disabled: minutes < 1,
  }
}

export const startOverOptionsOf = ({ recording, bufferStartMs, nowMs, clockText }) => [
  fromStartOption({ recording, clockText }),
  tunedInOption({ bufferStartMs, nowMs, clockText }),
].filter(Boolean)

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
