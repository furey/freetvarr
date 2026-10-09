export const createGuideCache = ({ load, staleRetryMs, now = Date.now }) => {
  let cached = null
  let inflight = null
  let generation = 0

  const get = async (startMs) => {
    const isSameDay = cached?.startMs === startMs
    if (isSameDay && cached.expiresAt > now()) return cached
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
        if (!isCurrent() || cached?.startMs !== startMs) throw err
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
  }

  return { get, clear }
}
