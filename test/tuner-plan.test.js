import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  planTuners,
  clashById,
  clashRangeText,
  clashSentence,
  tonightTimeline,
  tunerRecordingsOf,
  timelineTitle,
  stackBars,
} from '../src/web/tuner-plan.js'

const MIN = 60_000
const EIGHT_PM = Date.UTC(2026, 9, 20, 20, 0, 0)
const at = (minutes) => EIGHT_PM + minutes * MIN
const rec = (id, from, to, extra = {}) => ({ id, title: id, start: at(from), end: at(to), ...extra })

test('planTuners: returns null when the tuner count is unknown', () => {
  assert.equal(planTuners({ recordings: [rec('a', 0, 60)] }), null)
  assert.equal(planTuners({ recordings: [rec('a', 0, 60)], tunerCount: 0 }), null)
})

test('planTuners: assigns greedily by start time and reuses a tuner once it frees', () => {
  const plan = planTuners({
    recordings: [rec('c', 60, 90), rec('a', 0, 60), rec('b', 10, 40)],
    tunerCount: 2,
  })
  assert.deepEqual(plan.lanes.map((lane) => lane.map((r) => r.id)), [['a', 'c'], ['b']])
  assert.deepEqual(plan.clashes, [])
})

test('planTuners: a third overlapping recording clashes until the first tuner frees', () => {
  const plan = planTuners({
    recordings: [rec('block', -30, 40), rec('mkr', -30, 45), rec('gogglebox', 30, 90)],
    tunerCount: 2,
  })
  assert.equal(plan.clashes.length, 1)
  const [clash] = plan.clashes
  assert.equal(clash.id, 'gogglebox')
  assert.equal(clash.from, at(30))
  assert.equal(clash.to, at(40))
  assert.equal(clash.tunersNeeded, 3)
  assert.deepEqual(plan.lanes[0].map((r) => [r.id, Boolean(r.joinedLate)]), [['block', false], ['gogglebox', true]])
})

test('planTuners: a recording that never gets a tuner clashes for its whole span', () => {
  const plan = planTuners({ recordings: [rec('a', 0, 120), rec('b', 30, 60)], tunerCount: 1 })
  assert.equal(plan.clashes[0].to, plan.clashes[0].end)
  assert.equal(plan.lanes[0].length, 1)
})

test('planTuners: recordings on the same multiplex share a tuner, unknown muxes do not', () => {
  const shared = planTuners({
    recordings: [rec('a', 0, 60, { mux: 'nine' }), rec('b', 10, 50, { mux: 'nine' })],
    tunerCount: 1,
  })
  assert.deepEqual(shared.clashes, [])
  const unknown = planTuners({ recordings: [rec('a', 0, 60), rec('b', 10, 50)], tunerCount: 1 })
  assert.equal(unknown.clashes.length, 1)
})

test('planTuners: padding touching end to start does not clash', () => {
  const plan = planTuners({ recordings: [rec('a', 0, 30), rec('b', 30, 60)], tunerCount: 1 })
  assert.deepEqual(plan.clashes, [])
})

test('clashSentence and clashRangeText: describe the missing tuner in plain words', () => {
  const plan = planTuners({
    recordings: [
      rec('The Block', -30, 40), rec('MKR', -30, 45),
      { id: 'g', title: 'Gogglebox', start: at(30), end: at(90) },
    ],
    tunerCount: 2,
  })
  const clash = clashById(plan).get('g')
  assert.equal(clashRangeText({ clash, timeZone: 'UTC' }), '8:30–8:40 pm')
  assert.equal(
    clashSentence({ clash, timeZone: 'UTC' }),
    'Gogglebox needs a third tuner from 8:30 to 8:40 pm. Skip one of the three, or it misses its first 10 minutes.',
  )
})

test('clashSentence: says when a recording does not record at all', () => {
  const plan = planTuners({ recordings: [rec('a', 0, 120), rec('b', 30, 60)], tunerCount: 1 })
  assert.match(clashSentence({ clash: plan.clashes[0], timeZone: 'UTC' }), /a second tuner from 8:30 to 9:00 pm\. Skip one of the two, or it does not record at all\.$/)
})

test('clashRangeText: keeps both periods when the range crosses noon', () => {
  const clash = { from: Date.UTC(2026, 9, 20, 11, 50), to: Date.UTC(2026, 9, 20, 12, 10) }
  assert.equal(clashRangeText({ clash, timeZone: 'UTC' }), '11:50 am–12:10 pm')
})

test('tonightTimeline: places bars, the now line and hour ticks in a five hour window', () => {
  const plan = planTuners({
    recordings: [rec('a', -30, 40), rec('b', 600, 660), rec('c', -30, 45), rec('d', 30, 90)],
    tunerCount: 2,
  })
  const timeline = tonightTimeline({ plan, nowMs: at(6), timeZone: 'UTC' })
  assert.deepEqual(timeline.ticks.map((t) => t.label), ['7 pm', '8 pm', '9 pm', '10 pm', '11 pm'])
  assert.equal(timeline.nowPercent, 32)
  assert.deepEqual(timeline.lanes.map((lane) => lane.bars.map((b) => b.key)), [['a'], ['c']])
  assert.equal(timeline.lanes[0].bars[0].isRecording, true)
  assert.deepEqual(timeline.clashBars.map((b) => b.key), ['d'])
  assert.equal(timeline.clashes.length, 1)
  assert.equal(timeline.isEmpty, false)
  assert.equal(timeline.title, "Tonight's tuners")
})

