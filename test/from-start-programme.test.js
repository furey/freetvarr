import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fromStartAiringOf, fromStartProgrammeOf, recordedProgrammeAtMsOf } from '../src/web/from-start-programme.js'
import { fromStartRecordingOf } from '../src/web/in-progress-display.js'

const MIN = 60_000
const START = Date.parse('2026-10-23T08:30:00Z')

const rugbyRecording = {
  dvrUuid: 'c53af306', programId: 358017, title: 'Rugby League World Cup 2026', episodeTitle: 'Tonga v Lebanon',
  season: 26, episode: 6, start: START, stop: START + 150 * MIN, stopPadded: START + 160 * MIN,
  recordingStartedAt: START + 30 * MIN, hasImage: true,
}

const rugbyGuide = {
  program_id: 358017, title: 'Rugby League World Cup 2026', episode_title: 'Tonga v Lebanon', series_no: 26, episode_no: 6,
  start: START, end: START + 150 * MIN, synopsis: 'Tonga take on Lebanon.', has_image: true,
}

const postGame = {
  program_id: 358090, title: 'Post Game: Tonga v Lebanon', series_no: 26, episode_no: 404,
  start: START + 150 * MIN, end: START + 180 * MIN,
}

test('fromStartProgrammeOf: keeps the recorded programme, not the padded times', () => {
  assert.deepEqual(fromStartProgrammeOf(rugbyRecording), {
    programId: 358017, title: 'Rugby League World Cup 2026', episodeTitle: 'Tonga v Lebanon',
    season: 26, episode: 6, start: START, stop: START + 150 * MIN, hasImage: true,
  })
})

test('recordedProgrammeAtMsOf: asks the guide about the middle of the recorded programme', () => {
  const programme = fromStartProgrammeOf(rugbyRecording)
  assert.equal(recordedProgrammeAtMsOf({ programme, recordingStartedAt: START + 30 * MIN }), START + 75 * MIN)
  assert.equal(recordedProgrammeAtMsOf({ programme: { start: START }, recordingStartedAt: null }), START + MIN)
  assert.equal(recordedProgrammeAtMsOf({ programme: {}, recordingStartedAt: START }), START + MIN)
  assert.equal(recordedProgrammeAtMsOf({ programme: null, recordingStartedAt: null }), null)
})

test('fromStartAiringOf: shows the guide row of the recorded programme, with no Next', () => {
  const programme = fromStartProgrammeOf(rugbyRecording)
  const airing = fromStartAiringOf({ programme, fetched: { now: rugbyGuide, next: postGame, atMs: START + 75 * MIN, loaded: true } })
  assert.equal(airing.now, rugbyGuide)
  assert.equal(airing.next, null)
  assert.equal(airing.loaded, true)
})

test('fromStartAiringOf: never shows the channel programme on after the recording', () => {
  const programme = fromStartProgrammeOf(rugbyRecording)
  const airing = fromStartAiringOf({ programme, fetched: { now: postGame, next: null, atMs: START + 160 * MIN, loaded: true } })
  assert.equal(airing.now.title, 'Rugby League World Cup 2026')
  assert.equal(airing.now.episode_title, 'Tonga v Lebanon')
  assert.equal(airing.now.series_no, 26)
  assert.equal(airing.now.episode_no, 6)
  assert.equal(airing.now.start, START)
  assert.equal(airing.now.end, START + 150 * MIN)
  assert.equal(airing.next, null)
})

test('fromStartAiringOf: before the guide answers, the recording itself fills the panel', () => {
  const airing = fromStartAiringOf({ programme: fromStartProgrammeOf(rugbyRecording), fetched: null })
  assert.equal(airing.now.title, 'Rugby League World Cup 2026')
  assert.equal(airing.now.program_id, 358017)
  assert.equal(airing.now.has_image, true)
})

test('fromStartAiringOf: without a programme id, matches the start time, since the post-game show shares the title', () => {
  const programme = fromStartProgrammeOf({ ...rugbyRecording, programId: null })
  const sameTitlePostGame = { ...postGame, title: 'Rugby League World Cup 2026', episode_title: 'Post Game: Tonga v Lebanon' }
  assert.equal(fromStartAiringOf({ programme, fetched: { now: rugbyGuide } }).now, rugbyGuide)
  assert.equal(fromStartAiringOf({ programme, fetched: { now: sameTitlePostGame } }).now.episode_title, 'Tonga v Lebanon')
})

test('fromStartAiringOf: with no times either, matches by title', () => {
  const programme = fromStartProgrammeOf({ ...rugbyRecording, programId: null, start: null, stop: null })
  const guide = { ...rugbyGuide, title: 'rugby league world cup 2026 ' }
  assert.equal(fromStartAiringOf({ programme, fetched: { now: guide } }).now, guide)
  assert.equal(fromStartAiringOf({ programme, fetched: { now: postGame } }).now.title, 'Rugby League World Cup 2026')
})

test('fromStartRecordingOf: the show page passes the programme id, episode details, and programme end', () => {
  const item = { dvrUuid: 'c53af306', programId: 358017, start: START, stop: START + 150 * MIN, stopPadded: START + 160 * MIN, recordingStartedAt: START + 30 * MIN }
  const recording = fromStartRecordingOf({ item, title: 'Rugby League World Cup 2026', episode: { episodeTitle: 'Tonga v Lebanon', season: 26, episode: 6 } })
  assert.equal(recording.programId, 358017)
  assert.equal(recording.stop, START + 150 * MIN)
  assert.equal(recording.episodeTitle, 'Tonga v Lebanon')
  assert.equal(recording.season, 26)
  assert.equal(recording.episode, 6)
  assert.equal(fromStartRecordingOf({ item, title: 'X' }).episodeTitle, '')
})
