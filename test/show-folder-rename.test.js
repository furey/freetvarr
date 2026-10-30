import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-folder-rename-')))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db, setSetting } = await import('../src/db.js')
const { planFolderFix, renameShowFolder } = await import('../src/show-folder-rename.js')
const { ensureShowFolder } = await import('../src/show-folders.js')

const AU_IDENTITY = { name: 'Big Brother (AU)', tvdbId: '76237', tmdbId: null }
const NEW_FOLDER = 'Big Brother (AU) {tvdb-76237}'
let mediaRoot
let showId
let episodePath

const options = (overrides = {}) => ({
  showId,
  mediaRootOf: async () => mediaRoot,
  refreshPlex: async () => ({ triggered: true }),
  isSyncRunning: () => false,
  isRecordingBusy: () => false,
  ...overrides,
})

before(async () => {
  await db.migrate.latest()
})

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

beforeEach(async () => {
  await db('library_items').delete()
  await db('recordings').delete()
  await db('shows').delete()
  mediaRoot = await fs.mkdtemp(path.join(tmpDir, 'tv-'))
  episodePath = path.join(mediaRoot, 'Big Brother', 'Season 17', 'Big Brother - S17E06.ts')
  await fs.mkdir(path.dirname(episodePath), { recursive: true })
  await fs.writeFile(episodePath, 'video')
  await fs.writeFile(`${episodePath}.orig`, 'backup')
  const [id] = await db('shows').insert({ show_pattern: 'Big Brother', dest_folder: 'Big Brother' })
  showId = id
  await db('recordings').insert([
    { recording_id: 'r1', show_id: showId, title: 'Big Brother', season: 17, episode: 6, file_path: episodePath, status: 'done' },
    { recording_id: 'r2', title: 'Big Brother Late', file_path: path.join(mediaRoot, 'Big Brother Late', 'e1.ts'), status: 'done' },
  ])
  await db('library_items').insert({ rating_key: '10', part_id: '1', section_id: '2', kind: 'episode', file_path: episodePath, seen_at: 1 })
})

const folderNames = async () => (await fs.readdir(mediaRoot)).sort()

test('planFolderFix: shows the new name and how many recordings move', async () => {
  const plan = await planFolderFix(options({ identityFor: async () => AU_IDENTITY }))
  assert.equal(plan.state, 'ready')
  assert.equal(plan.from, 'Big Brother')
  assert.equal(plan.to, NEW_FOLDER)
  assert.equal(plan.recordings, 1)
  assert.equal(plan.folderExists, true)
})

test('planFolderFix: uses the stored identity without a lookup', async () => {
  await db('shows').where({ id: showId }).update({ tvdb_id: '76237', database_title: 'Big Brother (AU)' })
  const plan = await planFolderFix(options({ identityFor: async () => { throw new Error('no lookup expected') } }))
  assert.equal(plan.to, NEW_FOLDER)
})

test('planFolderFix: no match keeps the folder as it is', async () => {
  const plan = await planFolderFix(options({ identityFor: async () => null }))
  assert.equal(plan.state, 'no-match')
})

test('renameShowFolder: renames the folder and updates every stored path in one go', async () => {
  let refreshed = 0
  const result = await renameShowFolder(options({ to: NEW_FOLDER, identity: AU_IDENTITY, refreshPlex: async () => { refreshed++ } }))
  assert.equal(result.moved, true)
  assert.equal(result.recordings, 1)
  assert.equal(refreshed, 1)
  assert.deepEqual(await folderNames(), [NEW_FOLDER])
  const moved = path.join(mediaRoot, NEW_FOLDER, 'Season 17', 'Big Brother - S17E06.ts')
  assert.equal(await fs.readFile(moved, 'utf8'), 'video')
  assert.equal(await fs.readFile(`${moved}.orig`, 'utf8'), 'backup')
  const show = await db('shows').where({ id: showId }).first()
  assert.equal(show.dest_folder, NEW_FOLDER)
  assert.equal(show.tvdb_id, '76237')
  assert.equal(show.database_title, 'Big Brother (AU)')
  assert.equal((await db('recordings').where({ recording_id: 'r1' }).first()).file_path, moved)
  assert.equal((await db('recordings').where({ recording_id: 'r2' }).first()).file_path, path.join(mediaRoot, 'Big Brother Late', 'e1.ts'))
  assert.equal((await db('library_items').first()).file_path, moved)
})

