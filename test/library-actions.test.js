import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  compareEpisodeOrder,
  findPlexLink,
  getRecordingPlexLink,
  matchPlexItem,
  needsWatchedChange,
  plexDetailsUrl,
  plexPartFilesOf,
  plexRatingKeyOf,
  refreshShowArtwork,
  rowsThrough,
  setShowWatched,
  sharedTailLength,
} from '../src/library-actions.js'

const episode = (recording_id, season, number, aired_at = null) => ({
  recording_id,
  season,
  episode: number,
  aired_at,
  watched_at: null,
})

test('orders by season and episode, falling back to air date', () => {
  assert.ok(compareEpisodeOrder(episode('a', 1, 9), episode('b', 2, 1)) < 0)
  assert.ok(compareEpisodeOrder(episode('a', null, null, 10), episode('b', null, null, 20)) < 0)
  assert.ok(compareEpisodeOrder(episode('a', 1, 2, 99), episode('b', 1, 2, 1)) > 0)
})

test('rowsThrough keeps the target and all earlier episodes', () => {
  const rows = [episode('c', 1, 3), episode('a', 1, 1), episode('b', 1, 2), episode('d', 2, 1)]
  const ids = rowsThrough({ rows, recordingId: 'b' }).map((r) => r.recording_id).sort()
  assert.deepEqual(ids, ['a', 'b'])
  assert.equal(rowsThrough({ rows, recordingId: 'zzz' }), null)
})

test('needsWatchedChange skips rows already in the target state', () => {
  assert.equal(needsWatchedChange({ row: { watched_at: null }, watched: true }), true)
  assert.equal(needsWatchedChange({ row: { watched_at: 'x' }, watched: true }), false)
  assert.equal(needsWatchedChange({ row: { watched_at: null, playback_position_s: null }, watched: false }), false)
  assert.equal(needsWatchedChange({ row: { watched_at: null, playback_position_s: 40 }, watched: false }), true)
})

test('setShowWatched marks only changed rows through the chosen episode', async () => {
  const rows = [
    { ...episode('a', 1, 1), watched_at: 'x' },
    episode('b', 1, 2),
    episode('c', 1, 3),
  ]
  const calls = []
  const result = await setShowWatched({
    key: 'show',
    watched: true,
    throughRecordingId: 'b',
    loadRows: async () => rows,
    setWatched: async (args) => calls.push(args),
  })
  assert.deepEqual(result, { changed: 1, recording_ids: ['b'] })
  assert.deepEqual(calls, [{ recordingId: 'b', watched: true }])
})

test('setShowWatched reports unknown shows and unknown through ids', async () => {
  assert.equal(await setShowWatched({ key: 'x', watched: true, loadRows: async () => [] }), null)
  const result = await setShowWatched({
    key: 'x',
    watched: true,
    throughRecordingId: 'nope',
    loadRows: async () => [episode('a', 1, 1)],
  })
  assert.deepEqual(result, { missingThrough: true })
})

test('refreshShowArtwork clears recording artwork and show cache', async () => {
  const removed = []
  const reset = []
  const forgotten = []
  const result = await refreshShowArtwork({
    key: 'show',
    loadRows: async () => [
      { recording_id: 'a', title: 'Show' },
      { recording_id: 'b', title: 'Show' },
    ],
    removeImage: async (args) => removed.push(args.id),
    resetRows: async (ids) => reset.push(...ids),
    forgetShow: (title) => forgotten.push(title),
  })
  assert.deepEqual(result, { cleared: 3 })
  assert.deepEqual(removed, ['a', 'b'])
  assert.deepEqual(reset, ['a', 'b'])
  assert.deepEqual(forgotten, ['Show'])
  assert.equal(await refreshShowArtwork({ key: 'x', loadRows: async () => [] }), null)
})

test('plexDetailsUrl encodes the metadata key', () => {
  assert.equal(
    plexDetailsUrl({ machineIdentifier: 'abc123', ratingKey: '42' }),
    'https://app.plex.tv/desktop#!/server/abc123/details?key=%2Flibrary%2Fmetadata%2F42',
  )
})

test('matches Plex parts by the longest shared path tail', () => {
  const items = [
    { ratingKey: 1, Media: [{ Part: [{ file: '/data/tv/Other/S01E01.mkv' }] }] },
    { ratingKey: 2, Media: [{ Part: [{ file: '/media/tv/Show/Season 1/S01E01.mkv' }] }] },
  ]
  assert.equal(matchPlexItem({ items, filePath: '/mnt/tv/Show/Season 1/S01E01.mkv' }).ratingKey, 2)
  assert.equal(matchPlexItem({ items, filePath: '/mnt/tv/Show/Season 1/other.mkv' }), null)
  assert.equal(matchPlexItem({ items, filePath: null }), null)
  assert.equal(sharedTailLength('/a/b/c.mkv', '/x/b/c.mkv'), 2)
  assert.deepEqual(plexPartFilesOf({ Media: { Part: { file: 'f' } } }), ['f'])
})

test('plexRatingKeyOf picks the show key at show level', () => {
  const item = { ratingKey: 5, grandparentRatingKey: 9 }
  assert.equal(plexRatingKeyOf({ item, level: 'show' }), '9')
  assert.equal(plexRatingKeyOf({ item, level: 'episode' }), '5')
  assert.equal(plexRatingKeyOf({ item: { ratingKey: 5 }, level: 'show' }), '5')
})

test('findPlexLink builds a link, or says why not', async () => {
  const base = {
    filePaths: ['/mnt/tv/Show/S01E01.mkv'],
    getConnection: async () => ({ url: 'http://plex', token: 't' }),
    fetchIdentifier: async () => 'machine',
    loadSections: async () => [{ id: '1', type: 'show' }],
    fetchItems: async () => [{ ratingKey: 7, grandparentRatingKey: 3, Media: [{ Part: [{ file: '/tv/Show/S01E01.mkv' }] }] }],
  }
  assert.equal((await findPlexLink(base)).url.endsWith('%2Flibrary%2Fmetadata%2F7'), true)
  assert.equal((await findPlexLink({ ...base, level: 'show' })).url.endsWith('%2Flibrary%2Fmetadata%2F3'), true)
  assert.match((await findPlexLink({ ...base, fetchItems: async () => [] })).reason, /not found/)
  assert.match((await findPlexLink({ ...base, getConnection: async () => { throw new Error('x') } })).reason, /not set up/)
  assert.match((await findPlexLink({ ...base, loadSections: async () => [] })).reason, /library/)
  assert.match((await findPlexLink({ ...base, fetchItems: async () => { throw new Error('boom') } })).reason, /could not be reached/)
})

test('getRecordingPlexLink handles missing rows and files', async () => {
  assert.equal(await getRecordingPlexLink({ recordingId: 'x', loadRow: async () => null }), null)
  const noFile = await getRecordingPlexLink({ recordingId: 'x', loadRow: async () => ({ file_path: null }) })
  assert.equal(noFile.url, null)
  const found = await getRecordingPlexLink({
    recordingId: 'x',
    loadRow: async () => ({ file_path: '/a/b.mkv' }),
    find: async ({ filePaths }) => ({ url: filePaths[0] }),
  })
  assert.equal(found.url, '/a/b.mkv')
})
