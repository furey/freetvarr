import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'

import {
  baseShowTitleOf,
  isPlexItemId,
  isSameFileByTail,
  itemIdOf,
  libraryItemRowsOf,
  localPathOf,
  mergeWithRecordings,
  NEW_FOR_MS,
  plexLibraryRowsOf,
  ratingKeyOfItemId,
  shownTitlesOf,
} from '../src/plex-library.js'
import { getLibraryShow, getLibraryShows, getLibraryEpisodes, groupKeyOf } from '../src/library.js'

const NOW = Date.parse('2026-10-30T10:00:00Z')
const TV = { id: '2', type: 'show' }
const MOVIES = { id: '1', type: 'movie' }

const episode = (key, patch = {}) => ({
  ratingKey: key,
  grandparentTitle: 'My Kitchen Rules',
  grandparentRatingKey: '900',
  parentIndex: 16,
  index: Number(key) % 100,
  title: `Episode ${key}`,
  originallyAvailableAt: '2026-10-01',
  duration: 3600000,
  addedAt: (NOW - 2 * 86400000) / 1000,
  summary: 'Cooking.',
  thumb: `/library/metadata/${key}/thumb/1`,
  viewCount: 0,
  viewOffset: 0,
  Media: [{ id: Number(key) * 10, videoCodec: 'h264', videoResolution: '1080', audioCodec: 'aac', Part: [{ id: Number(key) * 100, file: `/data/media/tv/My Kitchen Rules/Season 16/MKR - S16E${String(Number(key) % 100).padStart(2, '0')}.mkv`, size: 2_000_000_000 }] }],
  ...patch,
})

const itemRow = (patch = {}) => ({
  rating_key: '101',
  part_id: '10100',
  section_id: '2',
  kind: 'episode',
  show_title: 'My Kitchen Rules',
  season: 16,
  episode: 1,
  title: 'Episode 1',
  aired_at: NOW - 30 * 86400000,
  duration_s: 3600,
  added_at: NOW - 2 * 86400000,
  file_path: '/data/media/tv/My Kitchen Rules/Season 16/MKR - S16E01.mkv',
  size_bytes: 2_000_000_000,
  watched_at: null,
  view_offset_s: 0,
  recording_id: null,
  manager: null,
  ...patch,
})

const recording = (patch = {}) => ({
  recording_id: 'r1',
  title: 'The Block',
  status: 'done',
  season: 22,
  episode: 41,
  file_path: '/data/media/tv/The Block/Season 22/The Block - S22E41.ts',
  aired_at: NOW - 86400000,
  purged_at: null,
  deleted_from_tvh_at: null,
  library_state: null,
  watched_at: null,
  played_at: null,
  ...patch,
})

const libraryDeps = ({ rows = [], items = [] } = {}) => ({
  loadRows: async () => rows,
  loadItems: async () => items,
  loadSeries: async () => ({ series: [] }),
  loadRecordingNow: async () => [],
  loadFinishing: async () => [],
  loadMoviesRoot: async () => '/data/media/movies',
  loadSeriesTags: async () => [],
  refreshStates: async (list) => list,
  loadChoiceStamps: async () => new Map(),
  loadOverrides: async () => new Map(),
  loadScheduled: async () => ({ upcoming: [], activeProgramIds: [] }),
  loadFolders: async () => [],
  loadEvidence: async () => new Map(),
})

test('item ids: a Plex item id wraps its rating key and is never a recording id', () => {
  assert.equal(itemIdOf('123'), 'plex-123')
  assert.equal(isPlexItemId('plex-123'), true)
  assert.equal(isPlexItemId('plex-'), false)
  assert.equal(isPlexItemId('9f86d081884c7d659a2feaa0c55ad015'), false)
  assert.equal(ratingKeyOfItemId('plex-123'), '123')
  assert.equal(ratingKeyOfItemId('abc'), null)
})

