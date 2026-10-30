import { test } from 'node:test'
import assert from 'node:assert/strict'

import { isLibraryMember, libraryEpisodesOf, showDetailOf, showSummariesOf } from '../src/library.js'

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 9, 18, 9, 0)

const row = (overrides) => ({
  recording_id: 'r1',
  show_id: 3,
  title: 'The Block',
  season: 22,
  episode: 1,
  status: 'done',
  deleted_from_tvh_at: null,
  purged_at: null,
  aired_at: NOW - DAY_MS,
  watched_at: null,
  library_state: null,
  ...overrides,
})

const goneRow = (overrides) => row({ library_state: 'not_in_library', ...overrides })

test('isLibraryMember: drops episodes whose file is gone, keeps replaced and unchecked rows', () => {
  assert.equal(isLibraryMember(goneRow()), false)
  assert.equal(isLibraryMember(row({ library_state: 'replaced' })), true)
  assert.equal(isLibraryMember(row()), true)
  assert.equal(isLibraryMember(row({ status: 'importing' })), true)
})

test('showSummariesOf: a show with every episode gone disappears and gone episodes leave the counts', () => {
  const rows = [
    goneRow({ recording_id: 'a', episode: 45 }),
    row({ recording_id: 'b', episode: 44 }),
    goneRow({ recording_id: 'c', title: 'Grand Designs', season: 1, episode: 1 }),
  ]
  const shows = showSummariesOf({ rows, series: [], active: [] })
  assert.deepEqual(shows.map((show) => show.key), ['the-block'])
  assert.equal(shows[0].counts.total, 1)
})

test('libraryEpisodesOf: episodes whose file is gone are never listed', () => {
  const rows = [
    goneRow({ recording_id: 'gone' }),
    row({ recording_id: 'kept', episode: 2 }),
    row({ recording_id: 'swapped', episode: 3, library_state: 'replaced' }),
  ]
  const ids = libraryEpisodesOf({ rows, state: 'unwatched' }).map((episode) => episode.recordingId)
  assert.deepEqual(ids.sort(), ['kept', 'swapped'])
})

test('showDetailOf: a gone episode does not appear on the show page', () => {
  const rows = [goneRow({ recording_id: 'gone', episode: 45 }), row({ recording_id: 'kept', episode: 44 })]
  const detail = showDetailOf({ key: 'the-block', rows })
  const ids = detail.seasons.flatMap((season) => season.episodes.map((episode) => episode.recordingId))
  assert.deepEqual(ids, ['kept'])
})
