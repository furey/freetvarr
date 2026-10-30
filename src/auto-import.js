export const createAutoImport = ({
  isEnabled,
  runSync,
  isSyncRunning,
  onSyncFinished,
  quietMs = QUIET_MS,
  maxWaitMs = MAX_WAIT_MS,
  nowMs = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  log = console,
}) => {
  let timer = null
  let firstFinishAt = null
  let followUp = false

  const startIfAllowed = async () => {
    if (!(await isEnabled())) return
    if (isSyncRunning()) {
      followUp = true
      return
    }
    await runSync()
  }

  const fire = () => {
    timer = null
    firstFinishAt = null
    startIfAllowed().catch((err) => log.error(`[auto-import] sync failed: ${err.message}`))
  }

  const noteFinished = () => {
    const now = nowMs()
    firstFinishAt ??= now
    if (timer) clearTimer(timer)
    timer = setTimer(fire, Math.max(0, Math.min(quietMs, firstFinishAt + maxWaitMs - now)))
  }

  const stopListening = onSyncFinished(() => {
    if (!followUp) return
    followUp = false
    fire()
  })

  const stop = () => {
    if (timer) clearTimer(timer)
    timer = null
    stopListening?.()
  }

  return { noteFinished, stop, isWaiting: () => timer != null || followUp }
}

export const watchForFinishedRecordings = ({
  isEnabled,
  poll,
  everyMs = WATCH_EVERY_MS,
  setRepeat = setInterval,
  clearRepeat = clearInterval,
}) => {
  const repeat = setRepeat(() => {
    if (isEnabled()) poll().catch(() => {})
  }, everyMs)
  repeat?.unref?.()
  return () => clearRepeat(repeat)
}

const QUIET_MS = 60_000
const MAX_WAIT_MS = 5 * 60_000
const WATCH_EVERY_MS = 60_000
