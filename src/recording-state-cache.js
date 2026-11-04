export const createRecordingStateCache = ({ load, ttlMs, retryMs, now = Date.now }) => {
  let cached = null
  let inflight = null
  let failedUntil = 0
  let lastError = null
  let generation = 0

  const get = async ({ fresh = false } = {}) => {
    const at = now()
    if (!fresh && cached && cached.expiresAt > at) return cached.value
    if (!fresh && at < failedUntil) {
      if (cached) return { ...cached.value, stale: true }
      throw lastError
    }
    if (!fresh && cached) {
      reload(at).catch(() => {})
      return cached.value
    }
    return reload(at)
  }

  const reload = (at) => {
    if (inflight) return inflight
    const started = generation
    const isCurrent = () => started === generation
    const promise = Promise.resolve()
      .then(() => load(at))
      .then((value) => {
        if (isCurrent()) {
          cached = { value, expiresAt: at + ttlMs }
          failedUntil = 0
        }
        return value
      }, (err) => {
        if (isCurrent()) {
          failedUntil = now() + retryMs
          lastError = err
        }
        if (cached) return { ...cached.value, stale: true }
        throw err
      })
      .finally(() => {
        if (inflight === promise) inflight = null
      })
    inflight = promise
    return promise
  }

  const invalidate = () => {
    generation += 1
    cached = null
    inflight = null
    failedUntil = 0
  }

  const peek = () => cached?.value ?? null

  return { get, invalidate, peek }
}
