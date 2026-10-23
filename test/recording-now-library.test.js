import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-recording-now-library-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const {
  FINISHING,
  RECORDING,
  inProgressRowsOf,
  inProgressSummaryOf,
  recordingTitlesOf,
} = await import('../src/recording-now-library.js')
const { getLibraryShow, getLibraryShows } = await import('../src/library.js')
const {
  IN_PROGRESS_POSITIONS_KEY,
  POSITION_KEEP_MS,
  applyInProgressPositions,
  parsePositions,
  prunedPositions,
  rememberInProgressPosition,
  withPosition,
} = await import('../src/in-progress-positions.js')
const { recordingRowsOf, showCatalogueOf } = await import('../src/search-aliases.js')
const { db, getSetting } = await import('../src/db.js')
const { seriesFolderIdOf } = await import('../src/recording-now.js')
const { libraryKind } = await import('../src/sync.js')

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

const MIN = 60_000
const NOW = Date.UTC(2026, 9, 23, 9, 0)

const active = (overrides) => ({
  uuid: 'c53af306',
  dvrUuid: 'c53af306',
  programId: 358017,
  autorecId: null,
  hasImage: true,
  title: 'Rugby League World Cup 2026',
  episodeTitle: 'Tonga v Lebanon',
  season: 26,
  episode: 6,
  channelId: 'seven',
  channelName: '7 Sydney',
  canPlayFromStart: true,
  recordingStartedAt: NOW - 30 * MIN,
  recordingSince: NOW - 30 * MIN,
  start: NOW - 60 * MIN,
  stop: NOW + 90 * MIN,
  startPadded: NOW - 62 * MIN,
  stopPadded: NOW + 100 * MIN,
  failed: false,
  libraryHold: null,
  ...overrides,
})

const row = (overrides) => ({
  recording_id: 'old-1',
  show_id: null,
  title: 'Rugby League World Cup 2026',
  episode_title: 'Samoa v Fiji',
  season: 26,
  episode: 5,
  file_path: null,
  status: 'done',
  error: null,
  deleted_from_tvh_at: null,
  purged_at: null,
  channel_id: 'seven',
  channel_name: '7 Sydney',
  aired_at: NOW - 2 * 24 * 60 * MIN,
  duration_s: 9000,
  synopsis: null,
  image_path: null,
  playback_position_s: null,
  played_at: null,
  watched_at: null,
  library_state: null,
  ...overrides,
})

const deps = ({ rows = [], recording = [], finishing = [], series = [] } = {}) => ({
  loadRows: async () => rows,
  loadSeries: async () => ({ series }),
  loadRecordingNow: async () => recording,
  loadFinishing: async () => finishing,
  loadMoviesRoot: async () => '',
  loadSeriesTags: async () => [],
  refreshStates: async (list) => list,
  loadChoiceStamps: async () => new Map(),
  loadOverrides: async () => new Map(),
  resolvePlayable: async (r) => (r.status === 'done' ? `/media/${r.recording_id}.ts` : null),
})

test('inProgressRowsOf: one stand-in per recording, skipping failures and recordings that already have a row', () => {
  const rows = inProgressRowsOf({
    active: [active(), active({ uuid: 'bad', dvrUuid: 'bad', failed: true }), active({ uuid: 'r1', dvrUuid: 'r1' })],
    finishing: [{ ...active({ uuid: 'f1' }), dvrUuid: undefined }, active({ uuid: 'c53af306' })],
    rows: [row({ recording_id: 'r1' })],
  })
  assert.deepEqual(rows.map((r) => [r.recording_id, r.status]), [['c53af306', RECORDING], ['f1', FINISHING]])
  const [stand] = rows
  assert.equal(stand.aired_at, NOW - 60 * MIN)
  assert.equal(stand.duration_s, 150 * 60)
  assert.equal(stand.in_progress.canPlayFromStart, true)
  assert.equal(rows[1].in_progress.canPlayFromStart, false)
})

