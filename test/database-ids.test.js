import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { needsDatabaseIds, settleDatabaseIds } from '../src/database-ids.js'
import { FOLDER_MISSING, FOLDER_UNWRITABLE, ONE_OFF_PLACEHOLDER, hasRecordingFiles, keepOneOffFolder } from '../src/one-off-placeholder.js'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 10, 2)
const sport = [{ genres: [0x40] }]

const rowOf = (title) => ({ recording_id: title, title, show_id: null, genres_json: '[64]', aired_at: NOW - DAY })

test('needsDatabaseIds: asks for unknown titles and for a no-id answer older than 30 days', () => {
  assert.equal(needsDatabaseIds({ recordings: sport, nowMs: NOW }), true)
  assert.equal(needsDatabaseIds({ recordings: sport, evidence: { databaseIds: 'none', databaseIdsAt: NOW - 29 * DAY }, nowMs: NOW }), false)
  assert.equal(needsDatabaseIds({ recordings: sport, evidence: { databaseIds: 'none', databaseIdsAt: NOW - 30 * DAY }, nowMs: NOW }), true)
  assert.equal(needsDatabaseIds({ recordings: sport, evidence: { databaseIds: 'found', databaseIdsAt: NOW - 400 * DAY }, nowMs: NOW }), false)
  assert.equal(needsDatabaseIds({ recordings: sport, override: 'show', nowMs: NOW }), false)
  assert.equal(needsDatabaseIds({ recordings: [{ genres: [0x30] }], nowMs: NOW }), false)
})

test('settleDatabaseIds: titles still waiting for an answer step aside so others get asked', async () => {
  const titles = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7']
  const inputs = { rows: titles.map(rowOf), shows: [], evidence: new Map(), overrides: new Map(), ruleKeys: new Set() }
  const asked = []
  const identityFor = async ({ title, wait }) => {
    if (wait === 5000) asked.push(title)
    return { state: 'pending', identity: null, candidates: [] }
  }
  const retries = new Map()
  const save = async () => true
  await settleDatabaseIds({ inputs, identityFor, retries, save, nowMs: NOW })
  assert.deepEqual(asked, ['A1', 'A2', 'A3', 'A4', 'A5'])
  asked.length = 0
  await settleDatabaseIds({ inputs, identityFor, retries, save, nowMs: NOW + 60_000 })
  assert.deepEqual(asked, ['A6', 'A7'])
})

test('keepOneOffFolder: a folder Freetvarr cannot write to says so', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-readonly-'))
  try {
    await fs.chmod(folder, 0o555)
    assert.equal(await keepOneOffFolder(folder), FOLDER_UNWRITABLE)
    assert.equal(await keepOneOffFolder(path.join(folder, 'missing')), FOLDER_MISSING)
  } finally {
    await fs.chmod(folder, 0o755)
    await fs.rm(folder, { recursive: true, force: true })
  }
})

test('hasRecordingFiles: only video files count, not NAS index folders, .DS_Store, or the placeholder', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-oneoffs-'))
  try {
    await fs.mkdir(path.join(folder, '@eaDir', 'Show.ts@SynoEAStream'), { recursive: true })
    await fs.writeFile(path.join(folder, '@eaDir', 'Show.ts@SynoEAStream', 'SYNOVIDEO_VIDEO_SCREENSHOT.jpg'), 'x')
    await fs.writeFile(path.join(folder, '.DS_Store'), 'x')
    await fs.writeFile(path.join(folder, ONE_OFF_PLACEHOLDER), '')
    await fs.mkdir(path.join(folder, 'Melbourne Cup'))
    await fs.writeFile(path.join(folder, 'Melbourne Cup', 'notes.txt'), 'x')
    assert.equal(await hasRecordingFiles(folder), false)
    await fs.writeFile(path.join(folder, 'Melbourne Cup', 'Melbourne Cup - 2026-11-03 1500.ts'), 'video')
    assert.equal(await hasRecordingFiles(folder), true)
  } finally {
    await fs.rm(folder, { recursive: true, force: true })
  }
})
