import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'

import {
  episodeLimitFrom,
  getLibraryShow,
  getLibraryShows,
  isInsideFolder,
  isLibraryMember,
  kindOf,
  libraryEpisodesOf,
  resumeNextOf,
  ruleSummaryOf,
  rulePatchFrom,
  seasonsOf,
  showSummariesOf,
  updateShowRule,
} from '../src/library.js'
import { autorecFieldsOf, updateSeriesTags } from '../src/tvheadend.js'
import { isPortraitSize, showImageShapeFrom } from '../src/show-poster.js'

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 9, 18, 9, 0)

const row = (overrides) => ({
  recording_id: 'r1',
  show_id: null,
  title: 'The Block',
  episode_title: null,
  season: null,
  episode: null,
  file_path: null,
  status: 'done',
  error: null,
  deleted_from_tvh_at: null,
  purged_at: null,
  channel_id: 'nine',
  channel_name: '9HD',
  aired_at: NOW - DAY_MS,
  duration_s: 3600,
  synopsis: null,
  image_path: null,
  playback_position_s: null,
  played_at: null,
  watched_at: null,
  library_state: null,
  ...overrides,
})

const blockSeries = (overrides) => ({
  key: 'the block',
  title: 'The Block',
  recording: true,
  episodesToKeep: 10,
  autorecs: [{ id: 'auto-1', seriesLinkId: 'nine|the block', channelId: 'nine', channelName: '9HD', anyChannel: false, enabled: true, episodesToKeep: 10 }],
  nextAiring: { programId: 7, startDate: NOW + DAY_MS, endDate: NOW + DAY_MS + 3600000, channelName: '9HD', expected: false },
  folder: { id: 3, show_pattern: 'The Block', dest_folder: 'The Block', ad_removal: 'cut' },
  savesTo: { kind: 'library', path: '/media/tv/The Block/Season 22' },
  ...overrides,
})

test('isLibraryMember: keeps imported rows and rows TVHeadend still has, drops purged rows', () => {
  assert.equal(isLibraryMember(row()), true)
  assert.equal(isLibraryMember(row({ status: 'done', deleted_from_tvh_at: '2026-10-01' })), true)
  assert.equal(isLibraryMember(row({ status: 'failed' })), true)
  assert.equal(isLibraryMember(row({ status: 'skipped', deleted_from_tvh_at: '2026-10-01' })), false)
  assert.equal(isLibraryMember(row({ purged_at: '2026-10-02' })), false)
})

test('kindOf: a rule, episode numbers or two recordings make a show', () => {
  assert.equal(kindOf({ rows: [row()], hasRule: true }), 'show')
  assert.equal(kindOf({ rows: [row({ season: 2 })] }), 'show')
  assert.equal(kindOf({ rows: [row(), row({ recording_id: 'r2' })] }), 'show')
  assert.equal(kindOf({ rows: [row({ file_path: '/media/movies/Heat (1995)/Heat.ts' })], moviesRoot: '/media/movies' }), 'movie')
  assert.equal(kindOf({ rows: [row({ status: 'pending', duration_s: 7200 })] }), 'movie')
  assert.equal(kindOf({ rows: [row({ file_path: '/media/one-offs/Cup/Cup.ts' })], moviesRoot: '/media/movies' }), 'oneoff')
})

test('isInsideFolder: matches only files below the folder', () => {
  assert.equal(isInsideFolder({ filePath: '/media/movies/a.ts', folder: '/media/movies/' }), true)
  assert.equal(isInsideFolder({ filePath: '/media/movies-old/a.ts', folder: '/media/movies' }), false)
  assert.equal(isInsideFolder({ filePath: '/media/movies', folder: '/media/movies' }), false)
})

