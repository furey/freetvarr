import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  inLibrary, isWatched, continueWatchingOf, newRecordingsOf, episodeCodeOf, minutesLeftOf,
  watchedFractionOf, greetingFor, favouriteOnNowOf, tonightOf, tonightMetaOf, splitClock,
  newCardMetaOf,
} from '../src/web/home-feed.js'

const row = (over) => ({
  recording_id: 'a', title: 'The Block', status: 'done', duration_s: 3600,
  playback_position_s: null, played_at: null, aired_at: 1000, playable: true, ...over,
})

test('inLibrary: failed and purged rows are out, done rows are in', () => {
  assert.equal(inLibrary(row()), true)
  assert.equal(inLibrary(row({ status: 'failed' })), false)
  assert.equal(inLibrary(row({ purged_at: '2026-01-01' })), false)
  assert.equal(inLibrary(row({ status: 'pending', deleted_from_tvh_at: '2026-01-01' })), false)
  assert.equal(inLibrary(row({ status: 'pending' })), true)
})

test('isWatched: within 30 s of the scheduled end', () => {
  assert.equal(isWatched(row({ playback_position_s: 3570 })), true)
  assert.equal(isWatched(row({ playback_position_s: 3000 })), false)
  assert.equal(isWatched(row()), false)
  assert.equal(isWatched(row({ watched_at: '2026-10-01 10:00:00' })), true)
})

test('continueWatchingOf: most recently played in-progress row', () => {
  const older = row({ recording_id: 'o', playback_position_s: 600, played_at: '2026-10-01 10:00:00' })
  const newer = row({ recording_id: 'n', playback_position_s: 900, played_at: '2026-10-02T10:00:00.000Z' })
  const done = row({ recording_id: 'd', playback_position_s: 3590, played_at: '2026-10-03 10:00:00' })
  assert.equal(continueWatchingOf([older, done, newer]).recording_id, 'n')
  assert.equal(continueWatchingOf([done, row()]), null)
})

test('continueWatchingOf: skips files that are not playable', () => {
  const gone = row({ playback_position_s: 600, played_at: '2026-10-01 10:00:00', playable: false })
  assert.equal(continueWatchingOf([gone]), null)
})

test('newRecordingsOf: unopened rows, newest first, limited', () => {
  const rows = [
    row({ recording_id: 'a', aired_at: 1 }),
    row({ recording_id: 'b', aired_at: 3 }),
    row({ recording_id: 'c', aired_at: 2, played_at: '2026-10-01 10:00:00' }),
    row({ recording_id: 'd', aired_at: 4, status: 'failed' }),
  ]
  assert.deepEqual(newRecordingsOf(rows).map((r) => r.recording_id), ['b', 'a'])
  assert.deepEqual(newRecordingsOf(rows, 1).map((r) => r.recording_id), ['b'])
})

test('episodeCodeOf, minutesLeftOf, watchedFractionOf', () => {
  assert.equal(episodeCodeOf({ season: 22, episode: 45 }), 'S22 E45')
  assert.equal(episodeCodeOf({ season: null, episode: 3 }), 'E3')
  assert.equal(episodeCodeOf({ season: null, episode: null }), '')
  assert.equal(minutesLeftOf(row({ playback_position_s: 1800 })), 30)
  assert.equal(watchedFractionOf(row({ playback_position_s: 1800 })), 0.5)
  assert.equal(watchedFractionOf(row({ duration_s: 0 })), 0)
})

test('greetingFor: follows the hour in the zone', () => {
  const at = (iso) => greetingFor({ nowMs: Date.parse(iso), timeZone: 'Australia/Sydney' })
  assert.equal(at('2026-10-19T00:00:00Z'), 'Good morning')
  assert.equal(at('2026-10-19T03:00:00Z'), 'Good afternoon')
  assert.equal(at('2026-10-19T08:00:00Z'), 'Good evening')
})

test('favouriteOnNowOf: pinned, on-air channels with a running programme', () => {
  const entries = [
    { channel: { id: 1, name: 'Seven', pinned: true }, now: { start: 0, end: 100 } },
    { channel: { id: 2, name: 'Nine', pinned: false }, now: { start: 0, end: 100 } },
    { channel: { id: 3, name: 'Ten', pinned: true, offAir: true }, now: { start: 0, end: 100 } },
    { channel: { id: 4, name: 'ABC', pinned: true }, now: null },
    { channel: { id: 5, name: 'SBS', pinned: true }, now: { start: 0, end: 10 } },
  ]
  const items = favouriteOnNowOf({ entries, nowMs: 50 })
  assert.deepEqual(items.map((i) => i.channel.id), [1])
  assert.equal(items[0].percent, 50)
})

test('tonightOf: today only, skips what is recording, caps at three', () => {
  const nowMs = Date.parse('2026-10-19T09:00:00Z')
  const at = (hours) => nowMs + hours * 3_600_000
  const upcoming = [
    { programId: 1, startDate: at(1), endDate: at(2) },
    { programId: 2, startDate: at(0.5), endDate: at(1) },
    { programId: 3, startDate: at(-1), endDate: at(0.2) },
    { programId: 4, startDate: at(30), endDate: at(31) },
    { programId: 5, startDate: at(1.5), endDate: at(2) },
    { programId: 6, startDate: at(1.6), endDate: at(2) },
    { programId: 7, startDate: at(1.7), endDate: at(2) },
  ]
  const result = tonightOf({ upcoming, activeProgramIds: [5], nowMs, timeZone: 'UTC' })
  assert.deepEqual(result.map((u) => u.programId), [3, 2, 1])
})

test('tonightMetaOf and splitClock', () => {
  assert.equal(tonightMetaOf({ season: 16, seriesNo: null, channelName: '7 Sydney' }), 'S16 · 7 Sydney')
  assert.deepEqual(splitClock('7:31 pm'), { time: '7:31', period: 'pm' })
  assert.deepEqual(splitClock('8:36pm'), { time: '8:36', period: 'pm' })
  assert.deepEqual(splitClock('20:36'), { time: '20:36', period: '' })
})

test('newCardMetaOf: episode, channel, and when it aired', () => {
  const nowMs = Date.parse('2026-10-19T09:00:00Z')
  const recording = row({ season: 1, episode: 3, channel_name: '9HD', aired_at: nowMs - 86_400_000 })
  assert.equal(newCardMetaOf({ recording, nowMs, timeZone: 'UTC' }), 'S1 E3 · 9HD · Yesterday')
})
