import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-rebase-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db, setSetting } = await import('../src/db.js')
const { rebaseFilePaths, rebasePrefix, resetInterruptedImports } = await import('../src/sync.js')
const { libraryRootsSaveError, nestedRootsError, rootsAfterSaveOf } = await import('../src/library-roots.js')

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

test('rebaseFilePaths: a TV folder moved to its parent and back keeps one-off and film paths', async () => {
  await db('recordings').delete()
  await setSetting('media_root', '/data/media/tv')
  await setSetting('oneoff_root', '/data/media/one-offs')
  await setSetting('movies_root', '/data/media/movies')
  await rebaseFilePaths()
  await insertRecording('tv', { file_path: '/data/media/tv/The Block/Season 22/The Block - S22E36.ts', status: 'done' })
  await insertRecording('oneoff', { file_path: '/data/media/one-offs/Footy/Footy - 2026-10-04 1930.ts', status: 'done' })
  await insertRecording('film', { file_path: '/data/media/movies/Dune (2021)/Dune (2021).ts', status: 'done' })
  await setSetting('media_root', '/data/media')
  await rebaseFilePaths()
  await setSetting('media_root', '/data/media/tv')
  await rebaseFilePaths()
  assert.deepEqual(await filePaths(), {
    tv: '/data/media/tv/The Block/Season 22/The Block - S22E36.ts',
    oneoff: '/data/media/one-offs/Footy/Footy - 2026-10-04 1930.ts',
    film: '/data/media/movies/Dune (2021)/Dune (2021).ts',
  })
})

test('rebasePrefix: matches the old folder exactly, not as a pattern', async () => {
  await db('recordings').delete()
  await insertRecording('exact', { file_path: '/data/my_tv/A.ts', status: 'done' })
  await insertRecording('wildcard', { file_path: '/data/myXtv/B.ts', status: 'done' })
  await insertRecording('upper', { file_path: '/DATA/my_tv/C.ts', status: 'done' })
  assert.equal(await rebasePrefix({ from: '/data/my_tv', to: '/media/tv' }), 1)
  assert.deepEqual(await filePaths(), { exact: '/media/tv/A.ts', wildcard: '/data/myXtv/B.ts', upper: '/DATA/my_tv/C.ts' })
})

test('nestedRootsError: refuses library folders that are the same or sit inside each other', () => {
  assert.equal(nestedRootsError({ mediaRoot: '/data/media/tv', oneOffRoot: '/data/media/one-offs', moviesRoot: '' }), null)
  assert.match(nestedRootsError({ mediaRoot: '/data/media', oneOffRoot: '/data/media/one-offs', moviesRoot: '' }), /One-off folder \/data\/media\/one-offs is inside the Media root \/data\/media\./)
  assert.match(nestedRootsError({ mediaRoot: '/data/tv/', oneOffRoot: '/data/tv', moviesRoot: '' }), /same folder/)
  assert.equal(nestedRootsError({ mediaRoot: '/data/tv', oneOffRoot: '/data/tv-extra', moviesRoot: '' }), null)
})

test('libraryRootsSaveError: checks the folders only when the save changes one', () => {
  const nested = { mediaRoot: '/data/media', oneOffRoot: '/data/media/one-offs', moviesRoot: '' }
  assert.equal(libraryRootsSaveError({ before: nested, after: nested }), null)
  assert.match(libraryRootsSaveError({ before: { ...nested, mediaRoot: '/data/media/tv' }, after: nested }), /inside the Media root/)
})

test('rootsAfterSaveOf: uses the posted folders and falls back to the stored ones', async () => {
  const stored = { media_root: '/data/media/tv', oneoff_root: '/data/media/one-offs', movies_root: '/data/media/movies' }
  const read = async (key) => stored[key] ?? null
  assert.deepEqual(await rootsAfterSaveOf({ media_root: ' /data/media ' }, read), {
    mediaRoot: '/data/media',
    oneOffRoot: '/data/media/one-offs',
    moviesRoot: '/data/media/movies',
  })
})
