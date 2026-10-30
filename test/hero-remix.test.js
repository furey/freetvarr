import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HOUR_MS, hourKeyOf, hourlyOrderOf, rotatingOrderOf, startingAwayFrom, startingAt, leadOf, hourNumberOf, interleaved, shuffledBy, seededRandomOf,
  adoptedOrderOf, sameKeySet,
} from '../src/web/hero-remix.js'

const timeZone = 'Australia/Sydney'
const startMs = Date.parse('2026-10-20T13:00:00Z')
const slide = (type, n = 1) => ({ key: `${type}:${n}`, type })
const keys = (slides) => slides.map((s) => s.key)
const types = (slides) => slides.map((s) => s.type)
const rotating = [
  slide('continue'), slide('continue', 2), slide('new'), slide('new', 2), slide('for-you'),
  slide('upcoming'), slide('watchlist'), slide('movie'), slide('movie', 2),
]
const hoursOfDay = (count = 24) => Array.from({ length: count }, (_, h) => startMs + h * HOUR_MS)

test('hourKeyOf: the local date and hour, the same all hour', () => {
  assert.equal(hourKeyOf({ nowMs: startMs, timeZone }), '2026-10-21T00')
  assert.equal(hourKeyOf({ nowMs: startMs + 59 * 60_000, timeZone }), '2026-10-21T00')
  assert.equal(hourKeyOf({ nowMs: startMs + HOUR_MS, timeZone }), '2026-10-21T01')
  assert.equal(hourKeyOf({ nowMs: startMs, timeZone: 'UTC' }), '2026-10-20T13')
})

test('seededRandomOf and shuffledBy: the same seed gives the same order', () => {
  assert.equal(seededRandomOf('a')(), seededRandomOf('a')())
  const items = [1, 2, 3, 4, 5, 6, 7, 8]
  assert.deepEqual(shuffledBy({ items, seed: 's' }), shuffledBy({ items, seed: 's' }))
  assert.deepEqual([...shuffledBy({ items, seed: 's' })].sort(), items)
  const orders = new Set(['a', 'b', 'c', 'd', 'e'].map((seed) => shuffledBy({ items, seed }).join()))
  assert.ok(orders.size > 1)
  assert.deepEqual(items, [1, 2, 3, 4, 5, 6, 7, 8])
})

test('interleaved: one from each queue per round', () => {
  assert.deepEqual(interleaved([['a1', 'a2', 'a3'], ['b1'], ['c1', 'c2']]), ['a1', 'b1', 'c1', 'a2', 'c2', 'a3'])
  assert.deepEqual(interleaved([]), [])
})

test('rotatingOrderOf: every kind once before any kind twice', () => {
  const order = rotatingOrderOf({ slides: rotating, seed: '2026-10-21T09' })
  assert.equal(new Set(types(order.slice(0, 6))).size, 6)
  assert.deepEqual(keys(order).sort(), keys(rotating).sort())
})

test('hourlyOrderOf: recording now, then live news or sport, stay first every hour', () => {
  const candidates = [...rotating, slide('on-now'), slide('recording')]
  for (const nowMs of hoursOfDay()) {
    const order = hourlyOrderOf({ candidates, nowMs, timeZone })
    assert.deepEqual(types(order.slice(0, 2)), ['recording', 'on-now'])
    assert.equal(order.length, candidates.length)
  }
})

test('hourlyOrderOf: the same order all hour, a new mix across the day', () => {
  const order = (nowMs) => keys(hourlyOrderOf({ candidates: rotating, nowMs, timeZone }))
  assert.deepEqual(order(startMs), order(startMs + 45 * 60_000))
  const mixes = new Set(hoursOfDay().map((nowMs) => order(nowMs).join()))
  assert.ok(mixes.size >= 20)
  const leads = new Set(hoursOfDay().map((nowMs) => order(nowMs)[0]))
  assert.ok(leads.size >= 5)
})

test('hourlyOrderOf: the first slide changes from one hour to the next', () => {
  const lead = (nowMs, candidates) => hourlyOrderOf({ candidates, nowMs, timeZone })[0].key
  for (const candidates of [rotating, [slide('new'), slide('movie')], [slide('new'), slide('new', 2), slide('movie')]]) {
    for (const nowMs of hoursOfDay(72).slice(1)) {
      assert.notEqual(lead(nowMs, candidates), lead(nowMs - HOUR_MS, candidates))
    }
  }
  assert.deepEqual(keys(hourlyOrderOf({ candidates: [slide('new')], nowMs: startMs, timeZone })), ['new:1'])
  assert.deepEqual(hourlyOrderOf({ candidates: [], nowMs: startMs, timeZone }), [])
})

test('leadOf: each slide leads once per round of hours, never twice running', () => {
  const slides = rotating.slice(0, 4)
  const first = hourNumberOf('2026-10-21T00')
  const leads = Array.from({ length: 40 }, (_, h) => leadOf({ slides, hourNumber: first + h }).key)
  leads.slice(1).forEach((key, h) => assert.notEqual(key, leads[h]))
  const roundStart = first - (first % 4)
  const round = Array.from({ length: 4 }, (_, h) => leadOf({ slides, hourNumber: roundStart + h }).key)
  assert.deepEqual([...round].sort(), keys(slides).sort())
  assert.equal(hourNumberOf('1970-01-01T05'), 5)
})

test('startingAwayFrom and startingAt: swap past a repeated lead, or rotate to a chosen one', () => {
  const order = [slide('a'), slide('b'), slide('c')]
  assert.deepEqual(keys(startingAwayFrom({ order, avoidKey: 'a:1' })), ['b:1', 'a:1', 'c:1'])
  assert.deepEqual(keys(startingAt({ order, key: 'b:1' })), ['b:1', 'c:1', 'a:1'])
  assert.deepEqual(keys(startingAt({ order, key: 'z:1' })), ['a:1', 'b:1', 'c:1'])
  assert.deepEqual(keys(startingAwayFrom({ order, avoidKey: 'b:1' })), ['a:1', 'b:1', 'c:1'])
  assert.deepEqual(keys(startingAwayFrom({ order: [slide('a')], avoidKey: 'a:1' })), ['a:1'])
})

test('adoptedOrderOf and sameKeySet: a new order starts from the slide about to show', () => {
  assert.deepEqual(adoptedOrderOf({ pendingKeys: ['c', 'a', 'b'], targetKey: 'b' }), { keys: ['c', 'a', 'b'], index: 2 })
  assert.deepEqual(adoptedOrderOf({ pendingKeys: ['c', 'a'], targetKey: 'z' }), { keys: ['c', 'a'], index: 0 })
  assert.ok(sameKeySet(['a', 'b'], ['b', 'a']))
  assert.ok(!sameKeySet(['a', 'b'], ['a', 'c']))
  assert.ok(!sameKeySet(['a'], ['a', 'b']))
})
