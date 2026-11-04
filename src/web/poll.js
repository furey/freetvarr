export const createPoll = ({ run, delayOf, setTimer = setTimeout, clearTimer = clearTimeout }) => {
  let timer = null
  let stopped = false
  const cancel = () => {
    clearTimer(timer)
    timer = null
  }
  const tick = async () => {
    timer = null
    await Promise.resolve().then(run).catch(() => {})
    book()
  }
  const book = () => {
    cancel()
    if (stopped) return
    const delay = delayOf()
    if (delay == null) return
    timer = setTimer(tick, delay)
  }
  const stop = () => {
    stopped = true
    cancel()
  }
  return { book, stop, isBooked: () => timer !== null }
}
