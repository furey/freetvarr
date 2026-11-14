export const syncOutcome = (sync) => {
  if (sync.status === 'running') return 'running'
  if (sync.status === 'ok') return 'ok'
  if (sync.status === 'partial') return 'partial'
  if (sync.status === 'stopped') return 'stopped'
  return 'failed'
}

export const syncResult = (sync) => {
  if (sync.status === 'running') return [{ tone: 'running', text: 'syncing…' }]
  if (sync.status === 'stopped') return [{ tone: 'quiet', text: 'stopped by a restart' }]
  const summary = sync.summary || {}
  const removed = removedCount(summary)
  const parts = [
    summary.failed ? { tone: 'failed', text: `${summary.failed} failed` } : null,
    summary.imported ? { tone: 'imported', text: `${summary.imported} imported` } : null,
    removed ? { tone: 'removed', text: `${removed} removed` } : null,
  ].filter(Boolean)
  if (parts.length) return parts
  if (sync.status !== 'ok') return [{ tone: 'failed', text: 'failed' }]
  return [{ tone: 'quiet', text: 'nothing new' }]
}

export const firstSyncError = (sync) => sync.summary?.errors?.[0] ?? ''

export const ranAgainText = ({ sync, clockOf }) => {
  const at = sync.status === 'stopped' ? sync.summary?.ranAgainAt : null
  return at ? `Ran again at ${clockOf(at)}` : ''
}

export const groupSyncsByDay = ({ syncs, dayOf }) => syncs.reduce((groups, sync) => {
  const day = dayOf(sync)
  const last = groups.at(-1)
  if (last?.day === day) return [...groups.slice(0, -1), { day, syncs: [...last.syncs, sync] }]
  return [...groups, { day, syncs: [sync] }]
}, [])

const removedCount = (summary) => (summary.delete?.triggered ? summary.delete.removed?.length ?? 0 : 0)
