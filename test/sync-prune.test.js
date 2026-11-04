import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-prune-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')
const { pruneTombstonedRecordings } = await import('../src/sync.js')
const { isLibraryMember } = await import('../src/library.js')
const { findArtwork, saveArtwork } = await import('../src/artwork.js')

const DAY_MS = 24 * 60 * 60 * 1000

const daysAgo = (days) => new Date(Date.now() - days * DAY_MS).toISOString()

const recording = (overrides) => ({
  title: 'My Kitchen Rules',
  season: 16,
  episode: 6,
  status: 'done',
  file_path: '/media/tv/My Kitchen Rules/Season 16/My Kitchen Rules - S16E06.ts',
  deleted_from_tvh_at: daysAgo(31),
  purged_at: null,
  ...overrides,
})

const remainingIds = async () => (await db('recordings').orderBy('recording_id').pluck('recording_id'))

const saveOldArtwork = async (id) => {
  const relative = await saveArtwork({
    kind: 'recording',
    id,
    image: { body: Buffer.from('png'), contentType: 'image/png' },
    shrink: async (image) => image,
  })
  const file = path.join(tmpDir, 'artwork', relative)
  const old = new Date(Date.now() - 20 * DAY_MS)
  await fs.utimes(file, old, old)
}

before(async () => {
  await db.migrate.latest()
})

beforeEach(async () => {
  await db('recordings').delete()
})

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

test('pruneTombstonedRecordings: keeps an imported library item 31 days after TVHeadend removed it', async () => {
  await db('recordings').insert([
    recording({ recording_id: 'done' }),
    recording({ recording_id: 'partial', status: 'partial' }),
  ])
  await pruneTombstonedRecordings()
  assert.deepEqual(await remainingIds(), ['done', 'partial'])
  const row = await db('recordings').where({ recording_id: 'done' }).first()
  assert.equal(isLibraryMember(row), true)
})

test('pruneTombstonedRecordings: deletes a purged imported row 31 days after TVHeadend removed it', async () => {
  await db('recordings').insert(recording({ recording_id: 'purged', purged_at: daysAgo(31) }))
  await pruneTombstonedRecordings()
  assert.deepEqual(await remainingIds(), [])
})

test('pruneTombstonedRecordings: deletes failed and skipped rows 31 days after TVHeadend removed them', async () => {
  await db('recordings').insert([
    recording({ recording_id: 'failed', status: 'failed', file_path: null }),
    recording({ recording_id: 'skipped', status: 'skipped', file_path: null }),
  ])
  await pruneTombstonedRecordings()
  assert.deepEqual(await remainingIds(), [])
})

test('pruneTombstonedRecordings: keeps every row at 29 days', async () => {
  await db('recordings').insert([
    recording({ recording_id: 'done', deleted_from_tvh_at: daysAgo(29) }),
    recording({ recording_id: 'purged', deleted_from_tvh_at: daysAgo(29), purged_at: daysAgo(29) }),
    recording({ recording_id: 'failed', deleted_from_tvh_at: daysAgo(29), status: 'failed' }),
  ])
  await pruneTombstonedRecordings()
  assert.deepEqual(await remainingIds(), ['done', 'failed', 'purged'])
})

test('pruneTombstonedRecordings: keeps a log-cleared row in the library', async () => {
  await db('recordings').insert(recording({ recording_id: 'cleared', log_cleared_at: daysAgo(31) }))
  await pruneTombstonedRecordings()
  const row = await db('recordings').where({ recording_id: 'cleared' }).first()
  assert.equal(isLibraryMember(row), true)
})

test('pruneTombstonedRecordings: keeps a purged row until its cut original expires', async () => {
  await db('recordings').insert(recording({ recording_id: 'cut', purged_at: daysAgo(31), ad_backup_saved_at: daysAgo(31) }))
  await pruneTombstonedRecordings()
  assert.deepEqual(await remainingIds(), ['cut'])
  await db('recordings').where({ recording_id: 'cut' }).update({ ad_backup_saved_at: null })
  await pruneTombstonedRecordings()
  assert.deepEqual(await remainingIds(), [])
})

test('pruneTombstonedRecordings: keeps the artwork of a kept library item and drops the pruned one', async () => {
  await db('recordings').insert([
    recording({ recording_id: 'kept' }),
    recording({ recording_id: 'gone', purged_at: daysAgo(31) }),
  ])
  await saveOldArtwork('kept')
  await saveOldArtwork('gone')
  await pruneTombstonedRecordings()
  assert.ok(await findArtwork({ kind: 'recording', id: 'kept' }))
  assert.equal(await findArtwork({ kind: 'recording', id: 'gone' }), null)
})
