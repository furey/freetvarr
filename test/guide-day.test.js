import { test } from 'node:test'
import assert from 'node:assert/strict'

import { guideDayWindow, localMidnightMs } from '../src/epg.js'
import {
  zoneOffsetMs,
  localDayNumber,
  weekdayOfDayNumber,
  localClockMs,
  dayLengthMin,
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
