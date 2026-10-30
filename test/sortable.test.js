import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  moveItem,
  pitchesOf,
  clampOffset,
  targetIndexFor,
  slotOffsetFor,
  offsetsFor,
  autoScrollStep,
  keyboardTarget,
  menuMovesFor,
  mergeVisibleOrder,
  arrangeByOrder,
  positionText,
  pickedUpText,
  movedText,
  cancelledText,
} from '../src/web/sortable-math.js'

const uniformSlots = (count, height = 84, gap = 0) =>
  Array.from({ length: count }, (_, i) => ({ top: 100 + i * (height + gap), height }))

test('moveItem moves one item and keeps the rest in order', () => {
  assert.deepEqual(moveItem({ list: ['a', 'b', 'c', 'd'], from: 1, to: 3 }), ['a', 'c', 'd', 'b'])
  assert.deepEqual(moveItem({ list: ['a', 'b', 'c', 'd'], from: 3, to: 0 }), ['d', 'a', 'b', 'c'])
  assert.deepEqual(moveItem({ list: ['a', 'b'], from: 0, to: 0 }), ['a', 'b'])
})

test('pitchesOf includes the gap between rows and repeats it after the last row', () => {
  assert.deepEqual(pitchesOf(uniformSlots(3, 50, 2)), [52, 52, 52])
  assert.deepEqual(pitchesOf([{ top: 0, height: 40 }]), [40])
})

test('clampOffset keeps the lifted row inside the list', () => {
  const slots = uniformSlots(5)
  assert.equal(clampOffset({ slots, from: 2, offset: -1000 }), -168)
  assert.equal(clampOffset({ slots, from: 2, offset: 1000 }), 168)
  assert.equal(clampOffset({ slots, from: 2, offset: 30 }), 30)
})

test('targetIndexFor swaps when the lifted centre crosses into a neighbour', () => {
  const slots = uniformSlots(6)
  assert.equal(targetIndexFor({ slots, from: 2, offset: 0 }), 2)
  assert.equal(targetIndexFor({ slots, from: 2, offset: 41 }), 2)
  assert.equal(targetIndexFor({ slots, from: 2, offset: 43 }), 3)
  assert.equal(targetIndexFor({ slots, from: 2, offset: 84 }), 3)
  assert.equal(targetIndexFor({ slots, from: 2, offset: 127 }), 4)
  assert.equal(targetIndexFor({ slots, from: 2, offset: -41 }), 2)
  assert.equal(targetIndexFor({ slots, from: 2, offset: -43 }), 1)
  assert.equal(targetIndexFor({ slots, from: 2, offset: -500 }), 0)
  assert.equal(targetIndexFor({ slots, from: 2, offset: 500 }), 5)
})

test('one row-height of drag always swaps with exactly one neighbour', () => {
  const slots = uniformSlots(8, 56)
  for (let from = 0; from < 7; from++) {
    assert.equal(targetIndexFor({ slots, from, offset: 56 }), from + 1)
  }
})

test('slotOffsetFor is the distance from the start slot to the target slot', () => {
  const slots = uniformSlots(6)
  assert.equal(slotOffsetFor({ slots, from: 2, to: 4 }), 168)
  assert.equal(slotOffsetFor({ slots, from: 2, to: 0 }), -168)
  assert.equal(slotOffsetFor({ slots, from: 2, to: 2 }), 0)
})

test('slotOffsetFor lands flush with uneven row heights', () => {
  const slots = [{ top: 0, height: 40 }, { top: 40, height: 60 }, { top: 100, height: 40 }]
  assert.equal(slotOffsetFor({ slots, from: 0, to: 2 }), 100)
  assert.equal(slotOffsetFor({ slots, from: 2, to: 0 }), -100)
})

test('offsetsFor slides the passed neighbours one row-height the other way', () => {
  const slots = uniformSlots(6)
  assert.deepEqual(offsetsFor({ slots, from: 2, to: 4 }), [0, 0, 168, -84, -84, 0])
  assert.deepEqual(offsetsFor({ slots, from: 3, to: 1 }), [0, 84, 84, -168, 0, 0])
  assert.deepEqual(offsetsFor({ slots, from: 1, to: 1 }), [0, 0, 0, 0, 0, 0])
})

test('autoScrollStep scrolls only within 48 px of an edge, faster closer in', () => {
  const view = { viewTop: 0, viewBottom: 800 }
  assert.equal(autoScrollStep({ ...view, top: 200, bottom: 260 }), 0)
  assert.ok(autoScrollStep({ ...view, top: 40, bottom: 100 }) < 0)
  assert.ok(autoScrollStep({ ...view, top: 700, bottom: 760 }) > 0)
  assert.ok(autoScrollStep({ ...view, top: 0, bottom: 60 }) < autoScrollStep({ ...view, top: 40, bottom: 100 }))
  assert.equal(autoScrollStep({ ...view, top: -100, bottom: -40 }), -18)
})

test('keyboardTarget maps arrows, Home, and End and stays in range', () => {
  assert.equal(keyboardTarget({ key: 'ArrowUp', index: 0, count: 5 }), 0)
  assert.equal(keyboardTarget({ key: 'ArrowUp', index: 3, count: 5 }), 2)
  assert.equal(keyboardTarget({ key: 'ArrowDown', index: 4, count: 5 }), 4)
  assert.equal(keyboardTarget({ key: 'Home', index: 3, count: 5 }), 0)
  assert.equal(keyboardTarget({ key: 'End', index: 1, count: 5 }), 4)
  assert.equal(keyboardTarget({ key: 'x', index: 1, count: 5 }), null)
})

test('menuMovesFor leaves out moves that would do nothing', () => {
  assert.deepEqual(menuMovesFor({ index: 0, count: 3 }).map((m) => m.key), ['down', 'bottom'])
  assert.deepEqual(menuMovesFor({ index: 2, count: 3 }).map((m) => m.key), ['top', 'up'])
  assert.deepEqual(menuMovesFor({ index: 1, count: 3 }).map((m) => m.to), [0, 0, 2, 2])
  assert.deepEqual(menuMovesFor({ index: 0, count: 1 }), [])
})

test('mergeVisibleOrder reorders the visible ids and leaves the rest in place', () => {
  assert.deepEqual(mergeVisibleOrder({ all: ['a', 'b', 'c', 'd'], visible: ['c', 'a'] }), ['c', 'b', 'a', 'd'])
  assert.deepEqual(mergeVisibleOrder({ all: ['a', 'b'], visible: ['b', 'a'] }), ['b', 'a'])
})

test('arrangeByOrder places ordered items in the slots they held', () => {
  const items = [{ id: 'x' }, { id: 'a' }, { id: 'y' }, { id: 'b' }, { id: 'c' }]
  const result = arrangeByOrder({ items, order: ['c', 'a', 'b'], idOf: (item) => item.id })
  assert.deepEqual(result.map((item) => item.id), ['x', 'c', 'y', 'a', 'b'])
})

test('announcements name the channel and its position', () => {
  const at = { name: 'The Block', index: 2, count: 8 }
  assert.equal(positionText(at), 'The Block, position 3 of 8.')
  assert.equal(pickedUpText(at), 'Picked up The Block, position 3 of 8.')
  assert.equal(movedText({ ...at, index: 3 }), 'The Block moved to position 4 of 8.')
  assert.equal(cancelledText(at), 'Cancelled. The Block is back at position 3.')
})
