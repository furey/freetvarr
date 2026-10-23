import path from 'path'
import { createRequire } from 'module'
import cron from 'node-cron'

export const scheduleEverRuns = ({ expr, fromMs = Date.now(), days = SEARCH_DAYS }) => {
  if (!cron.validate(String(expr ?? ''))) return false
  const runsOn = dayMatcherOf(expr)
  const start = new Date(fromMs)
  for (let offset = 0; offset < days; offset++) {
    if (runsOn(new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset, 12))) return true
  }
  return false
}

export const createScheduleCheck = ({ expression, everRuns = scheduleEverRuns }) => {
  let checked = { expr: null, runs: false }
  return () => {
    const expr = expression()
    if (!expr) return false
    if (checked.expr !== expr) checked = { expr, runs: everRuns({ expr }) }
    return checked.runs
  }
}

const dayMatcherOf = (expr) => {
  const [, , , daysOfMonth, months, daysOfWeek] = interpret(expr)
  const dayOfMonth = new Set(daysOfMonth)
  const month = new Set(months)
  const dayOfWeek = new Set(daysOfWeek.map((day) => day % 7))
  return (date) => dayOfMonth.has(date.getDate()) && month.has(date.getMonth() + 1) && dayOfWeek.has(date.getDay())
}

const require = createRequire(import.meta.url)
const interpret = require(path.join(path.dirname(require.resolve('node-cron')), 'pattern', 'convertion', 'index.js')).default

const SEARCH_DAYS = 29 * 366
