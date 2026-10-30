import { csrfToken, api } from '/shared/api.js'

export const postRecordingPosition = ({ recordingId, seconds, keepalive = false }) => {
  const url = `/api/recordings/${encodeURIComponent(recordingId)}/position`
  if (!keepalive) return api('POST', url, { seconds }).catch(() => {})
  return fetch(url, {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken || '' },
    body: JSON.stringify({ seconds }),
  }).catch(() => {})
}
