import knexFactory from 'knex'
import knexConfig from '../knexfile.js'
import { trackQueries } from './event-loop-lag.js'

export const db = trackQueries(knexFactory(knexConfig))

export const getSetting = async (key) => {
  const row = await db('settings').where({ key }).first()
  return row?.value ?? null
}

export const setSetting = (key, value) => db('settings').insert({ key, value }).onConflict('key').merge()

export const deleteInChunks = async ({ database = db, table, where, chunkSize = DELETE_CHUNK_SIZE }) => {
  let removed = 0
  for (;;) {
    const chunk = where(database(table).select('rowid')).limit(chunkSize)
    const count = await database(table).whereIn('rowid', chunk).delete()
    removed += count
    if (count < chunkSize) return removed
    await new Promise(setImmediate)
  }
}

const DELETE_CHUNK_SIZE = 200
