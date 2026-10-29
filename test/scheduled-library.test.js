import { test } from 'node:test'
import assert from 'node:assert/strict'

import { getLibraryShow, getLibraryShows } from '../src/library.js'
import { nextScheduledByKey, scheduledEpisodeOf } from '../src/scheduled-library.js'

const NOW = Date.now()
const HOUR_MS = 60 * 60 * 1000

const entry = (overrides) => ({
  programId: 494020,
  name: 'Love Island Australia',
  channelId: 'ch-9',
  channelName: '9HD Sydney',
  startDate: NOW + 3 * HOUR_MS,
  endDate: NOW + 4 * HOUR_MS,
  episodeTitle: null,
  seriesLinkId: null,
  season: 8,
  hasImage: true,
  kind: 'series',
  synopsis: 'Two brand new Bombs',
  source: 'timer',
  ...overrides,
})

const row = (overrides) => ({
  recording_id: 'r1',
  show_id: 5,
  title: 'The Block',
  episode_title: null,
  season: 22,
  episode: 41,
  file_path: '/media/tv/The Block/S22E41.ts',
  status: 'done',
  error: null,
  deleted_from_tvh_at: null,
  purged_at: null,
  aired_at: NOW - 24 * HOUR_MS,
  duration_s: 3600,
  playback_position_s: null,
  played_at: null,
  watched_at: null,
  ...overrides,
})

const deps = ({ rows = [], scheduled = [], series = [], folders = [] } = {}) => ({
  loadRows: async () => rows,
  loadSeries: async () => ({ series }),
  loadRecordingNow: async () => [],
  loadFinishing: async () => [],
  loadMoviesRoot: async () => '',
  loadSeriesTags: async () => [],
  refreshStates: async (list) => list,
  loadChoiceStamps: async () => new Map(),
  loadOverrides: async () => new Map(),
  resolvePlayable: async () => '/media/file.ts',
  loadScheduled: async () => ({ upcoming: scheduled, activeProgramIds: [] }),
  loadFolders: async () => folders,
})

test('nextScheduledByKey: keeps only the soonest future entry per show, skipping ones recording now', () => {
  const upcoming = [
    entry({ programId: 3, startDate: NOW + 30 * HOUR_MS }),
    entry({ programId: 2, startDate: NOW + 5 * HOUR_MS }),
    entry({ programId: 1, startDate: NOW - HOUR_MS }),
    entry({ programId: 9, name: 'The Block', startDate: NOW + 2 * HOUR_MS }),
    entry({ programId: 8, name: 'The Block', startDate: NOW + HOUR_MS }),
  ]
  const next = nextScheduledByKey({ upcoming, activeProgramIds: ['8'], nowMs: NOW })
  assert.equal(next.get('love-island-australia').programId, 2)
  assert.equal(next.get('the-block').programId, 9)
  assert.equal(next.size, 2)
})

test('scheduledEpisodeOf: an unplayable episode with the guide picture and the sheet fields', () => {
  const episode = scheduledEpisodeOf(entry())
  assert.equal(episode.recordingId, 'scheduled-494020')
  assert.equal(episode.playable, false)
  assert.equal(episode.durationS, 3600)
  assert.equal(episode.airedAt, NOW + 3 * HOUR_MS)
  assert.equal(episode.image, '/api/epg/image/494020?w=384')
  assert.equal(episode.scheduled.programId, 494020)
  assert.equal(episode.scheduled.channelName, '9HD Sydney')
  assert.equal(scheduledEpisodeOf(entry({ hasImage: false })).image, null)
})

test('getLibraryShow: a never-recorded show opens with only its next scheduled episode', async () => {
  const scheduled = [entry({ programId: 2, startDate: NOW + 27 * HOUR_MS }), entry()]
  const show = await getLibraryShow({ ...deps({ scheduled }), key: 'love-island-australia' })
  assert.equal(show.title, 'Love Island Australia')
  assert.equal(show.kind, 'oneoff')
  assert.equal(show.counts.total, 0)
  assert.equal(show.resumeNext, null)
  assert.equal(show.nextAiring.programId, 494020)
  assert.deepEqual(show.seasons.map((s) => s.episodes.map((e) => e.recordingId)), [['scheduled-494020']])
  assert.equal(await getLibraryShow({ ...deps({ scheduled }), key: 'gruen' }), null)
})