test('renameShowFolder: an existing target folder stops the rename', async () => {
  await fs.mkdir(path.join(mediaRoot, NEW_FOLDER))
  await assert.rejects(renameShowFolder(options({ to: NEW_FOLDER })), { code: 'target-exists' })
  assert.equal((await db('shows').where({ id: showId }).first()).dest_folder, 'Big Brother')
  assert.equal(await fs.readFile(episodePath, 'utf8'), 'video')
})

test('renameShowFolder: a cross-device rename leaves the database unchanged', async () => {
  const fsApi = { ...fs, rename: async () => { throw Object.assign(new Error('EXDEV'), { code: 'EXDEV' }) } }
  await assert.rejects(renameShowFolder(options({ to: NEW_FOLDER, fsApi })), { code: 'cross-device' })
  assert.equal((await db('shows').where({ id: showId }).first()).dest_folder, 'Big Brother')
  assert.equal((await db('recordings').where({ recording_id: 'r1' }).first()).file_path, episodePath)
})

test('renameShowFolder: a failed commit renames the folder back', async () => {
  const failingCommit = Object.assign((...args) => db(...args), {
    transaction: (work) => db.transaction(async (trx) => {
      await work(trx)
      throw new Error('disk full')
    }),
  })
  await assert.rejects(renameShowFolder(options({ to: NEW_FOLDER, database: failingCommit })), /disk full/)
  assert.deepEqual(await folderNames(), ['Big Brother'])
  assert.equal(await fs.readFile(episodePath, 'utf8'), 'video')
  assert.equal((await db('shows').where({ id: showId }).first()).dest_folder, 'Big Brother')
  assert.equal((await db('recordings').where({ recording_id: 'r1' }).first()).file_path, episodePath)
  assert.equal((await db('library_items').first()).file_path, episodePath)
})

test('renameShowFolder: refuses while a sync runs or ad removal works on an episode', async () => {
  await assert.rejects(renameShowFolder(options({ to: NEW_FOLDER, isSyncRunning: () => true })), { code: 'busy' })
  await assert.rejects(renameShowFolder(options({ to: NEW_FOLDER, isRecordingBusy: (id) => id === 'r1' })), { code: 'busy' })
  assert.deepEqual(await folderNames(), ['Big Brother'])
})

test('renameShowFolder: refuses a name outside the TV folder', async () => {
  await assert.rejects(renameShowFolder(options({ to: '../elsewhere' })), { code: 'bad-name' })
})

test('renameShowFolder: with no folder on disk yet, only the saved folder changes', async () => {
  await fs.rm(path.join(mediaRoot, 'Big Brother'), { recursive: true })
  const result = await renameShowFolder(options({ to: NEW_FOLDER }))
  assert.equal(result.moved, false)
  assert.equal((await db('shows').where({ id: showId }).first()).dest_folder, NEW_FOLDER)
  assert.deepEqual(await folderNames(), [])
})

test('ensureShowFolder: a new series gets the database title and id folder, and stores the ids', async () => {
  await setSetting('media_root', mediaRoot)
  const seen = []
  const identityFor = async (request) => {
    seen.push(request)
    return { name: 'Gruen', tvdbId: '83281', tmdbId: null }
  }
  const show = await ensureShowFolder({ title: 'Gruen', shows: [], channelName: 'ABC TV', episodes: [{ season: 16, episode: 2 }], identityFor })
  assert.equal(show.created, true)
  assert.equal(show.dest_folder, 'Gruen {tvdb-83281}')
  assert.equal(show.tvdb_id, '83281')
  assert.equal(show.database_title, 'Gruen')
  assert.deepEqual(seen, [{ title: 'Gruen', channelName: 'ABC TV', episodes: [{ season: 16, episode: 2 }] }])
})

test('ensureShowFolder: a failed lookup keeps the bare title', async () => {
  await setSetting('media_root', mediaRoot)
  const show = await ensureShowFolder({ title: 'Hard Quiz', shows: [], identityFor: async () => { throw new Error('offline') } })
  assert.equal(show.dest_folder, 'Hard Quiz')
  assert.equal(show.tvdb_id, null)
})
