import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-library-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')
const { findReplacement, libraryStateOf, sweepLibraryStates } = await import('../src/library-files.js')

const seasonDir = path.join(tmpDir, 'tv', 'My Kitchen Rules', 'Season 16')
const fileIn = (name) => path.join(seasonDir, name)
const ours = (n) => fileIn(`My Kitchen Rules - S16E0${n} - Episode ${n} of Season 16.ts`)
const sonarrs = (n) => fileIn(`My Kitchen Rules - S16E0${n} - Episode ${n} WEBDL-720p.mkv`)

before(async () => {
  await db.migrate.latest()
  await fs.mkdir(seasonDir, { recursive: true })
  await fs.writeFile(ours(4), '')
  await fs.writeFile(sonarrs(4), '')
  await fs.writeFile(sonarrs(5), '')
  await fs.writeFile(`${ours(6)}.orig`, '')
})

after(async () => {
  await db.destroy()
})

const row = (episode, fields = {}) => ({
  recording_id: `e${episode}`,
  title: 'My Kitchen Rules',
  season: 16,
  episode,
  status: 'done',
  file_path: ours(episode),
  ...fields,
})

test('libraryStateOf: a file still in place stays imported', async () => {
  assert.deepEqual(await libraryStateOf(row(4)), { state: null, replacement: null })
})

test('libraryStateOf: a gone file with another copy of the episode is replaced', async () => {
  assert.deepEqual(await libraryStateOf(row(5)), { state: 'replaced', replacement: sonarrs(5) })
})

test('libraryStateOf: a gone file with no other copy is not in the library', async () => {
  assert.deepEqual(await libraryStateOf(row(6)), { state: 'not_in_library', replacement: null })
})

test('libraryStateOf: only checks imported recordings', async () => {
  assert.deepEqual(await libraryStateOf(row(6, { status: 'not_imported' })), { state: null, replacement: null })
})

test('findReplacement: needs a season and episode to match on', async () => {
  assert.equal(await findReplacement(row(5, { season: null })), null)
})

test('sweepLibraryStates: saves each state and clears it once the file is back', async () => {
  await db('recordings').insert([row(4), row(5), row(6)])
  await sweepLibraryStates()
  const states = async () => Object.fromEntries(
    (await db('recordings').select('recording_id', 'library_state')).map((r) => [r.recording_id, r.library_state]),
  )
  assert.deepEqual(await states(), { e4: null, e5: 'replaced', e6: 'not_in_library' })
  await fs.writeFile(ours(6), '')
  await sweepLibraryStates()
  assert.equal((await states()).e6, null)
})
