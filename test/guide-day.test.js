import { test } from 'node:test'
import assert from 'node:assert/strict'

import { guideDayWindow, localMidnightMs, programsInWindow } from '../src/epg.js'
import { mergeGuidePrograms } from '../src/guide-history.js'
import {
  zoneOffsetMs,
  localDayNumber,
  weekdayOfDayNumber,
  localClockMs,
  dayLengthMin,
  spillLengthMin,
  rulerTickMinutes,
} from '../src/web/guide-time.js'

process.env.TZ = 'Australia/Sydney'

const SYDNEY = 'Australia/Sydney'
const HOUR_MS = 3_600_000

const sydneyClock = (ms) => new Intl.DateTimeFormat('en-AU', {
  timeZone: SYDNEY, weekday: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
}).format(new Date(ms)).replace(/\s/g, ' ').replace(',', '').toLowerCase()

const sydneyHour = (ms) => new Intl.DateTimeFormat('en-AU', { timeZone: SYDNEY, hour: 'numeric' })
  .format(new Date(ms)).replace(/\s/g, '').toLowerCase()

test('guideDayWindow: each day runs midnight to midnight across DST start (23 h Sunday)', () => {
  const startMs = localMidnightMs(new Date('2026-10-03T09:00:00'))
  const days = [0, 1, 2].map((day) => guideDayWindow({ startMs, day }))
  assert.deepEqual(days.map(({ dayEnd, dayStart }) => (dayEnd - dayStart) / HOUR_MS), [24, 23, 24])
  assert.deepEqual(days.map(({ dayStart }) => sydneyClock(dayStart)), ['sat 3 12:00 am', 'sun 4 12:00 am', 'mon 5 12:00 am'])
  assert.equal(days[0].dayEnd, days[1].dayStart)
  assert.equal(days[1].dayEnd, days[2].dayStart)
})

test('guideDayWindow: DST end makes a 25 h Sunday and Monday still starts at midnight', () => {
  const startMs = localMidnightMs(new Date('2027-04-03T21:00:00'))
  const sunday = guideDayWindow({ startMs, day: 1 })
  const monday = guideDayWindow({ startMs, day: 2 })
  assert.equal((sunday.dayEnd - sunday.dayStart) / HOUR_MS, 25)
  assert.equal(sydneyClock(monday.dayStart), 'mon 5 12:00 am')
  assert.equal(sunday.dayEnd, monday.dayStart)
})

test('guideDayWindow: the seventh day ends on a calendar midnight across DST', () => {
  const startMs = localMidnightMs(new Date('2026-10-01T12:00:00'))
  const last = guideDayWindow({ startMs, day: 6 })
  assert.equal(sydneyClock(last.dayEnd), 'thu 8 12:00 am')
  assert.equal((last.dayEnd - startMs) / HOUR_MS, 7 * 24 - 1)
})

test('rulerTickMinutes: a 23 h day has 23 hourly ticks labelled by the real clock', () => {
  const { dayStart, dayEnd } = guideDayWindow({ startMs: localMidnightMs(new Date('2026-10-04T12:00:00')) })
  assert.equal(dayLengthMin({ dayStart, dayEnd }), 23 * 60)
  const labels = rulerTickMinutes({ dayStart, dayEnd, stepMin: 60 }).map((min) => sydneyHour(dayStart + min * 60_000))
  assert.equal(labels.length, 23)
  assert.deepEqual(labels.slice(0, 4), ['12am', '1am', '3am', '4am'])
  assert.equal(labels.at(-1), '11pm')
  assert.equal(rulerTickMinutes({ dayStart, dayEnd, stepMin: 30 }).length, 46)
})

test('rulerTickMinutes: a 25 h day has 25 hourly ticks ending at 11pm', () => {
  const { dayStart, dayEnd } = guideDayWindow({ startMs: localMidnightMs(new Date('2027-04-04T12:00:00')) })
  const labels = rulerTickMinutes({ dayStart, dayEnd, stepMin: 60 }).map((min) => sydneyHour(dayStart + min * 60_000))
  assert.equal(labels.length, 25)
  assert.deepEqual(labels.slice(0, 4), ['12am', '1am', '2am', '2am'])
  assert.equal(labels.at(-1), '11pm')
})

test('localClockMs: 7pm and 6pm land on the wall clock on DST days', () => {
  for (const date of ['2026-10-04', '2027-04-04', '2026-08-25']) {
    const { dayStart } = guideDayWindow({ startMs: localMidnightMs(new Date(`${date}T12:00:00`)) })
    assert.equal(sydneyHour(localClockMs({ dayStart, hour: 19, timeZone: SYDNEY })), '7pm')
    assert.equal(sydneyHour(localClockMs({ dayStart, hour: 18, timeZone: SYDNEY })), '6pm')
  }
})

test('zoneOffsetMs: Sydney is +10 h before DST start and +11 h after', () => {
  assert.equal(zoneOffsetMs({ ms: Date.parse('2026-10-03T12:00:00Z'), timeZone: SYDNEY }), 10 * HOUR_MS)
  assert.equal(zoneOffsetMs({ ms: Date.parse('2026-10-04T12:00:00Z'), timeZone: SYDNEY }), 11 * HOUR_MS)
})

