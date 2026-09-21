import knexFactory from 'knex'
import knexConfig from '../knexfile.js'

export const db = knexFactory(knexConfig)

export const getSetting = async (key) => {
  const row = await db('settings').where({ key }).first()
  return row?.value ?? null
}

export const setSetting = async (key, value) => {
  const existing = await db('settings').where({ key }).first()
  if (existing) await db('settings').where({ key }).update({ value })
  else await db('settings').insert({ key, value })
}
