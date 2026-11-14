import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-interrupted-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')
const { closeInterruptedSyncs, noteSyncRanAgain, STOPPED_BY_RESTART } = await import('../src/sync.js')

before(async () => {
  await db.migrate.latest()
})

after(async () => {
  await db.destroy()
})

test('closeInterruptedSyncs marks syncs left running by a restart as stopped and leaves finished ones alone', async () => {
  const [stuck] = await db('syncs').insert({ status: 'running', summary_json: '{"trigger":"cron"}' }).returning('id')
  const [done] = await db('syncs').insert({ status: 'ok', finished_at: db.fn.now(), summary_json: '{"trigger":"manual"}' }).returning('id')
  const stuckId = stuck.id ?? stuck
  assert.deepEqual(await closeInterruptedSyncs(), [{ id: stuckId, trigger: 'cron' }])
  const stuckRow = await db('syncs').where({ id: stuckId }).first()
  assert.equal(stuckRow.status, STOPPED_BY_RESTART)
  assert.ok(stuckRow.finished_at)
  assert.deepEqual(JSON.parse(stuckRow.summary_json), { trigger: 'cron' })
  assert.equal((await db('syncs').where({ id: done.id ?? done }).first()).status, 'ok')
  assert.deepEqual(await closeInterruptedSyncs(), [])
})

test('closeInterruptedSyncs survives a summary that is not JSON', async () => {
  const [stuck] = await db('syncs').insert({ status: 'running', summary_json: 'not json' }).returning('id')
  assert.deepEqual(await closeInterruptedSyncs(), [{ id: stuck.id ?? stuck, trigger: null }])
})

test('noteSyncRanAgain records which sync ran again and when', async () => {
  const [stuck] = await db('syncs').insert({ status: 'running', summary_json: '{"trigger":"manual"}' }).returning('id')
  const [{ id }] = await closeInterruptedSyncs()
  await noteSyncRanAgain({ ids: [id], syncId: 99, at: new Date('2026-11-14T03:00:00Z') })
  const row = await db('syncs').where({ id: stuck.id ?? stuck }).first()
  assert.deepEqual(JSON.parse(row.summary_json), { trigger: 'manual', ranAgainAt: '2026-11-14T03:00:00.000Z', ranAgainSyncId: 99 })
})

test('reconcileInterruptedSyncs closes syncs left running', async () => {
  const { reconcileInterruptedSyncs } = await import('../src/startup-reconcile.js')
  await db('syncs').insert({ status: 'running', summary_json: '{}' })
  assert.equal((await reconcileInterruptedSyncs()).length, 1)
})

test('server.js reconciles interrupted syncs before it listens', async () => {
  const source = await fs.readFile(new URL('../src/server.js', import.meta.url), 'utf8')
  const reconcileAt = source.indexOf('await closeSyncsLeftByRestart()')
  const listenAt = source.indexOf('app.listen(PORT')
  assert.ok(reconcileAt > -1 && reconcileAt < listenAt)
})

test('server.js plans the restart sync only after the recovery steps and the scheduler start', async () => {
  const source = await fs.readFile(new URL('../src/server.js', import.meta.url), 'utf8')
  const restartSyncAt = source.indexOf('scheduleRestartSync({')
  assert.ok(restartSyncAt > source.indexOf('await recoverInterruptedCuts()'))
  assert.ok(restartSyncAt > source.indexOf('await rebaseFilePaths()'))
  assert.ok(restartSyncAt > source.indexOf('await startScheduler()'))
})