test('getLibraryShows: a one-off recording appears on the right shelf the moment it starts', async () => {
  const oneOff = active({ uuid: 'o1', dvrUuid: 'o1', title: 'Australian of the Year Awards', season: null, episode: null, episodeTitle: null, stop: NOW })
  const film = active({ uuid: 'm1', dvrUuid: 'm1', title: 'The Castle', season: null, episode: null, episodeTitle: null, genres: [0x10] })
  const filed = active({ uuid: 'b1', dvrUuid: 'b1', title: 'The Block', season: 22, episode: 4, seriesFolderId: 3 })
  const ruled = active({ uuid: 'h1', dvrUuid: 'h1', title: 'Hard Quiz', season: null, episode: null, autorecId: 'auto-9' })
  const guideNumbered = active()
  const { shows } = await getLibraryShows({
    ...deps({
      recording: [oneOff, film, filed, ruled, guideNumbered],
      series: [{ key: 'hard quiz', title: 'Hard Quiz', autorecs: [], folder: null }],
    }),
    loadMoviesRoot: async () => '/media/movies',
  })
  const kindOf = Object.fromEntries(shows.map((s) => [s.key, s.kind]))
  assert.deepEqual(kindOf, {
    'australian-of-the-year-awards': 'oneoff',
    'the-castle': 'movie',
    'the-block': 'show',
    'hard-quiz': 'show',
    'rugby-league-world-cup-2026': 'oneoff',
  })
  const rugby = shows.find((s) => s.key === 'rugby-league-world-cup-2026')
  assert.equal(rugby.recordingNow, true)
  assert.deepEqual(rugby.counts, { total: 1, new: 0, unwatched: 1, failed: 0, inProgress: 1 })
  assert.equal(rugby.inProgress.phase, RECORDING)
  assert.equal(rugby.image, '/api/epg/image/358017?w=384')
})

test('seriesFolderIdOf: names the series folder the import will use, as the sync matches it', () => {
  const shows = [{ id: 3, show_pattern: 'The Block' }, { id: 4, show_pattern: 'Block' }]
  assert.equal(seriesFolderIdOf({ recording: { name: 'The Block' }, shows }), 3)
  assert.equal(seriesFolderIdOf({ recording: { name: 'Rugby League World Cup 2026' }, shows }), null)
  assert.equal(seriesFolderIdOf({ recording: { name: 'The Block' } }), null)
})

test('a guide-numbered recording with no series folder: the import and the shelf both say one-off', async () => {
  const item = { title: 'Rugby League World Cup 2026', season: 26, episode: 6, genres: [0x40], start: NOW - 60 * MIN, end: NOW + 90 * MIN }
  assert.equal(libraryKind({ show: null, item, moviesRoot: '/media/movies' }), 'oneOff')
  const { shows } = await getLibraryShows(deps({ recording: [active()] }))
  assert.equal(shows[0].kind, 'oneoff')
  const imported = row({ recording_id: 'c53af306', episode: 6, file_path: '/media/one-offs/Rugby League World Cup 2026/x.ts' })
  const after = await getLibraryShows(deps({ rows: [imported], recording: [] }))
  assert.equal(after.shows[0].kind, 'oneoff')
})

test('long sport and news with no episode numbers stay on the one-off shelf before and after import', async () => {
  const long = { season: null, episode: null, episodeTitle: null, start: NOW - 60 * MIN, stop: NOW + 120 * MIN }
  const sport = active({ ...long, uuid: 's1', dvrUuid: 's1', title: 'AFL Grand Final', genres: [0x40] })
  const news = active({ ...long, uuid: 'n1', dvrUuid: 'n1', title: 'Election Night Coverage', genres: [0x20] })
  for (const item of [sport, news]) {
    const importItem = { title: item.title, season: null, episode: null, genres: item.genres, start: item.start, end: item.stop }
    assert.equal(libraryKind({ show: null, item: importItem, moviesRoot: '/media/movies' }), 'oneOff')
  }
  const withMovies = (overrides) => ({ ...deps(overrides), loadMoviesRoot: async () => '/media/movies' })
  const recording = await getLibraryShows(withMovies({ recording: [sport, news] }))
  assert.deepEqual(recording.shows.map((s) => [s.key, s.kind]).sort(), [['afl-grand-final', 'oneoff'], ['election-night-coverage', 'oneoff']])
  const held = row({ recording_id: 's1', title: 'AFL Grand Final', season: null, episode: null, status: 'not_imported', duration_s: 10800, genres_json: '[64]' })
  const heldShows = await getLibraryShows(withMovies({ rows: [held] }))
  assert.equal(heldShows.shows[0].kind, 'oneoff')
})

test('a film recording sits on Movies while it records, as the import will file it', async () => {
  const film = active({ uuid: 'm1', dvrUuid: 'm1', title: 'The Castle', season: null, episode: null, episodeTitle: null, genres: [0x10] })
  const item = { title: 'The Castle', season: null, episode: null, genres: film.genres, start: film.start, end: film.stop }
  assert.equal(libraryKind({ show: null, item, moviesRoot: '/media/movies' }), 'film')
  const { shows } = await getLibraryShows({ ...deps({ recording: [film] }), loadMoviesRoot: async () => '/media/movies' })
  assert.equal(shows[0].kind, 'movie')
})

test('getLibraryShows: a programme kind override moves the stand-in like an imported row', async () => {
  const film = active({ uuid: 'm1', dvrUuid: 'm1', title: 'The Castle', season: null, episode: null, episodeTitle: null, genres: [0x10] })
  const { shows } = await getLibraryShows({ ...deps({ recording: [film] }), loadMoviesRoot: async () => '/media/movies', loadOverrides: async () => new Map([['the-castle', 'not-movie']]) })
  assert.equal(shows[0].kind, 'oneoff')
})

