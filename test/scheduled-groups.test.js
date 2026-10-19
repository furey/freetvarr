import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  groupScheduled,
  recordingNowRows,
  watchingRows,
  scheduledCount,
  progressPercent,
  minutesLeftText,
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
  assert.equal(row.meta, 'S04E46 · Room reveal · 9HD')
})

test('groupScheduled: later rows start the meta line with the weekday', () => {
  const [row] = groupScheduled({ upcoming: [entry('a', 72)], nowMs: NOW, timeZone: 'UTC' }).later
  assert.equal(row.meta, 'Thu · 9HD')
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
  assert.equal(rows[0].meta, 'S04E46 · Finale · 9HD · 60 min left')
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
  assert.equal(rows[0].meta, 'Not in the guide yet · notify me')
  assert.equal(rows[1].meta, 'Next Mon 8:30pm · 10 HD · record automatically')
  assert.equal(rows[1].unseen, 2)
})
