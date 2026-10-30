import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-interrupted-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')
const { closeInterruptedSyncs, interruptedSyncSummaryOf, INTERRUPTED_SYNC_ERROR } = await import('../src/sync.js')

before(async () => {
  await db.migrate.latest()
})

after(async () => {
  await db.destroy()
})

test('closeInterruptedSyncs marks syncs left running by a restart as failed and leaves finished ones alone', async () => {
  const [stuck] = await db('syncs').insert({ status: 'running', summary_json: '{"trigger":"cron"}' }).returning('id')
  const [done] = await db('syncs').insert({ status: 'ok', finished_at: db.fn.now(), summary_json: '{"trigger":"manual"}' }).returning('id')
  assert.equal(await closeInterruptedSyncs(), 1)
  const stuckRow = await db('syncs').where({ id: stuck.id ?? stuck }).first()
  assert.equal(stuckRow.status, 'error')
  assert.ok(stuckRow.finished_at)
  assert.deepEqual(JSON.parse(stuckRow.summary_json), { trigger: 'cron', errors: [INTERRUPTED_SYNC_ERROR] })
  assert.equal((await db('syncs').where({ id: done.id ?? done }).first()).status, 'ok')
  assert.equal(await closeInterruptedSyncs(), 0)
})

test('interruptedSyncSummaryOf keeps earlier errors and survives bad JSON', () => {
  assert.deepEqual(interruptedSyncSummaryOf('{"errors":["first"]}'), { errors: ['first', INTERRUPTED_SYNC_ERROR] })
  assert.deepEqual(interruptedSyncSummaryOf('not json'), { errors: [INTERRUPTED_SYNC_ERROR] })
  assert.deepEqual(interruptedSyncSummaryOf(null), { errors: [INTERRUPTED_SYNC_ERROR] })
})
