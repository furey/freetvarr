import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  chunkedSpanOf,
  cellWindowOf,
  sameCellWindow,
  nearRowKeysOf,
  sameItems,
  windowedCellsByRow,
  scrollLeadOf,
  pinsScrolledAway,
  spanOnScreen,
  cellArtOf,
} from '../src/web/guide-window.js'

const MIN = 60_000
const DAY_START = Date.UTC(2026, 9, 20, 13)

const programme = (id, startMin, endMin) => ({ program_id: id, start: DAY_START + startMin * MIN, end: DAY_START + endMin * MIN })
const keyOf = (row, p) => `${row.key}|${p.program_id}|${p.start}`

test('chunkedSpanOf pads the visible span by at least one chunk each side', () => {
  assert.deepEqual(chunkedSpanOf({ start: 600, size: 200, minChunk: 30 }), { from: 550, to: 850 })
})

test('chunkedSpanOf keeps the same span while scrolling inside a chunk', () => {
  const at = (start) => chunkedSpanOf({ start, size: 200, minChunk: 30 })
  assert.deepEqual(at(601), at(640))
  assert.notDeepEqual(at(640), at(651))
})

test('chunkedSpanOf never uses a chunk smaller than the minimum', () => {
  assert.deepEqual(chunkedSpanOf({ start: 0, size: 10, minChunk: 30 }), { from: -30, to: 60 })
})

test('cellWindowOf turns minutes into times on the guide day and pixels into a row band', () => {
  const shown = cellWindowOf({ dayStart: DAY_START, leftMin: 600, widthMin: 200, topPx: 0, heightPx: 800 })
  assert.equal(shown.dayStart, DAY_START)
  assert.equal(shown.startMs, DAY_START + 550 * MIN)
  assert.equal(shown.endMs, DAY_START + 850 * MIN)
  assert.equal(shown.topPx, -200)
  assert.equal(shown.bottomPx, 1000)
})

test('sameCellWindow compares every edge and the day', () => {
  const a = cellWindowOf({ dayStart: DAY_START, leftMin: 600, widthMin: 200, topPx: 0, heightPx: 800 })
  assert.equal(sameCellWindow(a, { ...a }), true)
  assert.equal(sameCellWindow(a, { ...a, dayStart: DAY_START + 1 }), false)
  assert.equal(sameCellWindow(a, { ...a, bottomPx: 0 }), false)
  assert.equal(sameCellWindow(null, a), false)
})

test('nearRowKeysOf keeps rows that overlap the band', () => {
  const bands = [
    { key: 'a', top: 0, bottom: 70 },
    { key: 'b', top: 70, bottom: 140 },
    { key: 'c', top: 140, bottom: 210 },
  ]
  assert.deepEqual([...nearRowKeysOf({ bands, topPx: 70, bottomPx: 140 })], ['b'])
  assert.deepEqual([...nearRowKeysOf({ bands, topPx: -100, bottomPx: 100 })], ['a', 'b'])
})

test('sameItems compares by identity and order', () => {
  const x = {}
  const y = {}
  assert.equal(sameItems([x, y], [x, y]), true)
  assert.equal(sameItems([x, y], [y, x]), false)
  assert.equal(sameItems([x], [x, y]), false)
})

test('windowedCellsByRow keeps only programmes inside the time window on near rows', () => {
  const rows = [
    { key: '1', programmes: [programme('a', 0, 60), programme('b', 60, 120), programme('c', 120, 180)] },
    { key: '2', programmes: [programme('d', 0, 180)] },
  ]
  const byRow = windowedCellsByRow({
    rows,
    isNear: (key) => key === '1',
    startMs: DAY_START + 70 * MIN,
    endMs: DAY_START + 120 * MIN,
    keyOf,
  })
  assert.deepEqual(byRow.get('1').map((p) => p.program_id), ['b'])
  assert.equal(byRow.has('2'), false)
})

test('windowedCellsByRow includes a programme that ends or starts exactly at an edge only when it overlaps', () => {
  const rows = [{ key: '1', programmes: [programme('a', 0, 60), programme('b', 60, 120), programme('c', 120, 180)] }]
  const byRow = windowedCellsByRow({ rows, isNear: () => true, startMs: DAY_START + 60 * MIN, endMs: DAY_START + 120 * MIN, keyOf })
  assert.deepEqual(byRow.get('1').map((p) => p.program_id), ['b'])
})

