import { test } from 'node:test'
import assert from 'node:assert/strict'

import { splitRepeats } from '../src/tvheadend.js'
import { planUpcomingRecordings } from '../src/epg.js'

const HOUR = 3_600_000
const SUNDAY_7PM = 1_792_915_200_000
const MONDAY_NOON = SUNDAY_7PM + 17 * HOUR

const entryOf = (overrides) => ({
  uuid: 'u',
  name: 'The Block',
  channelName: '9HD Sydney',
  startDate: SUNDAY_7PM,
  schedStatus: 'scheduled',
  enabled: true,
  duplicateOfStart: null,
  ...overrides,
})

const prime = entryOf({ uuid: 'prime', programId: 'e-prime' })
const encore = entryOf({ uuid: 'encore', programId: 'e-encore', startDate: MONDAY_NOON, duplicateOfStart: SUNDAY_7PM })

test('splitRepeats: a TVHeadend duplicate of a scheduled original becomes a skipped repeat', () => {
  const { recordings, repeats } = splitRepeats({ upcoming: [prime, encore] })
  assert.deepEqual(recordings.map((e) => e.uuid), ['prime'])
  assert.deepEqual(repeats.map((e) => e.uuid), ['encore'])
  assert.deepEqual(repeats[0].repeatOf, { status: 'scheduled', startDate: SUNDAY_7PM, channelName: '9HD Sydney', uuid: 'prime' })
})

test('splitRepeats: the original recording now marks the repeat as recording', () => {
  const { repeats } = splitRepeats({ upcoming: [{ ...prime, schedStatus: 'recording' }, encore] })
  assert.equal(repeats[0].repeatOf.status, 'recording')
})

test('splitRepeats: a repeat of a completed original says recorded', () => {
  const { recordings, repeats } = splitRepeats({ upcoming: [encore], pastAirings: [prime] })
  assert.deepEqual(recordings, [])
  assert.equal(repeats[0].repeatOf.status, 'recorded')
})

test('splitRepeats: a failed original leaves the repeat as a normal recording', () => {
  const { recordings, repeats } = splitRepeats({ upcoming: [encore], pastAirings: [{ ...prime, failed: true }] })
  assert.deepEqual(recordings.map((e) => e.uuid), ['encore'])
  assert.deepEqual(repeats, [])
})

test('splitRepeats: a skipped original leaves the repeat as a normal recording', () => {
  const { recordings, repeats } = splitRepeats({ upcoming: [{ ...prime, enabled: false }, encore] })
  assert.deepEqual(recordings.map((e) => e.uuid), ['encore'])
  assert.deepEqual(repeats, [])
})

test('splitRepeats: an original TVHeadend no longer holds leaves the repeat as a normal recording', () => {
  const { recordings } = splitRepeats({ upcoming: [encore], pastAirings: [] })
  assert.deepEqual(recordings.map((e) => e.uuid), ['encore'])
})

test('splitRepeats: a cleared duplicate field makes the repeat record again', () => {
  const { recordings, repeats } = splitRepeats({ upcoming: [prime, { ...encore, duplicateOfStart: null }] })
  assert.deepEqual(recordings.map((e) => e.uuid), ['prime', 'encore'])
  assert.deepEqual(repeats, [])
})

test('splitRepeats: skipped entries stay out of both lists', () => {
  const { recordings, repeats } = splitRepeats({ upcoming: [prime, { ...encore, enabled: false }] })
  assert.deepEqual(recordings.map((e) => e.uuid), ['prime'])
  assert.deepEqual(repeats, [])
})

const NOW = SUNDAY_7PM - 24 * HOUR
const guide = {
  channels: [{ id: 'nine', epgId: 9, name: '9HD Sydney' }],
  programsByChannel: {
    9: [
      { program_id: 'p-prime', series_link: 'sl-block', title: 'The Block', start: SUNDAY_7PM, end: SUNDAY_7PM + HOUR, series_no: 22, episode_no: 49 },
      { program_id: 'p-encore', series_link: 'sl-block', title: 'The Block', start: MONDAY_NOON, end: MONDAY_NOON + HOUR, series_no: 22, episode_no: 49 },
      { program_id: 'p-nonum', series_link: 'sl-block', title: 'The Block', start: MONDAY_NOON + 3 * HOUR, end: MONDAY_NOON + 4 * HOUR },
      { program_id: 'p-nonum-2', series_link: 'sl-block', title: 'The Block', start: MONDAY_NOON + 20 * HOUR, end: MONDAY_NOON + 21 * HOUR },
    ],
  },
}
const seriesTags = [{ seriesLinkId: 'sl-block', name: 'The Block', channelId: 'nine' }]

test('planUpcomingRecordings: a projected repeat of a projected episode moves to repeats', () => {
  const { upcoming, repeats } = planUpcomingRecordings({ seriesTags, guide, nowMs: NOW })
  assert.deepEqual(upcoming.map((r) => r.programId), ['p-prime', 'p-nonum', 'p-nonum-2'])
  assert.deepEqual(repeats.map((r) => r.programId), ['p-encore'])
  assert.deepEqual(repeats[0].repeatOf, { status: 'scheduled', startDate: SUNDAY_7PM, channelName: '9HD Sydney' })
})

test('planUpcomingRecordings: a projected repeat of a real timer moves to repeats', () => {
  const futureRecordings = [{ programId: 'p-prime', name: 'The Block', channelName: '9HD Sydney', startDate: SUNDAY_7PM }]
  const { upcoming, repeats } = planUpcomingRecordings({ seriesTags, futureRecordings, guide, nowMs: NOW })
  assert.deepEqual(upcoming.map((r) => r.programId), ['p-prime', 'p-nonum', 'p-nonum-2'])
  assert.deepEqual(repeats.map((r) => r.programId), ['p-encore'])
})

test('planUpcomingRecordings: a TVHeadend repeat timer is never projected again', () => {
  const futureRecordings = [{ programId: 'p-prime', name: 'The Block', startDate: SUNDAY_7PM }]
  const { upcoming, repeats } = planUpcomingRecordings({ seriesTags, futureRecordings, repeatProgramIds: ['p-encore'], guide, nowMs: NOW })
  assert.ok(!upcoming.some((r) => r.programId === 'p-encore'))
  assert.deepEqual(repeats, [])
})

test('planUpcomingRecordings: a skipped first airing does not turn the later airing into a repeat', () => {
  const { upcoming, repeats } = planUpcomingRecordings({ seriesTags, skippedProgramIds: ['p-prime'], guide, nowMs: NOW })
  assert.ok(upcoming.some((r) => r.programId === 'p-encore'))
  assert.deepEqual(repeats, [])
})
