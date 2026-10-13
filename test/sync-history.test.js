import { test } from 'node:test'
import assert from 'node:assert/strict'
import knexFactory from 'knex'

import { listSyncs, pruneSyncHistory, syncPageParams, SYNC_PAGE_SIZE_MAX } from '../src/sync-history.js'

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

const seedRow = (db, { minute, status = 'ok', summary }) => db('syncs').insert({
  started_at: new Date(Date.UTC(2026, 9, 1, 0, minute)).toISOString(),
  status,
  summary_json: JSON.stringify(summary),
})

test('syncPageParams: defaults to page 1 of 50 with every outcome and trigger', () => {
  assert.deepEqual(syncPageParams({}), { outcomes: null, trigger: null, page: 1, pageSize: 50 })
})

test('syncPageParams: reads several outcomes and drops unknown ones', () => {
  assert.deepEqual(syncPageParams({ show: 'imports,fails,bogus,imports' }).outcomes, ['imports', 'fails'])
  assert.equal(syncPageParams({ show: 'bogus' }).outcomes, null)
  assert.equal(syncPageParams({ show: 'imports,fails,removals,empty' }).outcomes, null)
})

test('syncPageParams: caps the page size and ignores an unknown trigger', () => {
  const params = syncPageParams({ page: '3', pageSize: '5000', trigger: 'bogus' })
  assert.equal(params.page, 3)
  assert.equal(params.pageSize, SYNC_PAGE_SIZE_MAX)
  assert.equal(params.trigger, null)
  assert.equal(syncPageParams({ page: '-2' }).page, 1)
  assert.equal(syncPageParams({ trigger: 'cron' }).trigger, 'cron')
})

test('listSyncs: pages newest first and counts every row', async () => {
  const db = await openDb()
  await seedSyncs(db, 120)
  const first = await listSyncs({ db, page: 1, pageSize: 50 })
  const last = await listSyncs({ db, page: 3, pageSize: 50 })
  assert.equal(first.total, 120)
  assert.equal(first.syncs.length, 50)
  assert.equal(first.syncs[0].id, 120)
  assert.equal(last.syncs.length, 20)
  assert.equal(last.syncs.at(-1).id, 1)
  await db.destroy()
})

test('listSyncs: matches any chosen outcome and counts the empty syncs', async () => {
  const db = await openDb()
  await seedRow(db, { minute: 1, summary: { trigger: 'cron', imported: 2 } })
  await seedRow(db, { minute: 2, status: 'partial', summary: { trigger: 'cron', failed: 1 } })
  await seedRow(db, { minute: 3, summary: { trigger: 'cron', delete: { triggered: 1 } } })
  await seedRow(db, { minute: 4, summary: { trigger: 'cron', imported: 0 } })
  await seedRow(db, { minute: 5, summary: { trigger: 'manual', imported: 0 } })
  await seedRow(db, { minute: 6, status: 'running', summary: { trigger: 'cron' } })
  const result = await listSyncs({ db, outcomes: ['imports', 'fails'] })
  assert.deepEqual(result.syncs.map((s) => s.id), [6, 2, 1])
  assert.equal(result.emptyCount, 2)
  const cronOnly = await listSyncs({ db, outcomes: ['empty'], trigger: 'cron' })
  assert.deepEqual(cronOnly.syncs.map((s) => s.id), [6, 4])
  assert.equal(cronOnly.emptyCount, 1)
  await db.destroy()
})

test('pruneSyncHistory: drops the oldest empty syncs first, then caps the total', async () => {
  const db = await openDb()
  for (let minute = 1; minute <= 6; minute++) {
    await seedRow(db, { minute, summary: { trigger: 'cron', imported: minute % 2 } })
  }
  await pruneSyncHistory({ db, cap: 4, emptyCap: 1 })
  const ids = (await db('syncs').select('id').orderBy('id')).map((r) => r.id)
  assert.deepEqual(ids, [1, 3, 5, 6])
  await pruneSyncHistory({ db, cap: 3, emptyCap: 1 })
  assert.deepEqual((await db('syncs').select('id').orderBy('id')).map((r) => r.id), [3, 5, 6])
  await db.destroy()
})
