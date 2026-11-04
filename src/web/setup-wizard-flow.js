export const nextStepAfter = ({ from, current }) => (current === from ? from + 1 : current)

export const leaveTvheadendStep = async ({ settleBootstrap, showsSecure, testTvh }) => {
  await settleBootstrap()
  if (showsSecure()) return false
  return testTvh()
}

export const createBootstrapCheck = ({ read, delayMs, setTimer = setTimeout, clearTimer = clearTimeout }) => {
  let timer = null
  let pending = null
  const cancelTimer = () => {
    clearTimer(timer)
    timer = null
  }
  const schedule = (url) => {
    cancelTimer()
    pending = null
    if (!url) return
    timer = setTimer(() => {
      timer = null
      pending = read(url)
    }, delayMs)
  }
  const settle = async ({ url, known }) => {
    if (!url || known) return
    cancelTimer()
    pending ??= read(url)
    await pending
  }
  return { schedule, settle }
}
