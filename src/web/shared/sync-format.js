import { syncTook } from '/sync-when.js'
import { toIso, fmtElapsed, now } from '/shared/time.js'

export const syncMsOf = (at) => (at ? Date.parse(toIso(at)) : null)

export const syncTookText = (s) => {
  if (s.status === 'running') return fmtElapsed({ at: s.started_at, nowMs: now.value.getTime() })
  if (!s.finished_at) return ''
  return syncTook(syncMsOf(s.finished_at) - syncMsOf(s.started_at))
}
