import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-remove-pending-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

const migrateTo = async (name) => {
  for (;;) {
    const [done, pending] = await db.migrate.list()
    if (done.some((migration) => migration.name === name)) return
    if (!pending.some((migration) => migration.file === name)) throw new Error(`migration ${name} does not exist`)
    await db.migrate.up()
  }
}

test('migration 0042: adds tvh_remove_pending_at, and rollback drops it and keeps the rows', async () => {
  await migrateTo('0041_classification_shift.js')
  await db('recordings').insert({ recording_id: 'r1', title: 'The Block', status: 'done' })
  await migrateTo('0042_tvh_remove_pending.js')
  const PENDING_AT = '2026-11-04T08:00:00.000Z'
  await db('recordings').where({ recording_id: 'r1' }).update({ tvh_remove_pending_at: PENDING_AT })
  assert.equal((await db('recordings').first()).tvh_remove_pending_at, PENDING_AT)
  await db.migrate.down()
  const rows = await db('recordings').select('*')
  assert.deepEqual(rows.map((row) => row.recording_id), ['r1'])
  assert.equal('tvh_remove_pending_at' in rows[0], false)
})
