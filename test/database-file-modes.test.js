import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { restrictDatabaseFiles } from '../src/database-file-modes.js'

test('restrictDatabaseFiles: makes the database and its WAL files readable only by their owner', async () => {
  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-db-mode-'))
  const dbPath = path.join(configDir, 'state.db')
  for (const file of [dbPath, `${dbPath}-wal`]) await fs.writeFile(file, '', { mode: 0o644 })
  const restricted = await restrictDatabaseFiles({ dbPath })
  assert.deepEqual(restricted, [dbPath, `${dbPath}-wal`])
  for (const file of restricted) assert.equal((await fs.stat(file)).mode & 0o777, 0o600)
  await fs.rm(configDir, { recursive: true, force: true })
})
