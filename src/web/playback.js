export const RESUME_END_MARGIN_S = 30
export const SEEK_EDGE_MARGIN_S = 1

export const seekPlan = ({ target, offset, producedEnd, duration, margin = SEEK_EDGE_MARGIN_S }) => {
  const last = duration ? Math.max(0, duration - margin) : target
  const wanted = Math.min(Math.max(0, target), last)
  const local = wanted - offset
  const produced = Number.isFinite(producedEnd) ? producedEnd : 0
  if (local >= 0 && local <= produced - margin) return { kind: 'local', time: local }
  return { kind: 'restart', offset: Math.floor(wanted) }
}

export const fmtPlayTime = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = String(total % 60).padStart(2, '0')
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`
}
