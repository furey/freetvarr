export const isNotableSync = (sync) => {
  if (sync.status === 'running') return false
  if (sync.status !== 'ok') return true
  const summary = sync.summary || {}
  return Boolean(summary.imported || summary.failed || summary.delete?.triggered)
}

export const syncOutcome = (sync) => {
  if (sync.status === 'running') return 'running'
  if (sync.status === 'ok') return 'ok'
  if (sync.status === 'partial') return 'partial'
  return 'failed'
}

export const syncResult = (sync) => {
  if (sync.status === 'running') return [{ tone: 'running', text: 'syncing…' }]
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

export const syncStrip = ({ syncs, size }) => {
  const marks = syncs.slice(0, size).map((sync) => ({ key: sync.id, mark: stripMarkOf(sync) })).reverse()
  const padding = Array.from({ length: size - marks.length }, (_, i) => ({ key: `none-${i}`, mark: 'none' }))
  return [...padding, ...marks]
}

export const syncStripLabel = ({ syncs, size }) => {
  const shown = syncs.slice(0, size)
  const marks = shown.map(stripMarkOf)
  const changed = marks.filter((mark) => mark === 'changed').length
  const failed = marks.filter((mark) => mark === 'failed').length
  const noun = shown.length === 1 ? 'sync' : 'syncs'
  return `Last ${shown.length} ${noun}: ${changed} with changes, ${failed} failed`
}

export const groupSyncsByDay = ({ syncs, dayOf }) => syncs.reduce((groups, sync) => {
  const day = dayOf(sync)
  const last = groups.at(-1)
  if (last?.day === day) return [...groups.slice(0, -1), { day, syncs: [...last.syncs, sync] }]
  return [...groups, { day, syncs: [sync] }]
}, [])

const stripMarkOf = (sync) => {
  if (sync.status === 'running') return 'running'
  if (sync.status !== 'ok') return 'failed'
  return isNotableSync(sync) ? 'changed' : 'quiet'
}

const removedCount = (summary) => (summary.delete?.triggered ? summary.delete.removed?.length ?? 0 : 0)