test('ruleSummaryOf: says where, how many, and what happens to ads', () => {
  assert.equal(
    ruleSummaryOf({ channels: ['9HD'], episodesToKeep: 10, adRemoval: 'cut' }),
    'Records every new episode on 9HD · keeps the latest 10 · ads removed',
  )
  assert.equal(
    ruleSummaryOf({ channels: ['9HD', '9Gem', '9Go!'], episodesToKeep: 0, adRemoval: 'off' }),
    'Records every new episode on 9HD, 9Gem and 9Go! · keeps every episode',
  )
  assert.equal(ruleSummaryOf({ anyChannel: true, episodesToKeep: 0, adRemoval: 'detect' }),
    'Records every new episode on any channel · keeps every episode · ad breaks marked')
  assert.equal(ruleSummaryOf({ paused: true, episodesToKeep: 5 }), 'Paused · keeps the latest 5')
})

test('showSummariesOf: groups by show key, counts new and unwatched, and keeps rules without recordings', () => {
  const rows = [
    row({ recording_id: 'a', season: 22, episode: 45, aired_at: NOW - DAY_MS, played_at: '2026-10-18 08:00:00', playback_position_s: 600, image_path: 'x' }),
    row({ recording_id: 'b', title: 'the block', season: 22, episode: 44, aired_at: NOW - 2 * DAY_MS }),
    row({ recording_id: 'c', season: 22, episode: 43, aired_at: NOW - 3 * DAY_MS, played_at: '2026-10-15', watched_at: '2026-10-15' }),
    row({ recording_id: 'd', status: 'failed', season: 22, episode: 42, aired_at: NOW - 4 * DAY_MS }),
    row({ recording_id: 'e', title: 'Melbourne Cup', aired_at: NOW - 10 * DAY_MS, file_path: '/media/one-offs/Cup.ts' }),
  ]
  const shows = showSummariesOf({
    rows,
    series: [blockSeries(), blockSeries({ title: 'Grand Designs', folder: null, recording: false })],
    active: [{ title: 'The Block', failed: false }],
  })
  assert.deepEqual(shows.map((s) => s.key), ['grand-designs', 'the-block', 'melbourne-cup'])
  const block = shows.find((s) => s.key === 'the-block')
  assert.deepEqual(block.counts, { total: 4, new: 1, unwatched: 2, failed: 1 })
  assert.equal(block.recordingNow, true)
  assert.equal(block.kind, 'show')
  assert.equal(block.image, '/api/recordings/a/image')
  assert.equal(block.poster, '/api/epg/show-image?title=The%20Block&shape=poster')
  assert.equal(block.rule.summary, 'Records every new episode on 9HD · keeps the latest 10 · ads removed')
  assert.equal(block.latest.recordingId, 'a')
  const designs = shows.find((s) => s.key === 'grand-designs')
  assert.equal(designs.counts.total, 0)
  assert.equal(designs.latest, null)
  assert.equal(designs.rule.paused, true)
  assert.equal(designs.latestAt, NOW + DAY_MS)
  assert.equal(shows.find((s) => s.key === 'melbourne-cup').kind, 'oneoff')
})

test('seasonsOf: newest season first, unknown season last, newest episode first', () => {
  const seasons = seasonsOf([
    { recordingId: '1', season: null, episode: null, airedAt: 1 },
    { recordingId: '2', season: 21, episode: 3, airedAt: 2 },
    { recordingId: '3', season: 22, episode: 1, airedAt: 3 },
    { recordingId: '4', season: 22, episode: 2, airedAt: 4 },
  ])
  assert.deepEqual(seasons.map((s) => s.season), [22, 21, null])
  assert.deepEqual(seasons[0].episodes.map((e) => e.recordingId), ['4', '3'])
})

