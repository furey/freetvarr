export const SYNC_PAGE_SIZE_DEFAULT = 50
export const SYNC_PAGE_SIZE_MAX = 200

export const SYNC_ACTIVITY_FILTERS = {
  imports: `json_extract(summary_json, '$.imported') > 0`,
  fails: `status IN ('error', 'partial')`,
  deletes: `json_extract(summary_json, '$.delete.triggered') = 1`,
  empty: `status = 'ok'`
    + ` AND coalesce(json_extract(summary_json, '$.imported'), 0) = 0`
    + ` AND coalesce(json_extract(summary_json, '$.failed'), 0) = 0`
    + ` AND coalesce(json_extract(summary_json, '$.delete.triggered'), 0) = 0`,
  manual: `json_extract(summary_json, '$.trigger') LIKE 'manual%'`,
  cron: `json_extract(summary_json, '$.trigger') = 'cron'`,
}

export const syncPageParams = (query = {}) => ({
  filter: SYNC_ACTIVITY_FILTERS[query.filter] ? query.filter : null,
  page: Math.max(1, parseInt(query.page, 10) || 1),
  pageSize: Math.min(
    SYNC_PAGE_SIZE_MAX,
    Math.max(1, parseInt(query.pageSize, 10) || SYNC_PAGE_SIZE_DEFAULT),
  ),
})

export const listSyncs = async ({ db, filter, page, pageSize }) => {
  const filterClause = SYNC_ACTIVITY_FILTERS[filter] || null
  const filtered = () => {
    const q = db('syncs')
    if (filterClause) q.whereRaw(filterClause)
    return q
  }
  const [{ count }, syncs] = await Promise.all([
    filtered().count({ count: 'id' }).first(),
    filtered()
      .orderBy('started_at', 'desc')
      .orderBy('id', 'desc')
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ])
  return { syncs, total: Number(count) }
}
