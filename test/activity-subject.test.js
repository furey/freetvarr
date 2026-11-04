import { test } from 'node:test'
import assert from 'node:assert/strict'

import { recordingSubjectOf, importSubjectOf, loadRecordingSubject } from '../src/activity-subject.js'

const aired = Date.parse('2026-11-02T19:00:00+11:00')

const blockRow = { recording_id: 'r9', title: 'The Block', file_path: '/media/tv/The Block/Season 22/e.ts' }

test('a failed settings read keeps the show title of the recording', async () => {
  const subject = await loadRecordingSubject('r9', {
    loadRow: async () => blockRow,
    loadMoviesRoot: async () => { throw new Error('settings locked') },
    loadKindOverride: async () => { throw new Error('settings locked') },
  })
  assert.equal(subject.title, 'The Block')
  assert.equal(subject.film, false)
})

test('a failed recording read gives no subject', async () => {
  const subject = await loadRecordingSubject('r9', { loadRow: async () => { throw new Error('locked') } })
  assert.equal(subject, null)
})

test('a show marked as a movie is a film wherever its file is filed', async () => {
  const seen = []
  const subject = await loadRecordingSubject('r9', {
    loadRow: async () => ({ ...blockRow, title: 'The Dish' }),
    loadMoviesRoot: async () => '/media/movies',
    loadKindOverride: async (key) => { seen.push(key); return 'movie' },
  })
  assert.deepEqual(seen, ['the-dish'])
  assert.equal(subject.film, true)
  assert.equal(importSubjectOf({ item: { id: 'd', title: 'The Dish' }, kind: 'tv', filePath: '/m/d.ts', kindOverride: 'movie' }).film, true)
  assert.equal(importSubjectOf({ item: { id: 'd', title: 'The Dish' }, kind: 'tv', filePath: '/m/d.ts', kindOverride: 'show' }).film, false)
})

test('a recording row becomes the subject an activity job shows', () => {
  const subject = recordingSubjectOf({
    row: {
      recording_id: 'r1', title: 'Big Brother', show_title_override: null, season: null, episode: null, episode_title: null,
      channel_name: '7', aired_at: String(aired), year: null, file_path: '/media/tv/Big Brother/Season 00/Big Brother - 2026-11-02.ts',
    },
    moviesRoot: '/media/movies',
  })
  assert.deepEqual(subject, {
    recordingId: 'r1', title: 'Big Brother', season: null, episode: null, episodeTitle: null, channelName: '7',
    airedAt: aired, year: null, film: false, file: '/media/tv/Big Brother/Season 00/Big Brother - 2026-11-02.ts',
  })
})

test('the subject uses the show title the library groups the recording under', () => {
  const subject = recordingSubjectOf({ row: { recording_id: 'r2', title: 'Big Brother: Live', show_title_override: 'Big Brother' } })
  assert.equal(subject.title, 'Big Brother')
})

test('a recording in the movies folder is a film', () => {
  const subject = recordingSubjectOf({
    row: { recording_id: 'r3', title: 'The Dish', year: 2000, file_path: '/media/movies/The Dish (2000)/The Dish (2000).ts' },
    moviesRoot: '/media/movies',
  })
  assert.equal(subject.film, true)
  assert.equal(subject.year, 2000)
})

test('no row gives no subject', () => {
  assert.equal(recordingSubjectOf({ row: null }), null)
})

test('an import item becomes the subject of its import job', () => {
  const subject = importSubjectOf({
    item: {
      id: 'hq', title: 'Hard Quiz', season: 11, episode: 4, episode_title: 'Episode 4', channelName: 'ABC TV', start: aired, year: null,
    },
    kind: 'tv',
    filePath: '/media/tv/Hard Quiz/Season 11/Hard Quiz - S11E04.ts',
  })
  assert.deepEqual(subject, {
    recordingId: 'hq', title: 'Hard Quiz', season: 11, episode: 4, episodeTitle: 'Episode 4', channelName: 'ABC TV',
    airedAt: aired, year: null, film: false, file: '/media/tv/Hard Quiz/Season 11/Hard Quiz - S11E04.ts',
  })
  assert.equal(importSubjectOf({ item: { id: 'f', title: 'The Dish' }, kind: 'film', filePath: '/m/f.ts' }).film, true)
})
