import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  behindLabelOf,
  liveEdgeOf,
  steadyBehindMinutesOf,
  behindPillText,
  leftPillText,
  scrubPillShownOf,
  liveSummaryText,
  fromStartSummaryText,
  summaryEpisodeText,
  endsAtText,
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

test('scrubPillShownOf hides the minutes-left pill on a portrait phone and shows it from landscape up', () => {
  assert.equal(scrubPillShownOf({ scrubWidth: 358 }), false)
  assert.equal(scrubPillShownOf({ scrubWidth: 499 }), false)
  assert.equal(scrubPillShownOf({ scrubWidth: 500 }), true)
  assert.equal(scrubPillShownOf({ scrubWidth: 812 }), true)
  assert.equal(scrubPillShownOf({ scrubWidth: 0 }), false)
})

test('leftPillText rounds up to whole minutes', () => {
  assert.equal(leftPillText(61), '2 MIN LEFT')
  assert.equal(leftPillText(0), '1 MIN LEFT')
})

const clockText = (ms) => {
  const date = new Date(ms)
  const hours = date.getUTCHours()
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  return `${hours % 12 || 12}:${minutes}${hours < 12 ? 'am' : 'pm'}`
}
const at = (hours, minutes) => Date.UTC(2026, 10, 16, hours, minutes)

test('liveSummaryText gives the minutes left and the next programme with its start time', () => {
  const next = { title: 'The Project', start: at(20, 30) }
  assert.equal(liveSummaryText({ endMs: at(20, 30), nowMs: at(20, 6), next, clockText }), '24 min left · Next 8:30pm The Project')
})

test('liveSummaryText drops a part the guide does not have', () => {
  assert.equal(liveSummaryText({ endMs: at(20, 30), nowMs: at(20, 6), next: null, clockText }), '24 min left')
  assert.equal(liveSummaryText({ endMs: undefined, nowMs: at(20, 6), next: { title: 'The Project', start: at(20, 30) }, clockText }), 'Next 8:30pm The Project')
  assert.equal(liveSummaryText({ endMs: undefined, nowMs: at(20, 6), next: { title: 'The Project' }, clockText }), 'Next The Project')
  assert.equal(liveSummaryText({ endMs: undefined, nowMs: at(20, 6), next: { start: at(20, 30) }, clockText }), '')
})

test('fromStartSummaryText says whether the recording is still growing', () => {
  assert.equal(fromStartSummaryText({ growing: true }), 'From the start · still recording')
  assert.equal(fromStartSummaryText({ growing: false }), 'From the start')
})

test('summaryEpisodeText prefers the episode line and falls back to the genre', () => {
  assert.equal(summaryEpisodeText({ episodeLine: 'S03E07 · The Reunion', genreText: 'Sport' }), 'S03E07 · The Reunion')
  assert.equal(summaryEpisodeText({ episodeLine: '', genreText: 'Sport' }), 'Sport')
  assert.equal(summaryEpisodeText({ episodeLine: '', genreText: '' }), '')
})

test('endsAtText adds the time left to the clock at normal speed', () => {
  assert.equal(endsAtText({ durationS: 3600, positionS: 1200, nowMs: at(21, 2), clockText }), 'Ends 9:42pm')
  assert.equal(endsAtText({ durationS: 3600, positionS: 4000, nowMs: at(21, 2), clockText }), 'Ends 9:02pm')
  assert.equal(endsAtText({ durationS: 0, positionS: 0, nowMs: at(21, 2), clockText }), '')
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
