import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  groupScheduled,
  recordingNowRows,
  watchingRows,
  scheduledCount,
  progressPercent,
  minutesLeftText,
  durationText,
  weekStrip,
  episodeMetaParts,
  scheduledCountOfState,
  repeatCount,
  withoutRepeats,
} from '../src/web/scheduled-groups.js'

const HOUR = 3_600_000
const NOW = Date.UTC(2026, 9, 19, 2, 0, 0)

const entry = (programId, hoursAhead, extra = {}) => ({
  programId,
  name: 'The Block',
  channelId: 'c1',
  channelName: '9HD',
  startDate: NOW + hoursAhead * HOUR,
  endDate: NOW + (hoursAhead + 1) * HOUR,
  source: 'timer',
  ...extra,
})

test('groupScheduled: splits by local day into today, tomorrow and later', () => {
  const groups = groupScheduled({
    upcoming: [entry('a', 1), entry('b', 24), entry('c', 72), entry('d', 24 * 8)],
    nowMs: NOW,
    timeZone: 'UTC',
  })
  assert.deepEqual(groups.today.map((r) => r.programId), ['a'])
  assert.deepEqual(groups.tomorrow.map((r) => r.programId), ['b'])
  assert.deepEqual(groups.later.map((r) => r.programId), ['c'])
})

test('groupScheduled: follows the configured time zone', () => {
  const groups = groupScheduled({
    upcoming: [entry('a', 12)],
    nowMs: NOW,
    timeZone: 'Australia/Melbourne',
  })
  assert.equal(groups.tomorrow.length, 1)
  assert.equal(groupScheduled({ upcoming: [entry('a', 12)], nowMs: NOW, timeZone: 'UTC' }).today.length, 1)
})

test('groupScheduled: marks series projections expected and skipped entries off', () => {
  const groups = groupScheduled({
    upcoming: [entry('a', 1, { source: 'series' }), entry('b', 2)],
    skipped: [entry('c', 3)],
    nowMs: NOW,
    timeZone: 'UTC',
  })
  assert.deepEqual(groups.today.map((r) => [r.programId, r.state]), [['a', 'expected'], ['b', 'on'], ['c', 'off']])
  assert.equal(scheduledCount(groups), 2)
})

test('groupScheduled: drops recording-now, past, duplicate and distant entries', () => {
  const groups = groupScheduled({
    upcoming: [entry('a', 1), entry('b', -3), entry('c', 2)],
    skipped: [entry('c', 2)],
    activeProgramIds: ['a'],
    nowMs: NOW,
    timeZone: 'UTC',
  })
  assert.deepEqual(groups.today.map((r) => [r.programId, r.state]), [['c', 'on']])
})

test('groupScheduled: formats the row time, show key and meta', () => {
  const [row] = groupScheduled({
    upcoming: [entry('a', 42.5, { episodeTitle: 'Room reveal', season: 4, seriesNo: 4, episodeNo: 46 })],
    nowMs: NOW,
    timeZone: 'UTC',
  }).tomorrow
  assert.equal(row.time, '8:30')
  assert.equal(row.period, 'pm')
  assert.equal(row.showKey, 'the-block')
  assert.equal(row.meta, 'S4 E46 · Room reveal · 9HD · 1h')
  assert.equal(row.day, '')
})

test('groupScheduled: later rows carry the weekday for the time column', () => {
  const [row] = groupScheduled({ upcoming: [entry('a', 72, { hasImage: true })], nowMs: NOW, timeZone: 'UTC' }).later
  assert.equal(row.day, 'Thu')
  assert.equal(row.meta, '9HD · 1h')
  assert.equal(row.imageProgramId, 'a')
})

test('durationText: formats minutes and hours compactly', () => {
  assert.equal(durationText({ start: 0, end: 30 * 60_000 }), '30m')
  assert.equal(durationText({ start: 0, end: HOUR }), '1h')
  assert.equal(durationText({ start: 0, end: HOUR + 10 * 60_000 }), '1h 10m')
  assert.equal(durationText({ start: HOUR, end: 0 }), '')
})

