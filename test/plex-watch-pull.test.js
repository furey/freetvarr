import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-plex-watch-pull-')))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')
const { applyPull } = await import('../src/plex-watch.js')

before(async () => {
  await db.migrate.latest()
})

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

test('applyPull writes only when watched and resume point still match what the run read', async () => {
  await db('recordings').insert({ recording_id: 'r1', title: 'Show', status: 'done', watched_at: null, playback_position_s: 120 })
  const stale = await applyPull({ recordingId: 'r1', patch: { watched_at: '2026-10-30T10:00:00.000Z' }, expected: { watched_at: null, playback_position_s: 60 } })
  assert.equal(stale, 0)
  assert.equal((await db('recordings').where({ recording_id: 'r1' }).first()).watched_at, null)
  const fresh = await applyPull({ recordingId: 'r1', patch: { watched_at: '2026-10-30T10:00:00.000Z' }, expected: { watched_at: null, playback_position_s: 120 } })
  assert.equal(fresh, 1)
  assert.equal((await db('recordings').where({ recording_id: 'r1' }).first()).watched_at, '2026-10-30T10:00:00.000Z')
})
