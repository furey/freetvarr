export const createGuideCache = ({ load, staleRetryMs, now = Date.now }) => {
  let cached = null
  let inflight = null
  let generation = 0
  let failedDay = null

  const get = async (startMs) => {
    const isSameDay = cached?.startMs === startMs
    if (isSameDay && cached.expiresAt > now()) return cached
    if (!isSameDay && cached && failedDay?.startMs === startMs && failedDay.until > now()) return cached
    const reload = reloadFor(startMs)
    if (!isSameDay) return reload
    reload.catch(() => {})
    return cached
  }

  const reloadFor = (startMs) => {
    if (inflight?.startMs === startMs) return inflight.promise
    generation += 1
    const started = generation
    const isCurrent = () => started === generation
    const promise = load(startMs)
      .then((guide) => {
        if (isCurrent()) cached = guide
        return guide
      })
      .catch((err) => {
        if (!isCurrent() || !cached) throw err
        if (cached.startMs !== startMs) failedDay = { startMs, until: now() + staleRetryMs }
        cached = { ...cached, stale: true, expiresAt: now() + staleRetryMs }
        return cached
      })
      .finally(() => {
        if (inflight?.promise === promise) inflight = null
      })
    inflight = { startMs, promise }
    return promise
  }

  const clear = () => {
    generation += 1
    cached = null
    inflight = null
    failedDay = null
  }

  return { get, clear }
}
