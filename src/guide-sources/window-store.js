import { db } from '../db.js'

export const createWindowStore = ({ database = db } = {}) => {
  const load = async ({ source, format }) => {
    await database(TABLE).whereNot({ format }).delete()
    const rows = await database(TABLE).where({ source, format }).orderBy('window_start')
    return rows.map(windowOf).filter(Boolean)
  }

  const save = ({ source, format, triplet, windowStart, fetchedAt, expiresAt, programmes }) => database(TABLE)
    .insert({
      source,
      triplet,
      window_start: windowStart,
      format,
      fetched_at: fetchedAt,
      expires_at: expiresAt,
      programmes_json: JSON.stringify(programmes),
    })
    .onConflict(['source', 'triplet', 'window_start'])
    .merge()

  const prune = ({ before }) => database(TABLE).where('window_start', '<', before).delete()

  return { load, save, prune }
}

const windowOf = (row) => {
  try {
    return {
      triplet: row.triplet,
      windowStart: Number(row.window_start),
      fetchedAt: Number(row.fetched_at),
      expiresAt: Number(row.expires_at),
      programmes: JSON.parse(row.programmes_json),
    }
  } catch {
    return null
  }
}

const TABLE = 'guide_source_windows'
