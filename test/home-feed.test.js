import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  continueWatchingUrl, newRecordingsUrl, showHrefOf, episodeCodeOf, minutesLeftOf,
  watchedFractionOf, greetingFor, favouriteOnNowOf, tonightOf, tonightMetaOf, splitClock,
  newCardMetaOf,
} from '../src/web/home-feed.js'

const episode = (over) => ({
  recordingId: 'a', showKey: 'the-block', title: 'The Block', durationS: 3600,
  positionS: null, playedAt: null, airedAt: 1000, ...over,
})

test('episode feed urls ask the library for one in-progress and the newest unplayed', () => {
  assert.equal(continueWatchingUrl, '/api/library/episodes?state=in-progress&limit=1')
  assert.equal(newRecordingsUrl, '/api/library/episodes?state=new&limit=12')
})

test('showHrefOf: links to the show page by key', () => {
  assert.equal(showHrefOf(episode()), '#/recordings/show/the-block')
})

test('episodeCodeOf, minutesLeftOf, watchedFractionOf', () => {
  assert.equal(episodeCodeOf({ season: 22, episode: 45 }), 'S22 E45')
  assert.equal(episodeCodeOf({ season: null, episode: 3 }), 'E3')
  assert.equal(episodeCodeOf({ season: null, episode: null }), '')
  assert.equal(minutesLeftOf(episode({ positionS: 1800 })), 30)
  assert.equal(watchedFractionOf(episode({ positionS: 1800 })), 0.5)
  assert.equal(watchedFractionOf(episode({ durationS: 0 })), 0)
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
  const item = episode({ season: 1, episode: 3, channelName: '9HD', airedAt: nowMs - 86_400_000 })
  assert.equal(newCardMetaOf({ episode: item, nowMs, timeZone: 'UTC' }), 'S1 E3 · 9HD · Yesterday')
})
