import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import {
  classifyImport,
  matchShow,
  buildDestPath,
  episodeFilename,
  localPathFor,
  createValidFilename,
  libraryDecision,
  oneOffFilename,
  buildOneOffPath,
  looksLikeFilm,
  buildFilmPath,
  libraryKind,
} from '../src/sync.js'

test('matchShow: case-insensitive substring match', () => {
  const shows = [
    { id: 1, show_pattern: 'MasterChef Australia' },
    { id: 2, show_pattern: 'Bluey' },
  ]
  assert.equal(matchShow(shows, 'MASTERCHEF AUSTRALIA').id, 1)
  assert.equal(matchShow(shows, 'masterchef australia: special')?.id, 1)
  assert.equal(matchShow(shows, 'Bluey (2018)').id, 2)
})

test('matchShow: no match returns undefined', () => {
  const shows = [{ id: 1, show_pattern: 'Bluey' }]
  assert.equal(matchShow(shows, 'Peppa Pig'), undefined)
})

test('matchShow: empty shows list returns undefined', () => {
  assert.equal(matchShow([], 'Anything'), undefined)
})

test('matchShow: pattern is substring, not whole-word', () => {
  const shows = [{ id: 1, show_pattern: 'Survivor' }]
  assert.equal(matchShow(shows, 'Australian Survivor').id, 1)
})

test('matchShow: the longest matching pattern wins over the first', () => {
  const shows = [
    { id: 1, show_pattern: 'NRL' },
    { id: 2, show_pattern: 'NRL Grand Final' },
  ]
  assert.equal(matchShow(shows, 'NRL Grand Final').id, 2)
  assert.equal(matchShow(shows, 'NRL Friday Night Football').id, 1)
})

test('libraryDecision: imports a matched show or, by default, an unmatched one', () => {
  const show = { id: 1 }
  assert.equal(libraryDecision({ show, importUnmatched: false }).action, 'import')
  assert.equal(libraryDecision({ show: null, importUnmatched: true }).action, 'import')
  const held = libraryDecision({ show: null, importUnmatched: false })
  assert.equal(held.action, 'hold')
  assert.match(held.reason, /No series folder/)
})

test('libraryDecision: the choice made on Record overrides the setting both ways', () => {
  assert.equal(libraryDecision({ libraryChoice: 'exclude', show: { id: 1 }, importUnmatched: true }).action, 'hold')
  assert.equal(libraryDecision({ libraryChoice: 'include', show: null, importUnmatched: false }).action, 'import')
})

test('libraryDecision: a choice saved on the row overrides the choice made on Record', () => {
  const include = { library_choice: 'include' }
  assert.equal(libraryDecision({ existing: include, libraryChoice: 'exclude' }).action, 'import')
  const exclude = { library_choice: 'exclude' }
  assert.equal(libraryDecision({ existing: exclude, libraryChoice: 'include', show: { id: 1 } }).action, 'hold')
})

test('oneOffFilename: title, local air date and time, then the episode title', () => {
  const start = new Date(2026, 9, 4, 19, 30).getTime()
  assert.equal(
    oneOffFilename({ title: 'NRL Grand Final', start, ext: 'ts' }),
    'NRL Grand Final - 2026-10-04 1930.ts',
  )
  assert.equal(
    oneOffFilename({ title: 'Grand Final Night', episode_title: 'Episode 1', start, ext: 'ts' }),
    'Grand Final Night - 2026-10-04 1930 - Episode 1.ts',
  )
})

test('buildOneOffPath: files under a folder named after the title, inside the root', () => {
  const start = new Date(2026, 9, 4, 19, 30).getTime()
  const p = buildOneOffPath({ item: { title: 'AC/DC: Live', start, ext: 'ts' }, oneOffRoot: '/media/one-offs' })
  assert.equal(p, path.join('/media/one-offs', 'ACDC Live', 'ACDC Live - 2026-10-04 1930.ts'))
  assert.throws(() => buildOneOffPath({ item: { title: '..', start }, oneOffRoot: '/media/one-offs' }))
})

const film = { title: 'Isle Of Dogs', genres: [20], season: null, episode: null, start: 0, end: 110 * 60_000, ext: 'ts' }

test('looksLikeFilm: a long movie-genre programme with no episode number', () => {
  assert.equal(looksLikeFilm(film), true)
  assert.equal(looksLikeFilm({ ...film, season: 5, episode: 6 }), false)
  assert.equal(looksLikeFilm({ ...film, end: 30 * 60_000 }), false)
  assert.equal(looksLikeFilm({ ...film, genres: [64] }), false)
})

test('buildFilmPath: Title (Year) when the guide gives a year, and a copy number on a clash', () => {
  assert.equal(buildFilmPath({ item: { ...film, year: 2018 }, moviesRoot: '/m' }), path.join('/m', 'Isle Of Dogs (2018)', 'Isle Of Dogs (2018).ts'))
  assert.equal(buildFilmPath({ item: film, moviesRoot: '/m', copy: 2 }), path.join('/m', 'Isle Of Dogs', 'Isle Of Dogs (2).ts'))
})

