import cron from 'node-cron'

import { getSetting } from './db.js'
import { startSync } from './sync.js'
import { getGuideSnapshot } from './epg.js'
import { backfillUserEvents, pruneUserEvents } from './user-events-log.js'
import { runForYouUpkeep } from './for-you-service.js'
import { createScheduleCheck } from './schedule-runs.js'

const DEFAULT_CRON = '*/30 * * * *'

let task = null
let currentExpr = null

export const startScheduler = async () => {
  const expr = (await getSetting('sync_cron')) || DEFAULT_CRON
  if (!cron.validate(expr)) {
    console.warn(`[scheduler] invalid cron "${expr}", falling back to "${DEFAULT_CRON}"`)
    return scheduleWith(DEFAULT_CRON)
  }
  return scheduleWith(expr)
}

export const getSchedulerExpression = () => currentExpr

export const scheduledSyncsOn = createScheduleCheck({ expression: () => currentExpr })

export const getSchedulerNextRun = () => task?.getNextRun()?.toISOString() ?? null

export const stopScheduler = () => {
  if (task) task.stop()
  task = null
  currentExpr = null
}

const scheduleWith = (expr) => {
  if (task) task.stop()
  task = cron.schedule(expr, () => {
    startSync({ trigger: 'cron' }).catch((err) => {
      console.error('[scheduler] sync failed:', err.message)
    })
    getGuideSnapshot().catch((err) => {
      console.error('[scheduler] guide refresh failed:', err.message)
    })
    pruneUserEvents()
      .then(() => backfillUserEvents())
      .catch((err) => console.error('[scheduler] viewing history upkeep failed:', err.message))
    runForYouUpkeep().catch((err) => console.error('[scheduler] for you upkeep failed:', err.message))
  })
  currentExpr = expr
  console.log(`[scheduler] running on "${expr}"`)
}