test('windowedCellsByRow always keeps the focused cell', () => {
  const kept = programme('z', 900, 960)
  const rows = [{ key: '7', programmes: [programme('a', 0, 60), kept] }]
  const byRow = windowedCellsByRow({
    rows,
    isNear: () => false,
    startMs: DAY_START,
    endMs: DAY_START + 60 * MIN,
    keepKey: `7|z|${kept.start}`,
    keyOf,
  })
  assert.deepEqual(byRow.get('7'), [kept])
})

test('windowedCellsByRow reuses the previous array when a row did not change', () => {
  const rows = [{ key: '1', programmes: [programme('a', 0, 60), programme('b', 60, 120)] }]
  const window = { isNear: () => true, startMs: DAY_START, endMs: DAY_START + 120 * MIN, keyOf }
  const first = windowedCellsByRow({ rows, ...window })
  const second = windowedCellsByRow({ rows, ...window, previous: first })
  assert.equal(second.get('1'), first.get('1'))
  const narrower = windowedCellsByRow({ rows, ...window, endMs: DAY_START + 30 * MIN, previous: first })
  assert.notEqual(narrower.get('1'), first.get('1'))
})

test('windowedCellsByRow tolerates rows without listings', () => {
  const byRow = windowedCellsByRow({ rows: [{ key: '1' }], isNear: () => true, startMs: 0, endMs: 1, keyOf })
  assert.equal(byRow.size, 0)
})

test('chunkedSpanOf adds lead chunks in the scroll direction only', () => {
  const still = chunkedSpanOf({ start: 600, size: 200, minChunk: 30 })
  assert.deepEqual(chunkedSpanOf({ start: 600, size: 200, minChunk: 30, lead: 1 }), { from: still.from, to: still.to + 200 })
  assert.deepEqual(chunkedSpanOf({ start: 600, size: 200, minChunk: 30, lead: -1 }), { from: still.from - 200, to: still.to })
})

test('scrollLeadOf follows the last movement and keeps it while still', () => {
  assert.equal(scrollLeadOf({ delta: 12 }), 1)
  assert.equal(scrollLeadOf({ delta: -3, previous: 1 }), -1)
  assert.equal(scrollLeadOf({ delta: 0, previous: -1 }), -1)
  assert.equal(scrollLeadOf({ delta: 0 }), 0)
})

test('pinsScrolledAway is true once the last favourite row is under the ruler', () => {
  const bands = [
    { key: 'a', top: 0, bottom: 70, pinned: true },
    { key: 'b', top: 70, bottom: 140, pinned: true },
    { key: 'c', top: 140, bottom: 210, pinned: false },
  ]
  assert.equal(pinsScrolledAway({ bands, scrollTop: 0, rulerHeight: 40 }), false)
  assert.equal(pinsScrolledAway({ bands, scrollTop: 101, rulerHeight: 40 }), true)
  assert.equal(pinsScrolledAway({ bands: bands.slice(2), scrollTop: 500, rulerHeight: 40 }), false)
})

test('spanOnScreen checks a track position against the visible span', () => {
  assert.equal(spanOnScreen({ x: 500, scrollLeft: 400, viewWidth: 200 }), true)
  assert.equal(spanOnScreen({ x: 700, scrollLeft: 400, viewWidth: 200 }), false)
})

test('windowedCellsByRow keeps cells it already built when asked to retain them', () => {
  const early = programme('a', 0, 60)
  const late = programme('b', 600, 660)
  const rows = [{ key: '1', programmes: [early, late] }]
  const first = windowedCellsByRow({ rows, isNear: () => true, startMs: DAY_START, endMs: DAY_START + 60 * MIN, keyOf })
  const moved = { rows, isNear: () => true, startMs: DAY_START + 600 * MIN, endMs: DAY_START + 660 * MIN, keyOf, previous: first }
  assert.deepEqual(windowedCellsByRow({ ...moved, retain: true }).get('1'), [early, late])
  assert.deepEqual(windowedCellsByRow(moved).get('1'), [late])
})

test('cellArtOf shows a programme picture only in cells wide enough for a thumbnail', () => {
  assert.equal(cellArtOf({ hasImage: true, widthPx: 171, thumbMinPx: 172 }), 'none')
  assert.equal(cellArtOf({ hasImage: false, widthPx: 171, thumbMinPx: 172 }), 'none')
})

test('cellArtOf asks the server for a fallback picture when the guide has none', () => {
  assert.equal(cellArtOf({ hasImage: true, widthPx: 172, thumbMinPx: 172 }), 'own')
  assert.equal(cellArtOf({ hasImage: false, widthPx: 300, thumbMinPx: 172 }), 'fallback')
})
