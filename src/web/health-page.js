import { formatDiskSize } from './size-format.js'
import { formatMinutes, formatHours } from './time-format.js'
import { syncResult } from './sync-row.js'

export const HEALTH_RANKS = ['ok', 'warn', 'fail']

export const worstHealthOf = (...healths) => healths
  .filter(Boolean)
  .reduce(
    (worst, health) => (rankOf(health.level) > rankOf(worst.level) ? health : worst),
    { level: 'ok', sentence: null },
  )

export const healthHeadlineOf = ({ level, sentence } = {}) => {
  if (level === 'ok' || !sentence) return 'Everything is working.'
  return sentence
}

export const doctorCheckGroupsOf = (checks = []) => {
  const hasProblems = checks.some((check) => PROBLEM_STATUSES.includes(check.status))
  if (!hasProblems) return checks.length ? [{ key: 'all', label: null, checks, collapsible: false }] : []
  return CHECK_GROUPS
    .map(({ key, label, statuses }) => ({
      key,
      label,
      checks: checks.filter((check) => statuses.includes(check.status)),
      collapsible: key === 'working',
    }))
    .filter((group) => group.checks.length)
}

export const workingSummaryOf = (checks = []) => {
  const passed = checks.filter((check) => check.status === 'pass').length
  const skipped = checks.filter((check) => check.status === 'skip').length
  const working = `${passed} ${passed === 1 ? 'check' : 'checks'} working`
  return skipped ? `${working} · ${skipped} skipped` : working
}

export const checkedAgoText = ({ ranAtMs, nowMs }) => {
  if (!Number.isFinite(ranAtMs)) return ''
  const minutes = Math.floor((nowMs - ranAtMs) / 60_000)
  if (minutes < 1) return 'Last checked just now.'
  if (minutes < 60) return `Last checked ${formatMinutes(minutes, { long: true })} ago.`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Last checked ${hours === 1 ? 'an hour' : `${hours} hours`} ago.`
  return 'Last checked over a day ago.'
}

export const nextSyncText = ({ nextRunAtMs, nowMs, clockOf }) => {
  if (!Number.isFinite(nextRunAtMs)) return 'Not scheduled'
  const minutes = Math.ceil((nextRunAtMs - nowMs) / 60_000)
  if (minutes <= 0) return 'Due now'
  if (minutes < 60) return `in ${formatMinutes(minutes)}`
  if (minutes < 24 * 60) return `in ${formatHours(Math.floor(minutes / 60))} (${clockOf(nextRunAtMs)})`
  return clockOf(nextRunAtMs)
}

export const lastSyncText = ({ sync, clockOf }) => {
  if (!sync) return 'No syncs yet'
  const finishedMs = Date.parse(isoOf(sync.finishedAt ?? sync.finished_at))
  const result = syncResult({ status: sync.status, summary: sync.summary }).map((part) => part.text).join(', ')
  return Number.isFinite(finishedMs) ? `${clockOf(finishedMs)} · ${result}` : result
}

export const storageUsageOf = ({ total, free }) => {
  if (!total || free == null) return null
  const usedPercent = Math.min(100, Math.max(0, Math.round(((total - free) / total) * 100)))
  return { usedPercent, label: `${diskSize(free)} free of ${diskSize(total)}` }
}

export const driveLabelOf = ({ key, count }) => {
  if (count === 1) return 'Recordings drive'
  return key === 'media' ? 'TV library drive' : 'Recordings drive'
}

const PROBLEM_STATUSES = ['fail', 'warn']

const CHECK_GROUPS = [
  { key: 'attention', label: 'Needs attention', statuses: ['fail'] },
  { key: 'look', label: 'Needs a look', statuses: ['warn'] },
  { key: 'working', label: 'Working', statuses: ['pass', 'skip'] },
]

const diskSize = (bytes) => formatDiskSize(bytes).replace(/([\d.])([A-Z])/, '$1 $2')

const isoOf = (at) => (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(at || '') ? `${at.replace(' ', 'T')}Z` : at)

const rankOf = (level) => HEALTH_RANKS.indexOf(level)