test('tonightTimeline: moves to the next recording within a day when the next few hours are empty', () => {
  const plan = planTuners({ recordings: [rec('late', 600, 660)], tunerCount: 1 })
  const timeline = tonightTimeline({ plan, nowMs: at(6), timeZone: 'UTC' })
  assert.equal(timeline.nowPercent, null)
  assert.deepEqual(timeline.lanes[0].bars.map((b) => b.key), ['late'])
  assert.equal(timeline.ticks[0].label, '5 am')
})

test('tonightTimeline: shows the first clash within a day even when other recordings are sooner', () => {
  const plan = planTuners({ recordings: [rec('soon', 10, 40), rec('a', 600, 660), rec('b', 610, 650)], tunerCount: 1 })
  const timeline = tonightTimeline({ plan, nowMs: at(6), timeZone: 'UTC' })
  assert.deepEqual(timeline.clashBars.map((b) => b.key), ['b'])
  assert.equal(timeline.nowPercent, null)
})

test('tonightTimeline: follows a half-hour time zone', () => {
  const plan = planTuners({ recordings: [], tunerCount: 1 })
  const timeline = tonightTimeline({ plan, nowMs: at(6), timeZone: 'Australia/Adelaide' })
  assert.equal(timeline.isEmpty, true)
  assert.ok(timeline.ticks.every((t) => /^\d+ (am|pm)$/.test(t.label)))
})

test('tunerRecordingsOf: uses padded timers, pads expected series episodes and drops skipped ones', () => {
  const recordings = tunerRecordingsOf({
    futureRecordings: [
      { programId: 1, name: 'A', startDate: at(0), endDate: at(60), paddedStartDate: at(-2), paddedEndDate: at(65) },
      { programId: 2, name: 'B', startDate: at(0), endDate: at(60) },
    ],
    upcoming: [
      { programId: 1, name: 'A', source: 'timer', startDate: at(0), endDate: at(60) },
      { programId: 3, name: 'C', source: 'series', seriesLinkId: 'link', startDate: at(0), endDate: at(60) },
    ],
    seriesTags: [{ seriesLinkId: 'link', leadTime: 2, lagTime: 5 }],
    skippedIds: [2],
  })
  assert.deepEqual(recordings.map((r) => [r.id, r.start, r.end]), [
    ['1', at(-2), at(65)],
    ['3', at(-2), at(65)],
  ])
})

test('timelineTitle: names the day and part of day the window shows', () => {
  const nowMs = Date.UTC(2026, 9, 20, 0, 50)
  const hour = (day, h) => Date.UTC(2026, 9, day, h, 0)
  assert.equal(timelineTitle({ anchorMs: hour(20, 12), nowMs, timeZone: 'UTC' }), "Today's tuners")
  assert.equal(timelineTitle({ anchorMs: hour(20, 17), nowMs, timeZone: 'UTC' }), "Tonight's tuners")
  assert.equal(timelineTitle({ anchorMs: hour(21, 19), nowMs, timeZone: 'UTC' }), "Tomorrow's tuners")
  assert.equal(timelineTitle({ anchorMs: hour(22, 19), nowMs, timeZone: 'UTC' }), "Thursday's tuners")
  assert.equal(timelineTitle({ anchorMs: hour(20, 8), nowMs: hour(20, 8), timeZone: 'Australia/Sydney' }), "Tonight's tuners")
})

test('tonightTimeline: titles a daytime window found from an early morning now', () => {
  const plan = planTuners({ recordings: [rec('noon', 960, 1020)], tunerCount: 1 })
  const timeline = tonightTimeline({ plan, nowMs: at(290), timeZone: 'UTC' })
  assert.equal(timeline.title, "Today's tuners")
})

test('stackBars: puts overlapping bars on separate sub-lanes and reuses a lane once it is clear', () => {
  const bars = [
    { key: 'a', left: 10, width: 30 },
    { key: 'b', left: 30, width: 20 },
    { key: 'c', left: 40, width: 10 },
    { key: 'd', left: 55, width: 10 },
  ]
  assert.deepEqual(stackBars(bars).map((lane) => lane.map((bar) => bar.key)), [['a', 'c', 'd'], ['b']])
  assert.deepEqual(stackBars([]), [])
})

test('tonightTimeline: overlapping clashes get their own clash rows', () => {
  const plan = planTuners({ recordings: [rec('a', 0, 120), rec('b', 10, 60), rec('c', 30, 90)], tunerCount: 1 })
  const timeline = tonightTimeline({ plan, nowMs: at(6), timeZone: 'UTC' })
  assert.deepEqual(timeline.clashLanes.map((lane) => lane.map((bar) => bar.key)), [['b'], ['c']])
})