test('getLibraryShow: a never-recorded show takes its kind from the scheduled entry', async () => {
  const kindOf = async (overrides) => (await getLibraryShow({ ...deps({ scheduled: [entry(overrides)] }), key: 'love-island-australia' })).kind
  assert.equal(await kindOf({ seriesLinkId: 'auto-1' }), 'show')
  assert.equal(await kindOf({ seriesLinkId: null }), 'oneoff')
  assert.equal(await kindOf({ kind: 'movie', seriesLinkId: null }), 'movie')
})

test('getLibraryShow: a recorded show lists the next scheduled episode first in its season, outside the counts', async () => {
  const rows = [row({ recording_id: 'a', episode: 40 }), row({ recording_id: 'b', episode: 41 })]
  const scheduled = [entry({ name: 'The Block', programId: 7, season: null }), entry({ name: 'The Block', programId: 8, startDate: NOW + 26 * HOUR_MS })]
  const show = await getLibraryShow({ ...deps({ rows, scheduled }), key: 'the-block' })
  assert.deepEqual(show.seasons[0].episodes.map((e) => e.recordingId), ['scheduled-7', 'b', 'a'])
  assert.equal(show.seasons[0].episodes[0].season, 22)
  assert.equal(show.counts.total, 2)
  assert.deepEqual(show.resumeNext, { recordingId: 'a', positionS: 0 })
})

test('getLibraryShows: a never-recorded show joins the shelves with its next airing', async () => {
  const { shows } = await getLibraryShows(deps({ rows: [row()], scheduled: [entry(), entry({ name: 'The Block', programId: 7 })] }))
  const island = shows.find((s) => s.key === 'love-island-australia')
  assert.equal(island.counts.total, 0)
  assert.equal(island.nextAiring.startDate, NOW + 3 * HOUR_MS)
  assert.equal(island.latestAt, NOW + 3 * HOUR_MS)
  assert.equal(shows.find((s) => s.key === 'the-block').counts.total, 1)
  assert.equal(shows.length, 2)
})

test('getLibraryShow: a series timer under another title joins the show its rule already records', async () => {
  const rows = [row({ recording_id: 'bb1', title: 'Big Brother', show_id: 9, season: 17, episode: 3 })]
  const series = [{ title: 'Big Brother', recording: true, episodesToKeep: 0, autorecs: [{ id: 'auto-bb', seriesLinkId: 'link-bb', channelId: 'ch-10' }], nextAiring: null, folder: { id: 9 } }]
  const scheduled = [entry({ name: 'Big Brother Australia', programId: 62, seriesLinkId: 'link-bb', season: null })]
  const { shows } = await getLibraryShows(deps({ rows, scheduled, series }))
  assert.deepEqual(shows.map((s) => s.key), ['big-brother'])
  const show = await getLibraryShow({ ...deps({ rows, scheduled, series }), key: 'big-brother' })
  assert.deepEqual(show.seasons[0].episodes.map((e) => e.recordingId), ['scheduled-62', 'bb1'])
  assert.equal(await getLibraryShow({ ...deps({ rows, scheduled, series }), key: 'big-brother-australia' }), null)
})

test('getLibraryShow: a timer with no rule joins the show whose folder matches its title', async () => {
  const rows = [row({ recording_id: 'bb1', title: 'Big Brother', show_id: 9 })]
  const folders = [{ id: 9, show_pattern: 'Big Brother', enabled: true }]
  const scheduled = [entry({ name: 'Big Brother Australia', programId: 62 }), entry({ name: 'Gruen', programId: 63 })]
  const { shows } = await getLibraryShows(deps({ rows, scheduled, folders }))
  assert.deepEqual(shows.map((s) => s.key).sort(), ['big-brother', 'gruen'])
  const show = await getLibraryShow({ ...deps({ rows, scheduled, folders }), key: 'big-brother' })
  assert.deepEqual(show.seasons.flatMap((s) => s.episodes).filter((e) => e.scheduled).map((e) => e.recordingId), ['scheduled-62'])
})
