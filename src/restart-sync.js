export const RESTART_TRIGGER = 'restart'
export const RESTART_SYNC_DELAY_MS = 30_000
export const SCHEDULE_GRACE_MS = 2 * 60_000

export const restartSyncPlan = ({ stopped, scheduledSyncsOn, nextRunAt, nowMs }) => {
  if (!stopped.length) return 'none'
  if (stopped.some(({ trigger }) => trigger === RESTART_TRIGGER)) return 'leave-to-schedule'
  if (!scheduledSyncsOn) return 'syncs-off'
  if (isDueSoon({ nextRunAt, nowMs })) return 'schedule-due'
  return 'run-again'
}

export const runAgainAfterRestart = async ({
  stopped,
  scheduledSyncsOn,
  nextRunAt,
  startSync,
  noteRanAgain,
  nowMs = Date.now(),
}) => {
  const plan = restartSyncPlan({ stopped, scheduledSyncsOn: scheduledSyncsOn(), nextRunAt: nextRunAt(), nowMs })
  if (plan !== 'run-again') return { plan }
  const result = await startSync({ trigger: RESTART_TRIGGER })
  if (result?.syncId == null || result.alreadyRunning) return { plan, result }
  await noteRanAgain({ ids: stopped.map(({ id }) => id), syncId: result.syncId })
  return { plan, result }
}

export const scheduleRestartSync = ({ delayMs = RESTART_SYNC_DELAY_MS, log = console, ...options }) => {
  if (!options.stopped.length) return () => {}
  const timer = setTimeout(() => {
    runAgainAfterRestart(options)
      .then(({ plan, result }) => log.log(`[sync] after the restart: ${planText({ plan, result })}`))
      .catch((err) => log.warn(`[sync] could not run the stopped sync again: ${err.message}`))
  }, delayMs)
  timer.unref?.()
  return () => clearTimeout(timer)
}

const isDueSoon = ({ nextRunAt, nowMs }) => {
  const dueMs = nextRunAt ? Date.parse(nextRunAt) : NaN
  return Number.isFinite(dueMs) && dueMs - nowMs <= SCHEDULE_GRACE_MS
}

const planText = ({ plan, result }) => {
  if (result?.alreadyRunning) return `sync #${result.syncId} was already running`
  if (result?.syncId != null) return `started sync #${result.syncId}`
  return PLAN_TEXT[plan] ?? 'no sync started'
}

const PLAN_TEXT = {
  'leave-to-schedule': 'a restart stopped the last re-run too, so the schedule runs the next sync',
  'syncs-off': 'scheduled syncs are off, so no sync started',
  'schedule-due': 'a scheduled sync is due within 2 minutes, so it runs instead',
}