test('weekStrip: counts active recordings per day for seven days and marks clashes', () => {
  const groups = groupScheduled({
    upcoming: [entry('a', 1), entry('b', 2), entry('c', 24), entry('d', 72)],
    skipped: [entry('e', 25)],
    nowMs: NOW,
    timeZone: 'UTC',
  })
  const days = weekStrip({ groups, recordingNowCount: 2, clashDays: [groups.today[0].dayNumber], nowMs: NOW, timeZone: 'UTC' })
  assert.equal(days.length, 7)
  assert.deepEqual(days.map((d) => d.count), [4, 1, 0, 1, 0, 0, 0])
  assert.deepEqual(days.slice(0, 3).map((d) => [d.weekday, d.date, d.countText]), [['Mon', 19, '4 rec'], ['Tue', 20, '1 rec'], ['Wed', 21, '—']])
  assert.equal(days[0].isToday, true)
  assert.equal(days[0].hasClash, true)
  assert.equal(days[1].hasClash, false)
})

test('recordingNowRows: skips failed recordings and computes progress', () => {
  const rows = recordingNowRows({
    active: [
      { uuid: 'u1', programId: 'p1', title: 'The Block', episodeTitle: 'Finale', channelName: '9HD', start: NOW - HOUR, stop: NOW + HOUR, season: 4, episode: 46 },
      { uuid: 'u2', title: 'Broken', failed: true },
    ],
    nowMs: NOW,
  })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].percent, 50)
  assert.equal(rows[0].meta, 'S4 E46 · Finale · 9HD · 60 min left')
  assert.equal(rows[0].showKey, 'the-block')
})

test('progressPercent: clamps and tolerates a zero span', () => {
  assert.equal(progressPercent({ start: 0, stop: 0, nowMs: 5 }), 0)
  assert.equal(progressPercent({ start: 0, stop: 10, nowMs: 20 }), 100)
  assert.equal(progressPercent({ start: 10, stop: 20, nowMs: 0 }), 0)
})

test('minutesLeftText: empty once the programme has ended', () => {
  assert.equal(minutesLeftText({ stop: NOW - 1, nowMs: NOW }), '')
  assert.equal(minutesLeftText({ stop: NOW + 90_000, nowMs: NOW }), '2 min left')
})

test('watchingRows: describes matches and missing matches', () => {
  const rows = watchingRows({
    timeZone: 'UTC',
    items: [
      { id: 1, title: 'Grand Designs', mode: 'notify', nextMatch: null, unseen: 0 },
      { id: 2, title: 'Gogglebox', mode: 'record', nextMatch: { start: NOW + 18.5 * HOUR, channelName: '10 HD' }, unseen: 2 },
    ],
  })
  assert.equal(rows[0].meta, 'Not in the guide yet · list only')
  assert.equal(rows[1].meta, 'Next Mon 8:30pm · 10 HD · record automatically')
  assert.equal(rows[1].unseen, 2)
})

test('watchingRows: shows the padding for Record when it appears', () => {
  const rows = watchingRows({
    timeZone: 'UTC',
    items: [
      { id: 1, title: 'Utopia', mode: 'record', leadTime: 2, lagTime: 5, nextMatch: null },
      { id: 2, title: 'Gruen', mode: 'record', leadTime: null, lagTime: null, nextMatch: null },
      { id: 3, title: 'Bluey', mode: 'notify', leadTime: 2, lagTime: 5, nextMatch: null },
    ],
  })
  assert.equal(rows[0].meta, 'Not in the guide yet · record automatically · starts 2m early, finishes 5m late')
  assert.equal(rows[1].meta, 'Not in the guide yet · record automatically')
  assert.equal(rows[2].meta, 'Not in the guide yet · list only')
})

