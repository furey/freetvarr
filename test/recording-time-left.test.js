import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recordingEndMsOf, recordingLeftText } from '../src/web/recording-time-left.js'
import { formatMinutes } from '../src/web/time-format.js'

const MIN = 60_000
const NOW = Date.UTC(2026, 9, 23, 11, 8, 0)

test('recordingEndMsOf: prefers the padded stop and parses ISO strings', () => {
  assert.equal(recordingEndMsOf({ stop: NOW, stopPadded: NOW + 10 * MIN }), NOW + 10 * MIN)
  assert.equal(recordingEndMsOf({ stop: NOW }), NOW)
  assert.equal(recordingEndMsOf({ stop: new Date(NOW).toISOString(), stopPadded: null }), NOW)
  assert.equal(recordingEndMsOf({ stop: 'soon' }), null)
  assert.equal(recordingEndMsOf(), null)
})

test('recordingLeftText: counts to the padded stop after the programme has ended', () => {
  const rugby = { stop: NOW - 8 * MIN, stopPadded: NOW + 2 * MIN }
  assert.equal(recordingLeftText({ recording: rugby, nowMs: NOW }), '2 min left')
})

test('recordingLeftText: rounds part minutes up', () => {
  assert.equal(recordingLeftText({ recording: { stop: NOW + 90_000 }, nowMs: NOW }), '2 min left')
  assert.equal(recordingLeftText({ recording: { stop: NOW + MIN }, nowMs: NOW }), '1 min left')
})

test('recordingLeftText: never says 0 min; under a minute and past the stop have words', () => {
  assert.equal(recordingLeftText({ recording: { stop: NOW + 59_000 }, nowMs: NOW }), 'less than a minute left')
  assert.equal(recordingLeftText({ recording: { stop: NOW + 1 }, nowMs: NOW }), 'less than a minute left')
  assert.equal(recordingLeftText({ recording: { stop: NOW }, nowMs: NOW }), 'finishing')
  assert.equal(recordingLeftText({ recording: { stop: NOW - 5 * MIN, stopPadded: NOW - MIN }, nowMs: NOW }), 'finishing')
})

test('recordingLeftText: empty without a stop, and takes the minutes wording of the screen', () => {
  assert.equal(recordingLeftText({ recording: {}, nowMs: NOW }), '')
  assert.equal(recordingLeftText({ recording: { stop: NOW + 47 * MIN }, nowMs: NOW, minutesText: formatMinutes }), '47 mins left')
})
