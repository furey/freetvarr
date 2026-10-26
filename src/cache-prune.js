import { db, deleteInChunks } from './db.js'
import { measureJob } from './event-loop-lag.js'

export const LOOKUP_CACHE_TABLES = [
  { table: 'programme_ratings', key: 'lookup_key' },
  { table: 'programme_credits', key: 'lookup_key' },
  { table: 'artwork_lookups', key: 'lookup_key' },
  { table: 'show_artwork', key: 'title_key' },
  { table: 'art_pools', key: 'pool_key' },
  { table: 'title_genres', key: 'title_key' },
  { table: 'title_known_as', key: 'title_key' },
]

export const CACHE_PRUNE_GRACE_MS = 90 * 24 * 60 * 60 * 1000
export const MAX_CACHE_ROWS = 20000

export const pruneLookupCaches = async ({
  database = db,
  nowMs = Date.now(),
  graceMs = CACHE_PRUNE_GRACE_MS,
  maxRows = MAX_CACHE_ROWS,
  tables = LOOKUP_CACHE_TABLES,
} = {}) => {
  const removed = {}
  for (const { table, key } of tables) {
    removed[table] = await pruneTable({ database, table, key, before: nowMs - graceMs, maxRows }).catch(() => 0)
  }
  return removed
}

export const startCachePruning = ({ prune = pruneLookupCaches, delayMs = PRUNE_START_DELAY_MS, everyMs = PRUNE_INTERVAL_MS } = {}) => {
  const run = () => Promise.resolve().then(() => measureJob('cache-prune', prune)).catch(() => {})
  const first = setTimeout(run, delayMs)
  const repeat = setInterval(run, everyMs)
  first.unref?.()
  repeat.unref?.()
  return () => {
    clearTimeout(first)
    clearInterval(repeat)
  }
}

const pruneTable = async ({ database, table, key, before, maxRows }) => {
  if (!(await database.schema.hasTable(table))) return 0
  const expired = await deleteInChunks({ database, table, where: (query) => query.where('expires_at', '<', before) })
  const { count } = await database(table).count({ count: '*' }).first()
  if (Number(count) <= maxRows) return expired
  const overflow = await database(table)
    .whereNotIn(key, database(table).select(key).orderBy('expires_at', 'desc').limit(maxRows))
    .del()
  return expired + overflow
}

const PRUNE_START_DELAY_MS = 10 * 60 * 1000
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000
