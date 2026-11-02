export const createScrollMemory = ({ newKey = defaultKeyMaker() } = {}) => {
  const positions = new Map()
  const leave = ({ key, scrollY }) => {
    if (key) positions.set(key, Math.max(0, Math.round(scrollY)))
  }
  const arrive = (state) => {
    const revisit = Boolean(state?.entryKey)
    const key = revisit ? state.entryKey : newKey()
    return { key, top: revisit ? positions.get(key) ?? 0 : 0 }
  }
  return { leave, arrive }
}

export const entryStateWithKey = ({ state, key }) => (state?.entryKey === key
  ? state
  : { ...(state || {}), entryKey: key })

export const hashesMatch = (first, second) => {
  const target = normalisedHash(first)
  return Boolean(target) && target === normalisedHash(second)
}

export const canReachTop = ({ top, maxScrollY }) => maxScrollY >= top

export const restoreScrollTop = ({ top, maxScrollY, scrollTo, nextAttempt, now, limitMs, onDone = () => {} }) => {
  const startedAt = now()
  let finished = false
  const finish = () => {
    finished = true
    onDone()
  }
  const attempt = () => {
    if (finished) return
    const reachable = top <= 0 || canReachTop({ top, maxScrollY: maxScrollY() })
    if (reachable || now() - startedAt > limitMs) {
      scrollTo(Math.max(0, top))
      return finish()
    }
    nextAttempt(attempt)
  }
  attempt()
  return { cancel: () => { if (!finished) finish() }, isDone: () => finished }
}

const normalisedHash = (hash = '') => String(hash || '').replace(/^#\/?/, '').replace(/\/+$/, '').toLowerCase()

const defaultKeyMaker = () => {
  let counter = 0
  const session = Date.now().toString(36)
  return () => `${session}-${++counter}`
}
