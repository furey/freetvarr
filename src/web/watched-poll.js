export const createWatchedPoll = ({ load, everyMs, timers = globalThis }) => {
  let watchers = 0
  let polling = false
  let timer = null
  const poll = async () => {
    polling = true
    try { await load() } catch {}
    polling = false
    if (watchers) timer = timers.setTimeout(poll, everyMs)
  }
  return () => {
    watchers += 1
    if (watchers === 1 && !polling) poll()
    return () => {
      watchers = Math.max(0, watchers - 1)
      if (!watchers) timers.clearTimeout(timer)
    }
  }
}
