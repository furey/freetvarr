export const ATTENTION_SAMPLE_MS = 2_000

export const ATTENTION_MEDIA_EVENTS = ['play', 'playing', 'pause', 'ended', 'emptied', 'volumechange']

export const isAttending = ({ visible, video, captions = false }) =>
  Boolean(visible && video && !video.paused && !video.ended && (isAudible(video) || captions))

export const attentionPathOf = ({ kind, sessionId }) =>
  `/api/${kind === 'live' ? 'live' : 'play'}/${encodeURIComponent(sessionId)}/attention`

export const attentionChangesOf = ({ sent = new Map(), current = [] }) => {
  const next = new Map()
  const changes = []
  for (const entry of current) {
    if (!entry.sessionId) continue
    const key = `${entry.kind}:${entry.sessionId}`
    const attending = Boolean(next.get(key)?.attending) || entry.attending
    next.set(key, { kind: entry.kind, sessionId: entry.sessionId, attending })
  }
  for (const [key, entry] of next) {
    if ((sent.get(key)?.attending ?? false) !== entry.attending) changes.push(entry)
  }
  return { changes, sent: next }
}

const isAudible = (video) => !video.muted && video.volume > 0
