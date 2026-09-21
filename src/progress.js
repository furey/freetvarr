import prettyMs from 'pretty-ms'

export const setProgress = (recordingId, patch) => {
  const existing = registry.get(recordingId) || {}
  registry.set(recordingId, { ...existing, ...patch, updatedAt: Date.now() })
}

export const clearProgress = (recordingId) => {
  registry.delete(recordingId)
}

export const getProgress = (recordingId) => {
  const entry = registry.get(recordingId)
  if (!entry) return null
  if (Date.now() - entry.updatedAt > PROGRESS_STALE_MS) {
    registry.delete(recordingId)
    return null
  }
  return entry
}

export const snapshotProgress = (recordingIds) => {
  const snapshot = {}
  for (const recordingId of recordingIds) {
    const entry = getProgress(recordingId)
    if (entry) snapshot[recordingId] = entry
  }
  return snapshot
}

export const makeImportProgress = (recordingId) => {
  let total = 1
  let startBytes = 0
  const startedAt = Date.now()
  return {
    startTime: startedAt,
    setTotal: (t) => { total = Math.max(t, 1) },
    getTotal: () => total,
    update: (value, payload = {}) => {
      if (!startBytes) startBytes = value
      const elapsed = (Date.now() - startedAt) / 1000
      const rate = elapsed > 0.5 ? (value - startBytes) / elapsed : 0
      const etaSeconds = rate > 0 ? Math.max(0, (total - value) / rate) : null
      setProgress(recordingId, {
        phase: 'importing',
        percent: Math.min(100, Math.round((value / total) * 100)),
        etaSeconds,
        etaLabel: formatEta(etaSeconds),
        detail: formatRate(payload.speed),
        startedAt,
      })
    },
    stop: () => clearProgress(recordingId),
  }
}

export const formatEta = (etaSeconds) =>
  etaSeconds == null ? null : prettyMs(etaSeconds * 1000, { secondsDecimalDigits: 0 })

const formatRate = (speed) => (speed && speed !== 'N/A' ? `${speed}/s` : null)

const registry = new Map()

const PROGRESS_STALE_MS = 30_000