test('libraryItemRowsOf: one row per part, with the show, numbers, watched state, and a matched recording', () => {
  const items = [
    episode('101', { viewCount: 1, lastViewedAt: (NOW - 3600000) / 1000 }),
    episode('102', {
      Media: [
        { id: 1, Part: [{ id: 11, file: '/data/media/tv/The Block/Season 22/The Block - S22E41.ts', size: 4 }] },
        { id: 2, Part: [{ id: 12, file: '/data/media/tv/The Block/Season 22/The Block - S22E41 HDTV-1080p.mkv', size: 2 }] },
      ],
    }),
    { ratingKey: '103', Media: [{ Part: [{ id: 13 }] }] },
  ]
  const rows = libraryItemRowsOf({
    items,
    section: TV,
    recordingFiles: [{ recordingId: 'r1', filePath: '/media/tv/The Block/Season 22/The Block - S22E41.ts' }],
    roots: ['/data/media/tv'],
    seenAt: NOW,
  })
  assert.equal(rows.length, 3)
  assert.equal(rows[0].watched_at, NOW - 3600000)
  assert.equal(rows[0].season, 16)
  assert.equal(rows[0].kind, 'episode')
  assert.equal(rows[1].recording_id, 'r1')
  assert.equal(rows[2].recording_id, null)
  assert.equal(rows[2].part_id, '12')
})

test('localPathOf: keeps a path inside a library folder and maps another container path by the folder name', () => {
  assert.equal(localPathOf({ plexFile: '/data/media/tv/A/a.mkv', roots: ['/data/media/tv'] }), '/data/media/tv/A/a.mkv')
  assert.equal(localPathOf({ plexFile: '/tv/A/Season 01/a.mkv', roots: ['/data/media/tv', '/data/media/movies'] }), '/data/media/tv/A/Season 01/a.mkv')
  assert.equal(localPathOf({ plexFile: '/elsewhere/x.mkv', roots: ['/data/media/tv'] }), '/elsewhere/x.mkv')
})

test('isSameFileByTail: needs the file, its folder, and the show folder to match', () => {
  assert.equal(isSameFileByTail('/data/media/tv/A/Season 01/x.ts', '/media/tv/A/Season 01/x.ts'), true)
  assert.equal(isSameFileByTail('/data/media/tv/A/Season 01/x.ts', '/data/media/tv/B/Season 01/x.ts'), false)
})

test('shownTitlesOf: drops a year or country tag only when one Plex show has that base title', () => {
  const titles = shownTitlesOf([
    itemRow({ show_title: 'The Block (2003)' }),
    itemRow({ show_title: 'The Traitors (AU)' }),
    itemRow({ show_title: 'The Traitors (US)' }),
  ])
  assert.equal(titles.get('The Block (2003)'), 'The Block')
  assert.equal(titles.get('The Traitors (AU)'), 'The Traitors (AU)')
  assert.equal(baseShowTitleOf('Show (US) (2021)'), 'Show')
  assert.equal(baseShowTitleOf('Show (Australia)'), 'Show (Australia)')
})

test('plexLibraryRowsOf: a Plex item with a Freetvarr part is never listed; its other parts become versions of the recording', () => {
  const { rows, versionsByRecordingId } = plexLibraryRowsOf({
    itemRows: [
      itemRow({ rating_key: '5', part_id: 'a', recording_id: 'r1' }),
      itemRow({ rating_key: '5', part_id: 'b', file_path: '/x/sonarr.mkv', manager: 'sonarr', manager_file_id: 9 }),
      itemRow({ rating_key: '6', part_id: 'c' }),
    ],
    nowMs: NOW,
  })
  assert.deepEqual(rows.map((row) => row.recording_id), ['plex-6'])
  assert.equal(versionsByRecordingId.get('r1')[0].manager, 'sonarr')
  assert.equal(versionsByRecordingId.get('r1')[0].managerFileId, 9)
})

