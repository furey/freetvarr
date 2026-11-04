import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-watched-position-')))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')
const { watchedAtAfterPosition } = await import('../src/library.js')
const { playedDurationOf } = await import('../src/playback.js')

const RECORDING_ID = 'rec-1'
const NOW_ISO = '2026-11-04T10:00:00.000Z'

before(async () => {
  await db.migrate.latest()
})

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

beforeEach(async () => {
  await db('recordings').delete()
  await db('recordings').insert({ recording_id: RECORDING_ID, title: 'The Block', status: 'done', duration_s: 3600 })
})

const savePosition = async ({ seconds, playedDurationS }) => {
  await db('recordings').where({ recording_id: RECORDING_ID })
    .update({ watched_at: watchedAtAfterPosition({ seconds, playedDurationS, nowIso: NOW_ISO }) })
  return (await db('recordings').where({ recording_id: RECORDING_ID }).first()).watched_at
}

test('a play to the end of a file shorter than the guide length sets watched', async () => {
  assert.equal(await savePosition({ seconds: 3360, playedDurationS: 3360 }), NOW_ISO)
})

test('the guide length still applies when the played file is longer', async () => {
  assert.equal(await savePosition({ seconds: 3360, playedDurationS: 4320 }), null)
  assert.equal(await savePosition({ seconds: 3600, playedDurationS: 4320 }), NOW_ISO)
})

test('with no played length the guide length decides', async () => {
  assert.equal(await savePosition({ seconds: 3360 }), null)
  assert.equal(await savePosition({ seconds: 3580 }), NOW_ISO)
})

test('playedDurationOf: reads the length of the active session for the recording', () => {
  const sessions = [
    { recordingId: 'other', duration: 100 },
    { recordingId: RECORDING_ID, duration: 3360 },
  ]
  assert.equal(playedDurationOf({ sessions, recordingId: RECORDING_ID }), 3360)
  assert.equal(playedDurationOf({ sessions, recordingId: 'missing' }), null)
  assert.equal(playedDurationOf({ sessions: [{ recordingId: RECORDING_ID, duration: null }], recordingId: RECORDING_ID }), null)
})
