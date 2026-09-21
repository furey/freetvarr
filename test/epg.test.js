import { test } from 'node:test'
import assert from 'node:assert/strict'

import { localMidnightMs, orderChannels, nowAndNext } from '../src/epg.js'

const LINEUP = [
  { id: 11, name: '7mate', number: 74 },
  { id: 12, name: 'ABC TV', number: 2 },
  { id: 13, name: '10 Peach', number: 12 },
  { id: 14, name: 'SBS', number: 3 },
]

test('orderChannels: pinned float to the top in pin order, rest keep default order', () => {
  const out = orderChannels({ channels: LINEUP, pinnedIds: ['14', '12'], hiddenIds: [] })
  assert.deepEqual(out.map((c) => c.id), [14, 12, 11, 13])
  assert.deepEqual(out.map((c) => c.pinned), [true, true, false, false])
})

test('orderChannels: sorts the unpinned tail by name (numeric-aware) or number', () => {
  const byName = orderChannels({ channels: LINEUP, pinnedIds: ['14'], sort: 'name' })
  assert.deepEqual(byName.map((c) => c.name), ['SBS', '7mate', '10 Peach', 'ABC TV'])
  const byNumber = orderChannels({ channels: LINEUP, pinnedIds: [], sort: 'number' })
  assert.deepEqual(byNumber.map((c) => c.number), [2, 3, 12, 74])
})

test('orderChannels: a pinned channel is never hidden; unknown pins are ignored', () => {
  const out = orderChannels({ channels: LINEUP, pinnedIds: ['12', '999'], hiddenIds: ['12', '13'] })
  assert.deepEqual(out.map((c) => c.id), [12, 11, 13, 14])
  assert.equal(out[0].hidden, false)
  assert.equal(out.find((c) => c.id === 13).hidden, true)
})

test('nowAndNext: picks the airing programme and the nearest future one', () => {
  const programs = [
    { program_id: 1, title: 'Old', start: 0, end: 100 },
    { program_id: 2, title: 'Now', start: 100, end: 200 },
    { program_id: 3, title: 'Later', start: 300, end: 400 },
    { program_id: 4, title: 'Next', start: 200, end: 300 },
  ]
  const { now, next } = nowAndNext(programs, 150)
  assert.equal(now.title, 'Now')
  assert.equal(next.title, 'Next')
  const empty = nowAndNext([], 150)
  assert.equal(empty.now, null)
  assert.equal(empty.next, null)
})

test('localMidnightMs: floors to local midnight', () => {
  const ms = localMidnightMs(new Date('2026-08-25T13:45:12'))
  const d = new Date(ms)
  assert.equal(d.getHours(), 0)
  assert.equal(d.getMinutes(), 0)
  assert.equal(d.getSeconds(), 0)
  assert.equal(d.getDate(), 25)
})
