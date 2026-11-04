import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-log-cleared-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

const migrateTo = async (name) => {
  while (!(await db.migrate.list())[0].some((done) => done.name === name)) await db.migrate.up()
}

const CLEARED_AT = '2026-10-20T08:00:00.000Z'
const REMOVED_AT = '2026-10-12T11:03:00.000Z'

const recording = (overrides) => ({
  title: 'My Kitchen Rules',
  status: 'done',
  deleted_from_tvh_at: REMOVED_AT,
  purged_at: CLEARED_AT,
  ...overrides,
})

const stateOf = async () => Object.fromEntries((await db('recordings').select('recording_id', 'purged_at', 'log_cleared_at'))
  .map((row) => [row.recording_id, [row.purged_at, row.log_cleared_at ?? null]]))

test('migration 0040: a log clear of an imported row becomes log_cleared_at, and rollback restores purged_at', async () => {
  await migrateTo('0039_show_origin.js')
  await db('recordings').insert([
    recording({ recording_id: 'log-cleared' }),
    recording({ recording_id: 'library-deleted', library_deleted_at: CLEARED_AT }),
    recording({ recording_id: 'failed', status: 'failed' }),
    recording({ recording_id: 'kept', purged_at: null }),
  ])
  await migrateTo('0040_log_cleared.js')
  assert.deepEqual(await stateOf(), {
    'log-cleared': [null, CLEARED_AT],
    'library-deleted': [CLEARED_AT, null],
    failed: [CLEARED_AT, null],
    kept: [null, null],
  })
  await db.migrate.down()
  const rows = await db('recordings').select('*')
  assert.equal('log_cleared_at' in rows[0], false)
  assert.deepEqual(Object.fromEntries(rows.map((row) => [row.recording_id, row.purged_at])), {
    'log-cleared': CLEARED_AT,
    'library-deleted': CLEARED_AT,
    failed: CLEARED_AT,
    kept: null,
  })
})