test('resumeNextOf: resumes the last played episode, else starts the oldest unwatched one', () => {
  const episode = (overrides) => ({ playable: true, failed: false, watched: false, positionS: null, playedAt: null, episode: 1, airedAt: 1, ...overrides })
  assert.deepEqual(resumeNextOf([
    episode({ recordingId: 'old', positionS: 30, playedAt: '2026-10-01T00:00:00Z' }),
    episode({ recordingId: 'recent', positionS: 90, playedAt: '2026-10-10T00:00:00Z' }),
  ]), { recordingId: 'recent', positionS: 90 })
  assert.deepEqual(resumeNextOf([
    episode({ recordingId: 'e3', episode: 3 }),
    episode({ recordingId: 'e2', episode: 2 }),
    episode({ recordingId: 'e1', episode: 1, watched: true }),
  ]), { recordingId: 'e2', positionS: 0 })
  assert.equal(resumeNextOf([episode({ recordingId: 'x', playable: false })]), null)
})

test('libraryEpisodesOf: in-progress by last played, new by air date, never failed or watched', () => {
  const rows = [
    row({ recording_id: 'p1', aired_at: NOW - 5 * DAY_MS, playback_position_s: 100, played_at: '2026-10-10T00:00:00Z', season: 1 }),
    row({ recording_id: 'p2', aired_at: NOW - 6 * DAY_MS, playback_position_s: 50, played_at: '2026-10-12T00:00:00Z', season: 1 }),
    row({ recording_id: 'n1', aired_at: NOW - DAY_MS, season: 1 }),
    row({ recording_id: 'n2', aired_at: NOW, season: 1 }),
    row({ recording_id: 'f', status: 'failed', season: 1 }),
    row({ recording_id: 'w', watched_at: '2026-10-01', season: 1 }),
  ]
  assert.deepEqual(libraryEpisodesOf({ rows, state: 'in-progress' }).map((e) => e.recordingId), ['p2', 'p1'])
  assert.deepEqual(libraryEpisodesOf({ rows, state: 'new' }).map((e) => e.recordingId), ['n2', 'n1'])
  assert.deepEqual(libraryEpisodesOf({ rows, state: 'unwatched', limit: 3 }).map((e) => e.recordingId), ['n2', 'n1', 'p1'])
  assert.equal(libraryEpisodesOf({ rows, state: 'new' })[0].showKey, 'the-block')
  assert.equal(libraryEpisodesOf({ rows, state: 'new' })[0].kind, 'show')
})

test('libraryEpisodesOf: a kind keeps only episodes of that kind', () => {
  const rows = [
    row({ recording_id: 's1', aired_at: NOW, season: 1 }),
    row({ recording_id: 'm1', title: 'The Long Paddock', aired_at: NOW - DAY_MS, file_path: '/media/Movies/paddock.ts' }),
  ]
  const ofKind = (kind) => libraryEpisodesOf({ rows, state: 'new', kind, moviesRoot: '/media/Movies' }).map((e) => e.recordingId)
  assert.deepEqual(ofKind('movie'), ['m1'])
  assert.deepEqual(ofKind('show'), ['s1'])
  assert.equal(libraryEpisodesOf({ rows, state: 'new' }).length, 2)
})

test('episodeLimitFrom and rulePatchFrom: validate request values', () => {
  assert.equal(episodeLimitFrom(undefined), 20)
  assert.equal(episodeLimitFrom('12'), 12)
  assert.equal(episodeLimitFrom('0'), null)
  assert.equal(episodeLimitFrom('51'), null)
  assert.deepEqual(rulePatchFrom({ episodes_to_keep: 10, lead_time: '2' }), { patch: { episodesToKeep: 10, leadTime: 2 } })
  assert.match(rulePatchFrom({ lag_time: -1 }).error, /lag_time/)
  assert.match(rulePatchFrom({}).error, /episodes_to_keep/)
})

test('getLibraryShows: marks the list stale when the series rules are missing', async () => {
  const result = await getLibraryShows({
    loadRows: async () => [row()],
    loadSeries: async () => ({ series: [], stale: false, error: 'TVHeadend URL is not configured.' }),
    loadRecordingNow: async () => [],
    loadMoviesRoot: async () => '',
  })
  assert.equal(result.stale, true)
  assert.equal(result.shows[0].kind, 'oneoff')
})

