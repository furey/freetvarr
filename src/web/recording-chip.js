export const recordingChipOf = ({ active = [], nowMs = Date.now() } = {}) => {
  const recording = active.filter((entry) => !entry.failed)
  if (!recording.length) return null
  if (recording.length > 1) return { label: `Recording ${recording.length} shows`, detail: '' }
  const [only] = recording
  return { label: `Recording ${only.title || 'now'}`, detail: minutesLeftOf({ stop: only.stop, nowMs }) }
}

const minutesLeftOf = ({ stop, nowMs }) => {
  const stopMs = typeof stop === 'number' ? stop : Date.parse(stop ?? '')
  if (!Number.isFinite(stopMs)) return ''
  const minutes = Math.max(0, Math.ceil((stopMs - nowMs) / 60_000))
  return `${minutes} min left`
}
