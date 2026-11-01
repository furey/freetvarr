import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-origin-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

const migrateTo = async (name) => {
  while (!(await db.migrate.list())[0].some((done) => done.name === name)) await db.migrate.up()
}

test('migration 0039: a sync-made folder is automatic unless you asked for a series recording of that title', async () => {
  await migrateTo('0038_kept_folder.js')
  await db('shows').insert([
    { id: 1, show_pattern: 'Rugby League World Cup 2026', dest_folder: 'Rugby League World Cup 2026', identity_state: 'none' },
    { id: 2, show_pattern: 'NRL Friday Night Football', dest_folder: 'NRL Friday Night Football', identity_state: 'none' },
    { id: 3, show_pattern: 'AFLW', dest_folder: 'AFLW', identity_state: 'none' },
    { id: 4, show_pattern: 'The Block', dest_folder: 'The Block', identity_state: null },
  ])
  await db('user_events').insert([
    { ts: 1, kind: 'record_request', series_key: 'nrl-friday-night-football', title: 'NRL Friday Night Football', meta_json: '{"type":"series","enabled":true}' },
    { ts: 2, kind: 'record_request', series_key: 'rugby-league-world-cup-2026', title: 'Rugby League World Cup 2026', meta_json: '{"type":"episode"}' },
  ])
  await db('watchlist').insert({ title: 'AFLW', title_key: 'aflw', mode: 'record', series_link_id: 'link-1' })
  await db.migrate.latest()
  const origins = Object.fromEntries((await db('shows').select('id', 'origin')).map((row) => [row.id, row.origin]))
  assert.deepEqual(origins, { 1: 'auto', 2: 'user', 3: 'user', 4: 'user' })
})
