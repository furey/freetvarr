import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-library-items-')))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')
const store = await import('../src/plex-library-store.js')

const part = (patch = {}) => ({
  rating_key: '7', part_id: '70', section_id: '2', kind: 'episode', show_title: 'Show', season: 1, episode: 1, title: 'Pilot',
  file_path: '/data/media/tv/Show/Season 01/x.mkv', duration_s: 3600, watched_at: null, view_offset_s: 0, seen_at: 10, ...patch,
})

before(async () => {
  await db.migrate.latest()
  await db('settings').insert([{ key: 'plex_tv_section_id', value: '2' }, { key: 'plex_oneoff_section_id', value: '5' }])
})

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

beforeEach(async () => {
  await db('library_items').delete()
})

test('saveScannedItems: a full pass removes items Plex no longer lists; a quick pass keeps them', async () => {
  await store.saveScannedItems({ rows: [part(), part({ rating_key: '8', part_id: '80' })], full: true, sectionId: '2', seenAt: 10 })
  await store.saveScannedItems({ rows: [part({ seen_at: 20 })], full: false, sectionId: '2', seenAt: 20 })
  assert.equal((await db('library_items')).length, 2)
  await store.saveScannedItems({ rows: [part({ seen_at: 30 })], full: true, sectionId: '2', seenAt: 30 })
  assert.deepEqual((await db('library_items')).map((row) => row.rating_key), ['7'])
})

test('markItemWatched and saveItemPosition: change the item now and leave a change waiting for Plex', async () => {
  await store.saveScannedItems({ rows: [part()], full: true, sectionId: '2', seenAt: 10 })
  const result = await store.markItemWatched({ itemId: 'plex-7', watched: true, nowMs: 1000 })
  assert.equal(result.watched, true)
  assert.deepEqual(await store.loadPendingPushes(), [{ rating_key: '7', pending_push: 'scrobble', view_offset_s: 0, title: 'Pilot', show_title: 'Show', season: 1, episode: 1 }])
  await store.saveItemPosition({ itemId: 'plex-7', seconds: 600, durationS: 3600, nowMs: 2000 })
  assert.equal((await db('library_items').first()).pending_push, 'progress')
  await store.saveItemPosition({ itemId: 'plex-7', seconds: 3590, durationS: 3600, nowMs: 3000 })
  assert.equal((await db('library_items').first()).pending_push, 'scrobble')
  await store.clearPendingPush({ ratingKey: '7', action: 'scrobble' })
  assert.deepEqual(await store.loadPendingPushes(), [])
  assert.equal(await store.markItemWatched({ itemId: 'plex-404', watched: true }), null)
})

test('a scan keeps a waiting local change instead of the older Plex value', async () => {
  await store.saveScannedItems({ rows: [part()], full: true, sectionId: '2', seenAt: 10 })
  await store.markItemWatched({ itemId: 'plex-7', watched: true, nowMs: 1000 })
  await store.saveScannedItems({ rows: [part({ watched_at: null, seen_at: 20 })], full: true, sectionId: '2', seenAt: 20 })
  assert.equal(Number((await db('library_items').first()).watched_at), 1000)
})

test('loadLibraryItemRows and plexItemPlaybackRow: follow the switch and play a downloaded copy first', async () => {
  await store.saveScannedItems({ rows: [part({ recording_id: 'r1', part_id: '71' }), part({ view_offset_s: 120 })], full: true, sectionId: '2', seenAt: 10 })
  assert.equal((await store.loadLibraryItemRows()).length, 2)
  const row = await store.plexItemPlaybackRow({ itemId: 'plex-7' })
  assert.equal(row.file_path, '/data/media/tv/Show/Season 01/x.mkv')
  assert.equal(row.playback_position_s, 120)
  await store.saveWholeLibrarySettings({ enabled: false })
  assert.deepEqual(await store.loadLibraryItemRows(), [])
  await store.saveWholeLibrarySettings({ enabled: true })
})
