import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-classification-shift-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

const migrateTo = async (name) => {
  while (!(await db.migrate.list())[0].some((done) => done.name === name)) await db.migrate.up()
}

test('migration 0041: labels and categories gain a shift column, and rollback keeps the base-channel rows', async () => {
  await migrateTo('0040_log_cleared.js')
  await db('programme_classifications').insert({ title_key: 'gogglebox', start_ms: 1000, label: 'M' })
  await db('programme_categories').insert({ title_key: 'gogglebox', start_ms: 1000, category: 'reality' })
  await db.migrate.latest()
  assert.deepEqual(await db('programme_classifications').select('*'), [{ title_key: 'gogglebox', start_ms: 1000, shift_hours: 0, label: 'M' }])
  assert.deepEqual(await db('programme_categories').select('*'), [{ title_key: 'gogglebox', start_ms: 1000, shift_hours: 0, category: 'reality' }])
  await db('programme_classifications').insert({ title_key: 'gogglebox', start_ms: 1000, shift_hours: 1, label: 'MA15+' })
  await db('programme_categories').insert({ title_key: 'gogglebox', start_ms: 1000, shift_hours: 1, category: 'reality' })
  await db.migrate.down()
  assert.deepEqual(await db('programme_classifications').select('*'), [{ title_key: 'gogglebox', start_ms: 1000, label: 'M' }])
  assert.deepEqual(await db('programme_categories').select('*'), [{ title_key: 'gogglebox', start_ms: 1000, category: 'reality' }])
  await db.migrate.latest()
  assert.equal((await db('programme_classifications').select('*'))[0].shift_hours, 0)
})
