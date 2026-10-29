import { formatClock, formatDate } from './time-format.js'

export const plexWatchStatusText = ({ status, nowMs, timeZone }) => {
  if (!status) return { text: '', kind: '' }
  if (!status.configured) return { text: 'Set the Plex URL, token, and a section above first.', kind: 'info' }
  if (status.running) return { text: 'Syncing watched state…', kind: 'busy' }
  if (status.errorKind === 'token') return { text: 'Plex rejected the token. Check the token above, then press Sync watched now.', kind: 'err' }
  if (status.error) {
    const retry = status.nextAttemptAt && status.nextAttemptAt > nowMs ? ` Tries again at ${formatClock(status.nextAttemptAt, timeZone)}.` : ''
    return { text: `${status.error.replace(/\.$/, '')}.${retry}`, kind: 'err' }
  }
  if (!status.lastRunAt) return { text: 'Not synced yet. It runs after each sync.', kind: 'info' }
  const parts = [`Last synced ${whenText({ ms: status.lastRunAt, nowMs, timeZone })}`]
  if (status.matched != null) parts.push(`${status.matched} matched`)
  if (status.unmatched) parts.push(`${status.unmatched} not in Plex yet`)
  if (status.ambiguous) parts.push(`${status.ambiguous} with more than one match`)
  return { text: parts.join(' · '), kind: 'ok' }
}

const whenText = ({ ms, nowMs, timeZone }) => {
  const sameDay = formatDate(ms, timeZone) === formatDate(nowMs, timeZone)
  return sameDay ? formatClock(ms, timeZone) : `${formatDate(ms, timeZone)} ${formatClock(ms, timeZone)}`
}
