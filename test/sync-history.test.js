import { test } from 'node:test'
import assert from 'node:assert/strict'
import knexFactory from 'knex'

import { listSyncs, syncPageParams, SYNC_PAGE_SIZE_MAX } from '../src/sync-history.js'

const openDb = async () => {
  const db = knexFactory({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
  })
  await db.schema.createTable('syncs', (t) => {
    t.increments('id').primary()
    t.timestamp('started_at').notNullable()
    t.timestamp('finished_at')
    t.string('status').notNullable()
    t.text('summary_json')
  })
  return db
}

const seedSyncs = async (db, count) => {
  const rows = Array.from({ length: count }, (_, i) => ({
    started_at: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(),
    status: 'ok',
    summary_json: JSON.stringify({ trigger: 'cron', imported: i % 3 === 0 ? 1 : 0 }),
  }))
  await db('syncs').insert(rows)
}

test('syncPageParams: defaults to page 1 of 50 with no filter', () => {
  assert.deepEqual(syncPageParams({}), { filter: null, page: 1, pageSize: 50 })
})

test('syncPageParams: caps the page size and ignores unknown filters', () => {
  const params = syncPageParams({ page: '3', pageSize: '5000', filter: 'bogus' })
  assert.deepEqual(params, { filter: null, page: 3, pageSize: SYNC_PAGE_SIZE_MAX })
  assert.equal(syncPageParams({ page: '-2', filter: 'imports' }).page, 1)
  assert.equal(syncPageParams({ filter: 'imports' }).filter, 'imports')
})

test('listSyncs: pages newest first and counts every row', async () => {
  const db = await openDb()
  await seedSyncs(db, 120)
  const first = await listSyncs({ db, filter: null, page: 1, pageSize: 50 })
  const last = await listSyncs({ db, filter: null, page: 3, pageSize: 50 })
  assert.equal(first.total, 120)
  assert.equal(first.syncs.length, 50)
  assert.equal(first.syncs[0].id, 120)
  assert.equal(last.syncs.length, 20)
  assert.equal(last.syncs.at(-1).id, 1)
  await db.destroy()
})

test('listSyncs: applies the filter to the rows and the total', async () => {
  const db = await openDb()
  await seedSyncs(db, 120)
  const result = await listSyncs({ db, filter: 'imports', page: 1, pageSize: 50 })
  assert.equal(result.total, 40)
  assert.equal(result.syncs.length, 40)
  assert.ok(result.syncs.every((s) => JSON.parse(s.summary_json).imported === 1))
  await db.destroy()
})
