import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatClock,
  formatClockSeconds,
  formatDate,
  formatSeconds,
  formatMinutes,
  formatHours,
  formatUptime,
  stripDayPeriodSpace,
} from '../src/web/time-format.js'

const TZ = 'Australia/Sydney'
const at = (iso) => Date.parse(iso)

test('formatClock drops the space, zero pad and capitals', () => {
  assert.equal(formatClock(at('2026-10-06T12:50:00+11:00'), TZ), '12:50pm')
  assert.equal(formatClock(at('2026-10-06T09:05:00+11:00'), TZ), '9:05am')
})

test('formatClock shows midnight and noon as 12', () => {
  assert.equal(formatClock(at('2026-10-06T00:00:00+11:00'), TZ), '12:00am')
  assert.equal(formatClock(at('2026-10-06T12:00:00+11:00'), TZ), '12:00pm')
})

test('formatClock honours the time zone', () => {
  assert.equal(formatClock(at('2026-10-06T00:00:00Z'), 'UTC'), '12:00am')
})

test('formatClockSeconds includes seconds', () => {
  assert.equal(formatClockSeconds(at('2026-10-06T12:50:25+11:00'), TZ), '12:50:25pm')
  assert.equal(formatClockSeconds(at('2026-10-06T01:02:03+11:00'), TZ), '1:02:03am')
})

test('stripDayPeriodSpace removes every kind of space before am and pm', () => {
  assert.equal(stripDayPeriodSpace('12:50 PM'), '12:50pm')
  assert.equal(stripDayPeriodSpace('12:50 am'), '12:50am')
  assert.equal(stripDayPeriodSpace('12:50 pm'), '12:50pm')
})

test('formatDate gives a proper-case short date with a comma', () => {
  assert.equal(formatDate(at('2026-10-06T12:00:00+11:00'), TZ), 'Tue, 6 Oct')
})

test('formatDate gives a long date', () => {
  assert.equal(formatDate(at('2026-10-06T12:00:00+11:00'), TZ, { long: true }), 'Tuesday, 6 October')
})

test('formatDate mixes a long weekday with a short month', () => {
  assert.equal(
    formatDate(at('2026-10-06T12:00:00+11:00'), TZ, { weekday: 'long' }),
    'Tuesday, 6 Oct',
  )
})

test('formatSeconds appends s with no space', () => {
  assert.equal(formatSeconds(0.2, 1), '0.2s')
  assert.equal(formatSeconds(0.05, 2), '0.05s')
  assert.equal(formatSeconds(10), '10s')
})

test('formatMinutes pluralises the short form', () => {
  assert.equal(formatMinutes(1), '1 min')
  assert.equal(formatMinutes(8), '8 mins')
  assert.equal(formatMinutes(0), '0 mins')
  assert.equal(formatMinutes(3.5), '3.5 mins')
})

test('formatMinutes pluralises the long form', () => {
  assert.equal(formatMinutes(1, { long: true }), '1 minute')
  assert.equal(formatMinutes(2, { long: true }), '2 minutes')
  assert.equal(formatMinutes(0, { long: true }), '0 minutes')
})

test('formatHours pluralises', () => {
  assert.equal(formatHours(1), '1 hr')
  assert.equal(formatHours(3), '3 hrs')
  assert.equal(formatHours(24), '24 hrs')
})

test('formatSeconds trims trailing zeros', () => {
  assert.equal(formatSeconds(3, 1), '3s')
  assert.equal(formatSeconds(0.2), '0.2s')
})

test('formatUptime: seconds only below a minute', () => {
  assert.equal(formatUptime(0), '0 secs')
  assert.equal(formatUptime(1), '1 sec')
  assert.equal(formatUptime(45.9), '45 secs')
})

test('formatUptime: minutes with padded seconds', () => {
  assert.equal(formatUptime(60), '1 min 00 secs')
  assert.equal(formatUptime(12 * 60 + 5), '12 mins 05 secs')
  assert.equal(formatUptime(45 * 60 + 1), '45 mins 01 sec')
})

test('formatUptime: hours with minutes and padded seconds', () => {
  assert.equal(formatUptime(2 * 3600 + 15 * 60 + 5), '2 hrs 15 mins 05 secs')
  assert.equal(formatUptime(3600), '1 hr 0 mins 00 secs')
  assert.equal(formatUptime(3600 + 60 + 30), '1 hr 1 min 30 secs')
})

test('formatUptime: days drop seconds', () => {
  assert.equal(formatUptime(3 * 86400 + 4 * 3600 + 15 * 60 + 5), '3 days 4 hrs 15 mins')
  assert.equal(formatUptime(86400), '1 day')
  assert.equal(formatUptime(2 * 86400 + 59 * 60), '2 days 59 mins')
})