test('libraryKind: a show rule wins, films need a movies folder, the rest are one-offs', () => {
  assert.equal(libraryKind({ show: { id: 1 }, item: film, moviesRoot: '/m' }), 'tv')
  assert.equal(libraryKind({ show: null, item: film, moviesRoot: '/m' }), 'film')
  assert.equal(libraryKind({ show: null, item: film, moviesRoot: '' }), 'oneOff')
  assert.equal(libraryKind({ show: null, item: { ...film, genres: [64] }, moviesRoot: '/m' }), 'oneOff')
})

test('episodeFilename: SxxEyy with episode title when numbered', () => {
  const name = episodeFilename({
    item: { season: 1, episode: 3, episode_title: 'The Creek', ext: 'ts' },
    show: { dest_folder: 'Bluey (2018)' },
  })
  assert.equal(name, 'Bluey (2018) - S01E03 - The Creek.ts')
})

test('episodeFilename: falls back to the air date when unnumbered', () => {
  const name = episodeFilename({
    item: { season: null, episode: null, episode_title: null, start: Date.UTC(2026, 8, 21, 9) },
    show: { dest_folder: 'The Project' },
  })
  assert.equal(name, 'The Project - 2026-09-21.ts')
})

test('buildDestPath: substitutes {season} (padded) by default', () => {
  const p = buildDestPath({
    item: { season: 1, episode: 3, ext: 'ts' },
    show: { dest_folder: 'Bluey (2018)', season_template: 'Season {season}' },
    mediaRoot: '/media/tv',
  })
  assert.equal(p, path.join('/media/tv', 'Bluey (2018)', 'Season 01', 'Bluey (2018) - S01E03.ts'))
})

test('buildDestPath: all three placeholders resolve correctly', () => {
  const p = buildDestPath({
    item: { season: 12, episode: 1, ext: 'ts' },
    show: { dest_folder: 'Show', season_template: 'S{season}-{season_padded}-{season_unpadded}' },
    mediaRoot: '/media/tv',
  })
  assert.equal(p, path.join('/media/tv', 'Show', 'S12-12-12', 'Show - S12E01.ts'))
})

test('buildDestPath: missing season info falls back to "00" / "0"', () => {
  const p = buildDestPath({
    item: { season: null, episode: null, start: Date.UTC(2026, 0, 2), ext: 'ts' },
    show: { dest_folder: 'Show', season_template: 'Season {season} ({season_unpadded})' },
    mediaRoot: '/media/tv',
  })
  assert.equal(p, path.join('/media/tv', 'Show', 'Season 00 (0)', 'Show - 2026-01-02.ts'))
})

test('buildDestPath: refuses to escape the media root', () => {
  assert.throws(() => buildDestPath({
    item: { season: 1, episode: 1, ext: 'ts' },
    show: { dest_folder: '../outside', season_template: 'Season {season}' },
    mediaRoot: '/media/tv',
  }), /escapes media root/)
})

test('createValidFilename: strips path and shell-hostile characters', () => {
  assert.equal(createValidFilename('A/B\\C:D*E?F"G<H>I|J   K'), 'ABCDEFGHIJ K')
})

test('localPathFor: rewrites the TVHeadend mount prefix to the local one', () => {
  assert.equal(
    localPathFor({ tvhFilename: '/recordings/Show/ep.ts', tvhRecordingsPath: '/recordings', recordingsRoot: '/tvh' }),
    '/tvh/Show/ep.ts',
  )
  assert.equal(
    localPathFor({ tvhFilename: '/recordings/Show/ep.ts', tvhRecordingsPath: '/recordings/', recordingsRoot: '/recordings' }),
    '/recordings/Show/ep.ts',
  )
})

test('localPathFor: returns null when the file lives outside the mount', () => {
  assert.equal(
    localPathFor({ tvhFilename: '/elsewhere/ep.ts', tvhRecordingsPath: '/recordings', recordingsRoot: '/recordings' }),
    null,
  )
})

test('classifyImport: matching size → done / imported', () => {
  const o = classifyImport({ expectedSize: 1000, actualSize: 1000 })
  assert.equal(o.dbStatus, 'done')
  assert.equal(o.summaryKey, 'imported')
  assert.equal(o.sizeToStore, 1000)
  assert.equal(o.error, null)
})

test('classifyImport: shortfall over tolerance → partial / failed', () => {
  const o = classifyImport({ expectedSize: 5_000_000, actualSize: 1_000_000 })
  assert.equal(o.dbStatus, 'partial')
  assert.equal(o.summaryKey, 'failed')
  assert.equal(o.sizeToStore, 1_000_000)
  assert.match(o.error, /short copy/)
})

test('classifyImport: shortfall within tolerance still counts as done', () => {
  const o = classifyImport({ expectedSize: 2_000_000, actualSize: 1_500_000 })
  assert.equal(o.dbStatus, 'done')
})

test('classifyImport: unknown actual size trusts the expected size', () => {
  const o = classifyImport({ expectedSize: 1000, actualSize: null })
  assert.equal(o.dbStatus, 'done')
  assert.equal(o.sizeToStore, 1000)
})