test('plexLibraryRowsOf: New means added in the last 14 days and not watched or started', () => {
  const rowOf = (patch) => plexLibraryRowsOf({ itemRows: [itemRow(patch)], nowMs: NOW }).rows[0]
  assert.equal(rowOf({}).plex_new, true)
  assert.equal(rowOf({ added_at: NOW - NEW_FOR_MS - 1 }).plex_new, false)
  assert.equal(rowOf({ watched_at: NOW }).plex_new, false)
  assert.equal(rowOf({ view_offset_s: 60 }).plex_new, false)
})

test('mergeWithRecordings: the same season and episode as a recording becomes a second version, not a second row', () => {
  const rows = mergeWithRecordings({
    rows: [recording()],
    itemRows: [
      itemRow({ rating_key: '7', show_title: 'The Block', season: 22, episode: 41, file_path: '/x/The Block S22E41.mkv', manager: 'sonarr' }),
      itemRow({ rating_key: '8', show_title: 'The Block', season: 22, episode: 9 }),
    ],
    keyOf: groupKeyOf,
    nowMs: NOW,
  })
  assert.deepEqual(rows.map((row) => row.recording_id), ['r1', 'plex-8'])
  assert.equal(rows[0].other_versions[0].itemId, 'plex-7')
})

test('getLibraryShows: Plex shows and films join the shelves; a Sonarr show with a recorded twin is one show', async () => {
  const { shows } = await getLibraryShows(libraryDeps({
    rows: [recording()],
    items: [
      itemRow({ rating_key: '7', show_title: 'The Block (2003)', season: 22, episode: 9 }),
      itemRow({ rating_key: '20', section_id: '1', kind: 'movie', show_title: null, season: null, episode: null, title: 'Heat', year: 1995, file_path: '/data/media/movies/Heat (1995)/Heat.mkv' }),
    ],
  }))
  const block = shows.find((show) => show.key === 'the-block')
  assert.equal(block.counts.total, 2)
  assert.equal(block.kind, 'show')
  assert.equal(shows.find((show) => show.title === 'Heat').kind, 'movie')
  assert.equal(shows.length, 2)
})

test('getLibraryShow: Plex episodes carry their source and versions, and Plex rows skip the file state check', async () => {
  let checked = []
  const show = await getLibraryShow({
    ...libraryDeps({ rows: [recording()], items: [itemRow({ rating_key: '7', show_title: 'The Block', season: 22, episode: 9 })] }),
    key: 'the-block',
    refreshStates: async (list) => {
      checked = list
      return list
    },
    resolvePlayable: async (row) => row.file_path,
  })
  assert.deepEqual(checked.map((row) => row.recording_id), ['r1'])
  const episodes = show.seasons.flatMap((season) => season.episodes)
  const fromPlex = episodes.find((entry) => entry.recordingId === 'plex-7')
  assert.equal(fromPlex.source, 'plex')
  assert.equal(fromPlex.versions.length, 1)
  assert.equal(fromPlex.playable, true)
  assert.match(fromPlex.image, /^\/api\/library\/items\/7\/image/)
})

test('getLibraryEpisodes: New uses the Plex added rule for Plex items', async () => {
  const { episodes } = await getLibraryEpisodes({
    ...libraryDeps({
      items: [
        itemRow({ rating_key: '7', episode: 1 }),
        itemRow({ rating_key: '8', episode: 2, added_at: NOW - 60 * 86400000 }),
      ],
    }),
    state: 'new',
    limit: 10,
  })
  assert.deepEqual(episodes.map((entry) => entry.recordingId), ['plex-7'])
})

test('automatic jobs never read library_items', async () => {
  const files = ['src/sync.js', 'src/library-reclassify.js', 'src/commercials.js', 'src/library-files.js', 'src/plex-watch-plan.js', 'src/for-you-service.js']
  for (const file of files) {
    const text = await fs.readFile(new URL(`../${file}`, import.meta.url), 'utf8').catch(() => '')
    assert.equal(text.includes('library_items'), false, `${file} reads library_items`)
  }
})
