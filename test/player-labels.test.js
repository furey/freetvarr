import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  behindLabelOf,
  liveEdgeOf,
  steadyBehindMinutesOf,
  behindPillText,
  leftPillText,
  liveHintText,
  percentWithin,
  adMarkersOf,
  programmeRangeText,
  joinedParts,
} from '../src/web/player-labels.js'

test('behindPillText shows whole minutes, at least one', () => {
  assert.equal(behindPillText(0), '1 MIN BEHIND')
  assert.equal(behindPillText(2), '2 MIN BEHIND')
  assert.equal(behindPillText(30), '30 MIN BEHIND')
})

test('leftPillText rounds up to whole minutes', () => {
  assert.equal(leftPillText(61), '2 MIN LEFT')
  assert.equal(leftPillText(0), '1 MIN LEFT')
})

test('liveHintText names the buffer length when there is one', () => {
  assert.equal(liveHintText(1800), 'Pause or rewind up to 30 minutes. Double-tap either side to skip 10 seconds.')
  assert.equal(liveHintText(0), 'Double-tap either side to skip 10 seconds.')
})

test('percentWithin clamps and guards an empty range', () => {
  assert.equal(percentWithin({ value: 5, min: 0, max: 10 }), 50)
  assert.equal(percentWithin({ value: 20, min: 0, max: 10 }), 100)
  assert.equal(percentWithin({ value: -1, min: 0, max: 10 }), 0)
  assert.equal(percentWithin({ value: 1, min: 5, max: 5 }), 0)
})

test('adMarkersOf converts breaks to percentage spans', () => {
  const markers = adMarkersOf({ breaks: [{ start: 100, end: 200 }, { start: 5, end: 5 }], duration: 1000 })
  assert.deepEqual(markers, [{ left: 10, width: 10 }])
  assert.deepEqual(adMarkersOf({ breaks: [{ start: 1, end: 2 }], duration: 0 }), [])
})

test('programmeRangeText joins start and end with an en dash', () => {
  const clockText = (ms) => `t${ms}`
  assert.equal(programmeRangeText({ program: { start: 1, end: 2 }, clockText }), 't1–t2')
  assert.equal(programmeRangeText({ program: null, clockText }), '')
})

test('joinedParts drops empty parts', () => {
  assert.equal(joinedParts(['A', '', null, 'B']), 'A · B')
})

test('behindLabelOf uses sentence case whole minutes', () => {
  assert.equal(behindLabelOf(0), '1 min behind')
  assert.equal(behindLabelOf(3), '3 min behind')
})

test('liveEdgeOf reports the live edge until a minute shows or playing from the start', () => {
  assert.deepEqual(liveEdgeOf({ behindMinutes: 0 }), { atEdge: true, label: '' })
  assert.deepEqual(liveEdgeOf({ behindMinutes: 1 }), { atEdge: false, label: '1 min behind' })
  assert.deepEqual(liveEdgeOf({ behindMinutes: 0, fromStart: {} }), { atEdge: false, label: '1 min behind' })
})

const steadyRun = (secondsList) => secondsList.reduce((shown, seconds) => {
  shown.push(steadyBehindMinutesOf({ seconds, previous: shown.at(-1) ?? 0 }))
  return shown
}, [])

test('steadyBehindMinutesOf shows live until 15 s behind and returns to live under 10 s', () => {
  assert.deepEqual(steadyRun([0, 9, 14, 15, 12, 10, 9.9, 12]), [0, 0, 0, 1, 1, 1, 0, 0])
})

test('steadyBehindMinutesOf holds a minute through seconds-level wobble at the boundary', () => {
  const wobble = [1765, 1771, 1766, 1772, 1767, 1773, 1768, 1774, 1769, 1775]
  const shown = steadyRun(wobble)
  assert.deepEqual([...new Set(shown)], [29])
})

test('steadyBehindMinutesOf moves on once clearly past the next minute', () => {
  assert.equal(steadyBehindMinutesOf({ seconds: 1779, previous: 29 }), 29)
  assert.equal(steadyBehindMinutesOf({ seconds: 1781, previous: 29 }), 30)
  assert.equal(steadyBehindMinutesOf({ seconds: 1701, previous: 29 }), 29)
  assert.equal(steadyBehindMinutesOf({ seconds: 1699, previous: 29 }), 28)
  assert.equal(steadyBehindMinutesOf({ seconds: 600, previous: 29 }), 10)
})

test('steadyBehindMinutesOf grows one minute at a time while paused', () => {
  const paused = Array.from({ length: 300 }, (_, i) => 15 + i)
  const shown = steadyRun(paused)
  assert.deepEqual([...new Set(shown)], [1, 2, 3, 4, 5])
  const changes = shown.filter((m, i) => i > 0 && m !== shown[i - 1]).length
  assert.equal(changes, 4)
})

test('steadyBehindMinutesOf keeps the last value for a missing reading', () => {
  assert.equal(steadyBehindMinutesOf({ seconds: NaN, previous: 4 }), 4)
})
