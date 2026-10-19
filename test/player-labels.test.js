import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  behindLabelOf,
  liveEdgeOf,
  behindPillText,
  leftPillText,
  liveHintText,
  percentWithin,
  adMarkersOf,
  programmeRangeText,
  joinedParts,
} from '../src/web/player-labels.js'

test('behindPillText switches from seconds to minutes at one minute', () => {
  assert.equal(behindPillText(12), '12 SEC BEHIND')
  assert.equal(behindPillText(0), '1 SEC BEHIND')
  assert.equal(behindPillText(59.4), '59 SEC BEHIND')
  assert.equal(behindPillText(120), '2 MIN BEHIND')
  assert.equal(behindPillText(1790), '30 MIN BEHIND')
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

test('behindLabelOf uses sentence case seconds then minutes', () => {
  assert.equal(behindLabelOf(0), '1 sec behind')
  assert.equal(behindLabelOf(45), '45 sec behind')
  assert.equal(behindLabelOf(150), '3 min behind')
})

test('liveEdgeOf reports the live edge until behind the threshold or playing from the start', () => {
  assert.deepEqual(liveEdgeOf({ behindSeconds: 3 }), { atEdge: true, label: '' })
  assert.deepEqual(liveEdgeOf({ behindSeconds: 10 }), { atEdge: false, label: '10 sec behind' })
  assert.deepEqual(liveEdgeOf({ behindSeconds: 0, fromStart: {} }), { atEdge: false, label: '1 sec behind' })
})
