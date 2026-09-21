import cron from 'node-cron'

import { getSetting } from './db.js'
import { startSync } from './sync.js'

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
  })
  currentExpr = expr
  console.log(`[scheduler] running on "${expr}"`)
}
