import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-pragmas-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

const pragmaOf = async (name) => Object.values((await db.raw(`PRAGMA ${name}`))[0])[0]

test('the state database writes through a WAL journal so commits skip the per-write fsync', async () => {
  assert.equal(await pragmaOf('journal_mode'), 'wal')
})

test('the state database syncs at checkpoints, not on every commit', async () => {
  assert.equal(await pragmaOf('synchronous'), 1)
})