test('getLibraryShow: a show with only a recording in progress loads instead of 404', async () => {
  const show = await getLibraryShow({ ...deps({ recording: [active()] }), key: 'rugby-league-world-cup-2026' })
  assert.equal(show.title, 'Rugby League World Cup 2026')
  const [episode] = show.seasons[0].episodes
  assert.equal(episode.recordingId, 'c53af306')
  assert.equal(episode.playable, false)
  assert.equal(episode.new, false)
  assert.equal(episode.inProgress.recordingStartedAt, NOW - 30 * MIN)
  assert.equal(show.resumeNext, null)
  assert.equal(await getLibraryShow({ ...deps({ recording: [active({ failed: true })] }), key: 'rugby-league-world-cup-2026' }), null)
})

test('getLibraryShow: the new episode sits in the season list of a show you already have', async () => {
  const show = await getLibraryShow({ ...deps({ rows: [row()], recording: [active()] }), key: 'rugby-league-world-cup-2026' })
  const ids = show.seasons[0].episodes.map((e) => e.recordingId)
  assert.deepEqual(ids, ['c53af306', 'old-1'])
  assert.deepEqual(show.resumeNext, { recordingId: 'old-1', positionS: 0 })
  assert.equal(show.counts.new, 1)
})

test('getLibraryShow: the imported row replaces the stand-in with the same id', async () => {
  const imported = row({ recording_id: 'c53af306', episode: 6, status: 'pending', aired_at: NOW - 60 * MIN })
  const show = await getLibraryShow({ ...deps({ rows: [imported], finishing: [active()] }), key: 'rugby-league-world-cup-2026' })
  const [episode] = show.seasons[0].episodes
  assert.equal(show.seasons[0].episodes.length, 1)
  assert.equal(episode.status, 'pending')
  assert.equal(episode.inProgress, null)
})

test('inProgressSummaryOf: prefers a running recording, then the one that ends first', () => {
  const rows = inProgressRowsOf({
    active: [active({ uuid: 'late', dvrUuid: 'late', stopPadded: NOW + 200 * MIN }), active({ uuid: 'soon', dvrUuid: 'soon', stopPadded: NOW + 20 * MIN })],
    finishing: [active({ uuid: 'done', dvrUuid: 'done', stopPadded: NOW - MIN })],
  })
  assert.equal(inProgressSummaryOf(rows).dvrUuid, 'soon')
  assert.equal(inProgressSummaryOf(rows.filter((r) => r.status === FINISHING)).dvrUuid, 'done')
  assert.equal(inProgressSummaryOf([]), null)
})

test('recordingTitlesOf: search finds recordings that have no row yet', () => {
  const titles = recordingTitlesOf({ active: [active(), active({ title: 'Failed', failed: true })], finishing: [active({ title: 'Gruen' })] })
  assert.deepEqual(titles, ['Rugby League World Cup 2026', 'Gruen'])
  const catalogue = showCatalogueOf([{ title: 'Gruen', count: 3 }, ...recordingRowsOf(titles)])
  assert.deepEqual(catalogue.map((s) => [s.key, s.recordingCount]), [['gruen', 4], ['rugby-league-world-cup-2026', 1]])
})

test('in-progress positions: kept by id, pruned after three days, and parsed safely', () => {
  const kept = withPosition({ positions: { old: { seconds: 5, savedAt: NOW - POSITION_KEEP_MS - 1 } }, recordingId: 'c53af306', seconds: 600, nowMs: NOW })
  assert.deepEqual(kept, { c53af306: { seconds: 600, savedAt: NOW } })
  assert.deepEqual(prunedPositions({ positions: kept, nowMs: NOW + POSITION_KEEP_MS + 1 }), {})
  assert.deepEqual(parsePositions('not json'), {})
  assert.deepEqual(parsePositions('[1]'), {})
})

test('applyInProgressPositions: the imported row takes the position saved while it recorded', async () => {
  await db.migrate.latest()
  await rememberInProgressPosition({ recordingId: 'c53af306', seconds: 1200, nowMs: NOW })
  await rememberInProgressPosition({ recordingId: 'not-yet', seconds: 60, nowMs: NOW })
  await db('recordings').insert({ recording_id: 'c53af306', title: 'Rugby League World Cup 2026', status: 'pending', duration_s: 9000 })
  const applied = await applyInProgressPositions({ watchedAtFor: () => null, nowMs: NOW + MIN })
  assert.deepEqual(applied, ['c53af306'])
  const saved = await db('recordings').where({ recording_id: 'c53af306' }).first()
  assert.equal(saved.playback_position_s, 1200)
  assert.equal(saved.played_at, new Date(NOW).toISOString())
  assert.deepEqual(Object.keys(JSON.parse(await getSetting(IN_PROGRESS_POSITIONS_KEY))), ['not-yet'])
})