test('getLibraryShow: returns 404 data as null and fills autorec padding from the series tags', async () => {
  const deps = {
    loadRows: async () => [row({ recording_id: 'a', season: 22, episode: 45 })],
    loadSeries: async () => ({ series: [blockSeries()] }),
    loadRecordingNow: async () => [],
    loadMoviesRoot: async () => '',
    loadSeriesTags: async () => [{ id: 'auto-1', leadTime: 2, lagTime: 5 }],
    refreshStates: async (rows) => rows,
    resolvePlayable: async (r) => (r.recording_id === 'a' ? '/media/a.ts' : null),
  }
  assert.equal(await getLibraryShow({ ...deps, key: 'nothing-here' }), null)
  const show = await getLibraryShow({ ...deps, key: 'the-block' })
  assert.equal(show.rule.autorecs[0].leadTime, 2)
  assert.equal(show.rule.autorecs[0].lagTime, 5)
  assert.equal(show.rule.folder.id, 3)
  assert.equal(show.seasons[0].episodes[0].playable, true)
  assert.deepEqual(show.resumeNext, { recordingId: 'a', positionS: 0 })
})

test('updateShowRule: updates every autorec of the show, or returns null without one', async () => {
  const calls = []
  const update = async (args) => {
    calls.push(args)
    return { ok: true, uuids: args.seriesLinkIds }
  }
  const loadSeries = async () => ({ series: [blockSeries()] })
  assert.equal(await updateShowRule({ key: 'gruen', patch: { leadTime: 1 }, loadSeries, update }), null)
  const result = await updateShowRule({ key: 'the-block', patch: { leadTime: 1 }, loadSeries, update })
  assert.deepEqual(result.uuids, ['auto-1'])
  assert.deepEqual(calls[0].patch, { leadTime: 1 })
})

test('updateSeriesTags: saves maxcount and padding on each matching autorec', async () => {
  const saves = []
  const server = http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://tvh')
    if (pathname === '/api/idnode/save') {
      const body = await new Promise((resolve) => {
        let text = ''
        req.on('data', (chunk) => { text += chunk })
        req.on('end', () => resolve(text))
      })
      saves.push(JSON.parse(new URLSearchParams(body).get('node')))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end('{}')
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ entries: [
      { uuid: 'auto-1', title: 'The Block', channel: 'nine', enabled: true, maxcount: 5 },
      { uuid: 'auto-2', title: 'Gruen', channel: 'abc', enabled: true },
    ] }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const conn = { url: `http://127.0.0.1:${server.address().port}`, username: '', password: '' }
    const result = await updateSeriesTags({ seriesLinkIds: ['auto-1'], patch: { episodesToKeep: 10, lagTime: 5 }, conn })
    assert.deepEqual(result.uuids, ['auto-1'])
    assert.deepEqual(saves, [{ uuid: 'auto-1', maxcount: 10, stop_extra: 5 }])
    await assert.rejects(updateSeriesTags({ seriesLinkIds: ['missing'], patch: { leadTime: 1 }, conn }), /No series recording/)
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('autorecFieldsOf: maps only the fields that were sent', () => {
  assert.deepEqual(autorecFieldsOf({ leadTime: 0 }), { start_extra: 0 })
  assert.deepEqual(autorecFieldsOf({}), {})
})

test('show poster helpers: only portrait images count, and only shape=poster asks for one', () => {
  assert.equal(isPortraitSize({ width: 680, height: 1000 }), true)
  assert.equal(isPortraitSize({ width: 1280, height: 720 }), false)
  assert.equal(isPortraitSize({}), false)
  assert.equal(showImageShapeFrom('poster'), 'poster')
  assert.equal(showImageShapeFrom('wide'), 'landscape')
})
