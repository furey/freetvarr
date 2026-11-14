export const SYNC_PAGE_SIZE_DEFAULT = 50
export const SYNC_PAGE_SIZE_MAX = 200
export const SYNC_HISTORY_CAP = 500
export const SYNC_EMPTY_HISTORY_CAP = 100

export const LEGACY_RESTART_ERROR = 'Freetvarr restarted before this sync finished.'

const LEGACY_STOPPED_CLAUSE = `(status = 'error'`
  + ` AND EXISTS (SELECT 1 FROM json_each(summary_json, '$.errors') WHERE value = '${LEGACY_RESTART_ERROR}'))`

export const syncRowOf = ({ summary_json, ...row }) => {
  const summary = parseSummary(summary_json)
  if (!isLegacyStopped({ status: row.status, summary })) return { ...row, summary }
  const errors = summary.errors.filter((error) => error !== LEGACY_RESTART_ERROR)
  return { ...row, status: 'stopped', summary: { ...summary, errors } }
}

const isLegacyStopped = ({ status, summary }) =>
  status === 'error' && Array.isArray(summary?.errors) && summary.errors.includes(LEGACY_RESTART_ERROR)

const parseSummary = (json) => {
  if (!json) return null
  try { return JSON.parse(json) } catch { return null }
}

const EMPTY_CLAUSE = `status = 'ok'`
  + ` AND coalesce(json_extract(summary_json, '$.imported'), 0) = 0`
  + ` AND coalesce(json_extract(summary_json, '$.failed'), 0) = 0`
  + ` AND coalesce(json_extract(summary_json, '$.delete.triggered'), 0) = 0`

export const SYNC_OUTCOMES = {
  imports: `json_extract(summary_json, '$.imported') > 0`,
  fails: `(status IN ('error', 'partial') AND NOT ${LEGACY_STOPPED_CLAUSE})`,
  removals: `json_extract(summary_json, '$.delete.triggered') = 1`,
  empty: EMPTY_CLAUSE,
}

export const SYNC_TRIGGERS = {
  manual: `json_extract(summary_json, '$.trigger') LIKE 'manual%'`,
  cron: `json_extract(summary_json, '$.trigger') IN ('cron', 'restart')`,
  auto: `json_extract(summary_json, '$.trigger') = 'recording-finished'`,
}

export const syncPageParams = (query = {}) => ({
  outcomes: outcomesFrom(query.show),
  trigger: SYNC_TRIGGERS[query.trigger] ? query.trigger : null,
  page: Math.max(1, parseInt(query.page, 10) || 1),
  pageSize: Math.min(
    SYNC_PAGE_SIZE_MAX,
    Math.max(1, parseInt(query.pageSize, 10) || SYNC_PAGE_SIZE_DEFAULT),
  ),
})

export const listSyncs = async ({ db, outcomes = null, trigger = null, page = 1, pageSize = SYNC_PAGE_SIZE_DEFAULT }) => {
  const byTrigger = () => {
    const q = db('syncs')
    if (trigger) q.whereRaw(SYNC_TRIGGERS[trigger])
    return q
  }
  const filtered = () => {
    const q = byTrigger()
    if (outcomes) q.whereRaw(`(status IN ('running', 'stopped') OR ${LEGACY_STOPPED_CLAUSE} OR ${outcomes.map((o) => `(${SYNC_OUTCOMES[o]})`).join(' OR ')})`)
    return q
  }
  const [{ count }, { emptyCount }, syncs] = await Promise.all([
    filtered().count({ count: 'id' }).first(),
    byTrigger().whereRaw(EMPTY_CLAUSE).count({ emptyCount: 'id' }).first(),
    filtered()
      .orderBy('started_at', 'desc')
      .orderBy('id', 'desc')
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ])
  return { syncs, total: Number(count), emptyCount: Number(emptyCount) }
}

export const pruneSyncHistory = async ({ db, cap = SYNC_HISTORY_CAP, emptyCap = SYNC_EMPTY_HISTORY_CAP }) => {
  await deleteBeyond({ db, keep: emptyCap, scope: (q) => q.whereRaw(EMPTY_CLAUSE) })
  await deleteBeyond({ db, keep: cap, scope: (q) => q })
}

const deleteBeyond = async ({ db, keep, scope }) => {
  const kept = await scope(db('syncs').select('id'))
    .orderBy('started_at', 'desc')
    .orderBy('id', 'desc')
    .limit(keep)
  if (kept.length < keep) return
  await scope(db('syncs'))
    .whereNotIn('id', kept.map((r) => r.id))
    .andWhere('status', '!=', 'running')
    .delete()
}

const outcomesFrom = (show) => {
  const picked = String(show ?? '').split(',').filter((o) => SYNC_OUTCOMES[o])
  const unique = [...new Set(picked)]
  if (!unique.length || unique.length === Object.keys(SYNC_OUTCOMES).length) return null
  return unique
}