test('localDayNumber: day chips step by calendar date, not by 24 h, across DST start', () => {
  const saturdayLate = Date.parse('2026-10-03T13:30:00Z')
  const today = localDayNumber({ ms: saturdayLate, timeZone: SYDNEY })
  const chips = [0, 1, 2, 3].map((d) => weekdayOfDayNumber(today + d).toLowerCase())
  assert.deepEqual(chips, ['sat', 'sun', 'mon', 'tue'])
  const sundayLate = Date.parse('2026-10-04T12:30:00Z')
  assert.equal(localDayNumber({ ms: sundayLate, timeZone: SYDNEY }), today + 1)
  assert.equal(localDayNumber({ ms: sundayLate + HOUR_MS, timeZone: SYDNEY }), today + 2)
})

test('guideDayWindow: spillEnd is 3am on the next calendar day', () => {
  const startMs = localMidnightMs(new Date('2026-09-30T12:00:00'))
  const { dayEnd, spillEnd } = guideDayWindow({ startMs, day: 1 })
  assert.equal(sydneyClock(spillEnd), 'fri 2 3:00 am')
  assert.equal((spillEnd - dayEnd) / HOUR_MS, 3)
})

test('guideDayWindow: the spill into DST start ends at 3am wall clock, two real hours after midnight', () => {
  const saturday = guideDayWindow({ startMs: localMidnightMs(new Date('2026-10-03T23:30:00')) })
  assert.equal(sydneyClock(saturday.spillEnd), 'sun 4 3:00 am')
  assert.equal((saturday.spillEnd - saturday.dayEnd) / HOUR_MS, 2)
  const labels = rulerTickMinutes({ dayStart: saturday.dayStart, dayEnd: saturday.spillEnd, stepMin: 60 })
    .map((min) => sydneyHour(saturday.dayStart + min * 60_000))
  assert.deepEqual(labels.slice(-3), ['11pm', '12am', '1am'])
})

test('guideDayWindow: the 23 h Sunday spills to 3am Monday', () => {
  const sunday = guideDayWindow({ startMs: localMidnightMs(new Date('2026-10-04T23:30:00')) })
  assert.equal((sunday.dayEnd - sunday.dayStart) / HOUR_MS, 23)
  assert.equal(sydneyClock(sunday.spillEnd), 'mon 5 3:00 am')
  assert.equal(spillLengthMin(sunday), 26 * 60)
  const labels = rulerTickMinutes({ dayStart: sunday.dayStart, dayEnd: sunday.spillEnd, stepMin: 60 })
    .map((min) => sydneyHour(sunday.dayStart + min * 60_000))
  assert.equal(labels.length, 26)
  assert.deepEqual(labels.slice(-4), ['11pm', '12am', '1am', '2am'])
})

test('guideDayWindow: the seventh day spills to 3am after the guide ends', () => {
  const startMs = localMidnightMs(new Date('2026-10-03T12:00:00'))
  const last = guideDayWindow({ startMs, day: 6 })
  assert.equal(sydneyClock(last.dayStart), 'fri 9 12:00 am')
  assert.equal(sydneyClock(last.spillEnd), 'sat 10 3:00 am')
})

const programmeAt = ({ from, to, title }) => ({ title, start: Date.parse(from), end: Date.parse(to) })

test('programsInWindow: a programme crossing midnight is listed once, unclipped, alongside next-day programmes', () => {
  const sunday = guideDayWindow({ startMs: localMidnightMs(new Date('2026-10-04T23:30:00')) })
  const rows = [
    programmeAt({ title: 'ended before', from: '2026-10-03T23:00:00+10:00', to: '2026-10-04T00:00:00+11:00' }),
    programmeAt({ title: 'over dawn', from: '2026-10-04T00:30:00+10:00', to: '2026-10-04T04:00:00+11:00' }),
    programmeAt({ title: 'late film', from: '2026-10-04T23:00:00+11:00', to: '2026-10-05T01:15:00+11:00' }),
    programmeAt({ title: 'next day', from: '2026-10-05T01:15:00+11:00', to: '2026-10-05T02:00:00+11:00' }),
    programmeAt({ title: 'over spill end', from: '2026-10-05T02:30:00+11:00', to: '2026-10-05T04:00:00+11:00' }),
    programmeAt({ title: 'after spill', from: '2026-10-05T03:00:00+11:00', to: '2026-10-05T04:00:00+11:00' }),
  ]
  const shown = programsInWindow({ rows, fromMs: sunday.dayStart, toMs: sunday.spillEnd })
  assert.deepEqual(shown.map((p) => p.title), ['over dawn', 'late film', 'next day', 'over spill end'])
  const lateFilm = shown.find((p) => p.title === 'late film')
  assert.ok(lateFilm.start < sunday.dayEnd && lateFilm.end > sunday.dayEnd)
  assert.equal(lateFilm.end, Date.parse('2026-10-05T01:15:00+11:00'))
  assert.deepEqual(shown.filter((p) => p.start >= sunday.dayEnd).map((p) => p.title), ['next day', 'over spill end'])
})

test('programsInWindow: saved history fills the spill without doubling the midnight-crossing programme', () => {
  const saturday = guideDayWindow({ startMs: localMidnightMs(new Date('2026-10-03T23:30:00')) })
  const crossing = programmeAt({ title: 'late film', from: '2026-10-03T23:00:00+10:00', to: '2026-10-04T01:30:00+10:00' })
  const live = programsInWindow({ rows: [crossing], fromMs: saturday.dayStart, toMs: saturday.spillEnd })
  const saved = [{ ...crossing }, programmeAt({ title: 'early news', from: '2026-10-03T06:00:00+10:00', to: '2026-10-03T07:00:00+10:00' })]
  const merged = mergeGuidePrograms({ live, saved })
  assert.deepEqual(merged.map((p) => p.title), ['early news', 'late film'])
})
