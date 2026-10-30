import { test } from 'node:test'
import assert from 'node:assert/strict'
import knexFactory from 'knex'

import { pruneLookupCaches } from '../src/cache-prune.js'

const DAY = 24 * 60 * 60 * 1000

const openDb = async () => {
  const database = knexFactory({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true })
  await database.schema.createTable('programme_ratings', (t) => {
    t.string('lookup_key').primary()
    t.text('found_json').notNullable()
    t.bigInteger('expires_at').notNullable()
  })
  await database.schema.createTable('show_artwork', (t) => {
    t.string('title_key').primary()
    t.text('sources_json').notNullable()
    t.bigInteger('expires_at').notNullable()
  })
  return database
}

test('pruneLookupCaches deletes rows long past expiry and keeps fresh and recently stale rows', async () => {
  const database = await openDb()
  const nowMs = 1000 * DAY
  await database('programme_ratings').insert([
    { lookup_key: 'fresh', found_json: '{}', expires_at: nowMs + DAY },
    { lookup_key: 'stale', found_json: '{}', expires_at: nowMs - 10 * DAY },
    { lookup_key: 'ancient', found_json: '{}', expires_at: nowMs - 200 * DAY },
  ])
  const removed = await pruneLookupCaches({ database, nowMs })
  assert.equal(removed.programme_ratings, 1)
  assert.equal(removed.art_pools, 0)
  assert.deepEqual((await database('programme_ratings').select('lookup_key').orderBy('lookup_key')).map((row) => row.lookup_key), ['fresh', 'stale'])
  await database.destroy()
})

test('pruneLookupCaches caps each table, dropping the rows that expire first', async () => {
  const database = await openDb()
  const nowMs = 1000 * DAY
  await database('show_artwork').insert([1, 2, 3, 4].map((id) => ({ title_key: `show ${id}`, sources_json: '[]', expires_at: nowMs + id })))
  await pruneLookupCaches({ database, nowMs, maxRows: 2 })
  assert.deepEqual((await database('show_artwork').select('title_key').orderBy('title_key')).map((row) => row.title_key), ['show 3', 'show 4'])
  await database.destroy()
})
