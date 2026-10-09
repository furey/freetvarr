import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-unconfigured-sync-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')
const { startSync } = await import('../src/sync.js')

before(async () => {
  await db.migrate.latest()
})

after(async () => {
  await db.destroy()
})

const syncRowCount = async () => Number((await db('syncs').count({ count: 'id' }).first()).count)

test('startSync: a scheduled sync skips without a history row while TVHeadend is not configured', async () => {
  const result = await startSync({ trigger: 'cron' })
  assert.equal(result.skipped, true)
  assert.match(result.reason, /TVHeadend URL is not configured/)
  assert.equal(await syncRowCount(), 0)
})

test('startSync: a manual sync reports the missing URL and leaves no history row', async () => {
  await assert.rejects(startSync({ trigger: 'manual' }), { code: 'no-url' })
  await assert.rejects(startSync({ trigger: 'manual-single', showId: 1 }), { code: 'no-url' })
  assert.equal(await syncRowCount(), 0)
})
