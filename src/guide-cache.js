export const createGuideCache = ({ load, staleRetryMs, now = Date.now }) => {
  let cached = null
  let inflight = null
  let generation = 0

  const get = async (startMs) => {
    if (cached && cached.startMs === startMs && cached.expiresAt > now()) return cached
    if (inflight) return inflight
    const started = generation
    const isCurrent = () => started === generation
    const run = load(startMs)
      .then((guide) => {
        if (isCurrent()) cached = guide
        return guide
      })
      .catch((err) => {
        if (!isCurrent() || cached?.startMs !== startMs) throw err
        cached = { ...cached, stale: true, expiresAt: now() + staleRetryMs }
        return cached
      })
      .finally(() => {
        if (inflight === run) inflight = null
      })
    inflight = run
    return run
  }

  const clear = () => {
    generation += 1
    cached = null
    inflight = null
  }

  return { get, clear }
}
