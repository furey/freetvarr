import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  adsText,
  airedRangeText,
  durationText,
  libraryStateTitle,
  libraryStatusOf,
  libraryStatusText,
  recordingEpisodeLine,
  recordingSeasonEpisode,
  savesToLine,
  sourceBadgeText,
  watchedPercent,
} from '../src/web/recording-info.js'

const MKR = { title: 'My Kitchen Rules', season: 16, episode: 5, episode_title: 'Episode 5 of Season 16' }

test('recordingSeasonEpisode: pads, and copes with one part missing', () => {
  assert.equal(recordingSeasonEpisode(MKR), 'S16E05')
  assert.equal(recordingSeasonEpisode({ season: null, episode: 3 }), 'E03')
  assert.equal(recordingSeasonEpisode({}), '')
})

test('recordingEpisodeLine: leaves out the title', () => {
  assert.equal(recordingEpisodeLine(MKR), 'S16E05 · Episode 5 of Season 16')
  assert.equal(recordingEpisodeLine({ title: 'NRL', episode_title: 'NRL' }), '')
})

test('airedRangeText: day, start, and end in the chosen time zone', () => {
  const airedAt = Date.UTC(2026, 9, 7, 8, 33)
  assert.equal(airedRangeText({ airedAt, durationSeconds: 5825, timeZone: 'Australia/Sydney' }), 'Wed, 7 Oct 7:33pm–9:10pm')
  assert.equal(airedRangeText({ airedAt, durationSeconds: null, timeZone: 'Australia/Sydney' }), 'Wed, 7 Oct 7:33pm')
  assert.equal(airedRangeText({ airedAt: null, durationSeconds: 60, timeZone: 'Australia/Sydney' }), '')
})

test('durationText: hours and minutes', () => {
  assert.equal(durationText(5825), '1 hr 37 mins')
  assert.equal(durationText(3600), '1 hr')
  assert.equal(durationText(1500), '25 mins')
  assert.equal(durationText(null), '')
  assert.equal(durationText(20), 'under 1 min')
  assert.equal(durationText(45), 'under 1 min')
  assert.equal(durationText(60), '1 min')
  assert.equal(durationText(0), '')
})

test('watchedPercent: clamps to 0–100', () => {
  assert.equal(watchedPercent({ position: 30, duration: 60 }), 50)
  assert.equal(watchedPercent({ position: 90, duration: 60 }), 100)
  assert.equal(watchedPercent({ position: 30, duration: 0 }), 0)
})

test('adsText: says what the scan found and whether it cut', () => {
  const json = JSON.stringify([{ start: 0, end: 300 }, { start: 600, end: 900 }])
  assert.equal(adsText({ ad_status: 'cut', ad_breaks_json: json }), '2 breaks · 10 mins of ads, cut')
  assert.equal(adsText({ ad_status: 'detected', ad_breaks_json: json }), '2 breaks · 10 mins of ads, found')
  assert.equal(adsText({ ad_status: 'detected', ad_breaks_json: '[{"start":0,"end":20}]' }), '1 break · 1 min of ads, found')
  assert.equal(adsText({ ad_status: 'no_breaks' }), 'No ad breaks found')
  assert.equal(adsText({ ad_status: 'cut_failed' }), 'The ad cut failed; the recording is uncut')
  assert.equal(adsText({ ad_status: null }), '')
})

test('savesToLine: the library path, labelled FILE MISSING when the file is gone', () => {
  const path = '/data/media/tv/My Kitchen Rules/Season 16/x.ts'
  assert.deepEqual(savesToLine({ status: 'done', file_path: path, library_file_present: true }), { label: 'SAVES TO', text: path })
  assert.deepEqual(savesToLine({ status: 'done', file_path: path, library_file_present: false }), { label: 'FILE MISSING', text: path })
  assert.equal(savesToLine({ status: 'not_imported', file_path: null }), null)
})

test('libraryStatusText: the status as the RECORDINGS tab shows it', () => {
  assert.equal(libraryStatusText({ status: 'done', imported: '7 Oct 10:00pm', deletedFromTvh: false }), 'IMPORTED 7 Oct 10:00pm')
  assert.equal(libraryStatusText({ status: 'done', imported: '', deletedFromTvh: true }), 'IMPORTED · NOT IN TVHEADEND')
  assert.equal(libraryStatusText({ status: 'not_imported' }), 'NOT IMPORTED')
})

test('sourceBadgeText: names the file that plays', () => {
  assert.equal(sourceBadgeText('library'), 'FROM LIBRARY')
  assert.equal(sourceBadgeText('tvheadend'), 'FROM TVHEADEND')
  assert.equal(sourceBadgeText(undefined), '')
})

test('savesToLine: names the replacement or the missing file', () => {
  const base = { status: 'done', file_path: '/tv/A/A - S01E01.ts' }
  assert.deepEqual(
    savesToLine({ ...base, library_state: 'replaced', library_replacement: '/tv/A/A - S01E01 WEBDL.mkv' }),
    { label: 'REPLACED BY', text: '/tv/A/A - S01E01 WEBDL.mkv' },
  )
  assert.deepEqual(savesToLine({ ...base, library_state: 'not_in_library' }), { label: 'FILE MISSING', text: base.file_path })
  assert.deepEqual(savesToLine(base), { label: 'SAVES TO', text: base.file_path })
})

test('libraryStatusOf and libraryStatusText: the library state wins over the import status', () => {
  const replaced = { status: 'done', library_state: 'replaced' }
  assert.equal(libraryStatusOf(replaced), 'replaced')
  assert.equal(libraryStatusOf({ status: 'done', library_state: null }), 'done')
  assert.equal(libraryStatusText({ status: libraryStatusOf(replaced), imported: 'today' }), 'REPLACED')
  assert.equal(libraryStatusText({ status: 'not_in_library' }), 'NOT IN LIBRARY')
})

test('libraryStateTitle: says who replaced the file', () => {
  assert.equal(
    libraryStateTitle({ library_state: 'replaced', library_replacement: '/tv/A/A - S01E01 WEBDL.mkv' }),
    "Another app, such as Sonarr, replaced Freetvarr's file with A - S01E01 WEBDL.mkv.",
  )
  assert.equal(libraryStateTitle({ library_state: null }), '')
})