test('episodeMetaParts: turns placeholder episode titles into a season and episode number', () => {
  assert.deepEqual(episodeMetaParts({ season: 16, episodeTitle: 'Episode 9 of Season 16' }), ['S16 E9'])
  assert.deepEqual(episodeMetaParts({ season: 22, episodeTitle: 'episode 47' }), ['S22 E47'])
  assert.deepEqual(episodeMetaParts({ episodeTitle: 'EPISODE 3 OF SEASON 2' }), ['S2 E3'])
  assert.deepEqual(episodeMetaParts({ season: 1, episodeTitle: 'Korea' }), ['S1', 'Korea'])
  assert.deepEqual(episodeMetaParts({ seriesNo: 4, episodeNo: 46, episodeTitle: 'Episode 46 is the one' }), ['S4 E46', 'Episode 46 is the one'])
  assert.deepEqual(episodeMetaParts({ episodeTitle: 'Front Yard Reveal' }), ['Front Yard Reveal'])
  assert.deepEqual(episodeMetaParts({}), [])
})

test('groupScheduled: rows drop placeholder episode titles from the meta line', () => {
  const [row] = groupScheduled({
    upcoming: [entry('a', 1, { season: 22, episodeTitle: 'Episode 48 of Season 22' })],
    nowMs: NOW,
    timeZone: 'UTC',
  }).today
  assert.equal(row.meta, 'S22 E48 · 9HD · 1h')
})

test('scheduledCountOfState: counts what the Scheduled page lists, not every TVHeadend timer', () => {
  const state = {
    upcomingRecordings: [entry('a', 1), entry('b', 2, { source: 'series' }), entry('c', 24 * 9), entry('d', 0.5)],
    skippedRecordings: [entry('e', 3)],
    activeRecordingIds: ['d'],
  }
  assert.equal(scheduledCountOfState({ state, nowMs: NOW, timeZone: 'UTC' }), 2)
  assert.equal(scheduledCountOfState({ state, activeProgramIds: ['a'], nowMs: NOW, timeZone: 'UTC' }), 1)
  assert.equal(scheduledCountOfState({ state: null, nowMs: NOW, timeZone: 'UTC' }), 0)
})

test('groupScheduled: a repeat is a skipped row naming its original airing', () => {
  const original = entry('prime', 1)
  const repeat = entry('encore', 24, { repeatOf: { status: 'recorded', startDate: NOW - 17 * HOUR } })
  const groups = groupScheduled({ upcoming: [original], repeats: [repeat], nowMs: NOW, timeZone: 'UTC' })
  const [row] = groups.tomorrow
  assert.equal(row.state, 'repeat')
  assert.equal(row.key, 'encore-repeat')
  assert.equal(row.repeatText, 'recorded Sun 9:00am')
  assert.doesNotMatch(row.meta, /Repeat|Skipped/)
  assert.equal(scheduledCount(groups), 1)
})

test('scheduledCountOfState and weekStrip: repeats never count', () => {
  const state = {
    upcomingRecordings: [entry('prime', 1)],
    repeatRecordings: [entry('encore', 2, { repeatOf: { status: 'scheduled', startDate: NOW + HOUR } })],
  }
  assert.equal(scheduledCountOfState({ state, nowMs: NOW, timeZone: 'UTC' }), 1)
  const groups = groupScheduled({ upcoming: state.upcomingRecordings, repeats: state.repeatRecordings, nowMs: NOW })
  assert.equal(weekStrip({ groups, nowMs: NOW })[0].count, 1)
})

test('repeatSkippedText: says when the original recorded or will record', async () => {
  const { repeatSkippedText } = await import('../src/web/scheduled-groups.js')
  const startDate = Date.UTC(2026, 9, 25, 8, 0, 0)
  assert.equal(repeatSkippedText({ repeatOf: { status: 'recorded', startDate }, timeZone: 'Australia/Sydney' }), 'recorded Sun 7:00pm')
  assert.equal(repeatSkippedText({ repeatOf: { status: 'scheduled', startDate }, timeZone: 'Australia/Sydney' }), 'records Sun 7:00pm instead')
  assert.equal(repeatSkippedText({ repeatOf: null }), 'already recorded')
})

