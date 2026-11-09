import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createLibraryTitles, libraryHintsOf, libraryTitleRowsOf, recordingImageSourcesOf } from '../src/library-titles.js'

const FILM_SYNOPSIS = 'A mythic hero leads a desert people against an empire that wants their spice.'

test('libraryHintsOf: a Plex film row gives its year as the release year, its synopsis, and library presence', () => {
  const rows = libraryTitleRowsOf({ items: [{ kind: 'movie', title: 'Dune', year: 2021, synopsis: FILM_SYNOPSIS, aired_at: 5 }] })
  const hints = libraryHintsOf(rows)
  assert.equal(hints.title, 'Dune')
  assert.equal(hints.synopsis, FILM_SYNOPSIS)
  assert.deepEqual(hints.releaseYears, [2021])
  assert.ok(hints.years.includes(2021))
  assert.equal(hints.isEpisode, false)
  assert.equal(hints.inLibrary, true)
})

test('libraryHintsOf: recorded episodes give episode evidence and channel names but no release year', () => {
  const rows = libraryTitleRowsOf({
    items: [{ kind: 'episode', show_title: 'Garden Rescue', title: 'Hastings', season: 3, episode: 4, year: 2019 }],
    recordings: [{ recording_id: 'r1', title: 'Garden Rescue', season: 3, episode: 5, channel_id: 'c1', channel_name: 'Channel One', synopsis: 'A garden gets a makeover.' }],
  })
  const hints = libraryHintsOf(rows)
  assert.equal(hints.isEpisode, true)
  assert.deepEqual(hints.channelNames, ['Channel One'])
  assert.deepEqual(hints.releaseYears, [])
  assert.equal(libraryHintsOf([]), null)
})

test('recordingImageSourcesOf: lists recordings with a saved picture, newest first', () => {
  const rows = libraryTitleRowsOf({
    recordings: [
      { recording_id: 'old', title: 'Show', aired_at: 1, image_path: 'recording/old.jpg' },
      { recording_id: 'bare', title: 'Show', aired_at: 3, image_path: null },
      { recording_id: 'new', title: 'Show', aired_at: 2, image_path: 'recording/new.jpg' },
    ],
  })
  assert.deepEqual(recordingImageSourcesOf(rows), ['recording:new', 'recording:old'])
})

test('createLibraryTitles: groups rows by title key and reloads them after the TTL', async () => {
  let clock = 0
  let loads = 0
  const titles = createLibraryTitles({
    now: () => clock,
    ttlMs: 100,
    loadRows: async () => {
      loads += 1
      return libraryTitleRowsOf({ recordings: [{ recording_id: `r${loads}`, title: 'The Garden Show', image_path: 'x.jpg' }] })
    },
  })
  assert.deepEqual(await titles.recordingImagesFor('Garden Show'), ['recording:r1'])
  assert.equal((await titles.hintsFor('the garden show')).inLibrary, true)
  assert.equal(await titles.hintsFor('Unknown'), null)
  assert.equal(loads, 1)
  clock = 100
  await titles.recordingImagesFor('Garden Show')
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(await titles.recordingImagesFor('Garden Show'), ['recording:r2'])
})

test('libraryTitleRowsOf: a recording with a show title override counts under the named show', () => {
  const rows = libraryTitleRowsOf({
    recordings: [{ recording_id: 'b', title: 'The Block - Kids Room Week', show_title_override: 'The Block', image_path: 'b.jpg' }],
  })
  assert.equal(rows[0].title, 'The Block')
  assert.deepEqual(recordingImageSourcesOf(rows), ['recording:b'])
})

test('createLibraryTitles: a failed load answers with nothing', async () => {
  const titles = createLibraryTitles({ loadRows: async () => { throw new Error('db locked') } })
  assert.equal(await titles.hintsFor('Dune'), null)
  assert.deepEqual(await titles.recordingImagesFor('Dune'), [])
})
