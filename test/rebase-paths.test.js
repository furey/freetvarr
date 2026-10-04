import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-rebase-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db, setSetting } = await import('../src/db.js')
const { rebaseFilePaths, resetInterruptedImports } = await import('../src/sync.js')

before(async () => {
  await db.migrate.latest()
})

after(async () => {
  await db.destroy()
})

const insertRecording = (recording_id, fields) =>
  db('recordings').insert({ recording_id, title: recording_id, ...fields })

const filePaths = async () =>
  Object.fromEntries((await db('recordings').select('recording_id', 'file_path')).map((r) => [r.recording_id, r.file_path]))

test('rebaseFilePaths: remembers the roots first, then moves stored paths when a root changes', async () => {
  await setSetting('media_root', '/media/tv')
  await setSetting('oneoff_root', '/media/one-offs')
  await insertRecording('tv', { file_path: '/media/tv/The Block/Season 22/The Block - S22E36.ts', status: 'done' })
  await insertRecording('oneoff', { file_path: '/media/one-offs/NRL Grand Final/NRL Grand Final - 2026-10-04 1930.ts', status: 'done' })
  await insertRecording('tvlike', { file_path: '/media/tvx/Other.ts', status: 'done' })
  await insertRecording('none', { file_path: null, status: 'not_imported' })
  assert.equal(await rebaseFilePaths(), 0)

  await setSetting('media_root', '/data/media/tv/')
  await setSetting('oneoff_root', '/data/media/one-offs')
  assert.equal(await rebaseFilePaths(), 2)
  assert.deepEqual(await filePaths(), {
    tv: '/data/media/tv/The Block/Season 22/The Block - S22E36.ts',
    oneoff: '/data/media/one-offs/NRL Grand Final/NRL Grand Final - 2026-10-04 1930.ts',
    tvlike: '/media/tvx/Other.ts',
    none: null,
  })
  assert.equal(await rebaseFilePaths(), 0)
})

test('resetInterruptedImports: an import cut off by a restart goes back to pending', async () => {
  await insertRecording('stuck', { status: 'importing', error: 'x' })
  await resetInterruptedImports()
  const row = await db('recordings').where({ recording_id: 'stuck' }).first()
  assert.equal(row.status, 'pending')
  assert.equal(row.error, null)
})