test('repeatOriginalText: names a scheduled, recorded, or recording original', async () => {
  const { repeatOriginalText } = await import('../src/web/scheduled-groups.js')
  const startDate = Date.UTC(2026, 9, 25, 8, 0, 0)
  assert.equal(repeatOriginalText({ repeatOf: { status: 'scheduled', startDate }, timeZone: 'Australia/Sydney' }), 'scheduled Sun 7:00pm')
  assert.equal(repeatOriginalText({ repeatOf: { status: 'recorded', startDate }, timeZone: 'Australia/Sydney' }), 'recorded Sun 7:00pm')
  assert.equal(repeatOriginalText({ repeatOf: { status: 'recording', startDate } }), 'recording now')
  assert.equal(repeatOriginalText({ repeatOf: null }), '')
})

test('repeatNoticeOf: explains the skip and the fallback for each original state', async () => {
  const { repeatNoticeOf } = await import('../src/web/scheduled-groups.js')
  const startDate = Date.UTC(2026, 9, 25, 8, 0, 0)
  const timeZone = 'Australia/Sydney'
  assert.equal(repeatNoticeOf({ repeatOf: { status: 'recorded', startDate }, timeZone }),
    "Repeat of the episode recorded Sun 7:00pm, so it won't record. If that one fails, this one records.")
  assert.equal(repeatNoticeOf({ repeatOf: { status: 'scheduled', startDate }, timeZone }),
    "Repeat of the episode scheduled for Sun 7:00pm, so it won't record. If that one fails, this one records.")
  assert.match(repeatNoticeOf({ repeatOf: null }), /^Repeat of the episode already recorded, so/)
})

test('repeatCount and withoutRepeats: count repeats and drop them, emptying days that held only repeats', () => {
  const groups = groupScheduled({
    upcoming: [entry('a', 1)],
    skipped: [entry('s', 2)],
    repeats: [entry('r1', 3), entry('r2', 26), entry('r3', 72)],
    nowMs: NOW,
    timeZone: 'UTC',
  })
  assert.equal(repeatCount(groups), 3)
  const shown = withoutRepeats(groups)
  assert.deepEqual(shown.today.map((r) => r.programId), ['a', 's'])
  assert.deepEqual([shown.tomorrow.length, shown.later.length], [0, 0])
  assert.equal(repeatCount(shown), 0)
  assert.equal(scheduledCount(shown), scheduledCount(groups))
})

test('weekStrip: counts match whether repeats are shown or hidden', () => {
  const groups = groupScheduled({ upcoming: [entry('a', 1)], repeats: [entry('r', 26)], nowMs: NOW, timeZone: 'UTC' })
  const counts = (g) => weekStrip({ groups: g, nowMs: NOW, timeZone: 'UTC' }).map((d) => d.count)
  assert.deepEqual(counts(withoutRepeats(groups)), counts(groups))
})

test('groupScheduled: rows at the same start keep one order whatever their state', () => {
  const bigBrother = entry('bb', 24 * 3, { name: 'Big Brother Australia', channelName: '10 HD' })
  const euroHouse = entry('eh', 24 * 3, { name: '1 Euro House', channelName: '9HD Sydney' })
  const orderOf = (lists) => groupScheduled({ ...lists, nowMs: NOW, timeZone: 'UTC' }).later.map((r) => r.programId)
  const expected = ['eh', 'bb']
  assert.deepEqual(orderOf({ upcoming: [bigBrother, euroHouse] }), expected)
  assert.deepEqual(orderOf({ upcoming: [euroHouse, bigBrother] }), expected)
  assert.deepEqual(orderOf({ upcoming: [euroHouse], skipped: [bigBrother] }), expected)
  assert.deepEqual(orderOf({ upcoming: [bigBrother], skipped: [euroHouse] }), expected)
  assert.deepEqual(orderOf({ upcoming: [euroHouse], repeats: [bigBrother] }), expected)
  assert.deepEqual(orderOf({ upcoming: [{ ...bigBrother, source: 'series' }, euroHouse] }), expected)
})
