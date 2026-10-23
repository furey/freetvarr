import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PULL_SLOP_PX,
  PULL_DEADZONE_PX,
  PULL_TRIGGER_TRAVEL_PX,
  pullMoveOf,
  pullTravelOf,
  pullProgressOf,
  pullOffsetOf,
  isPullCommitted
} from '../src/web/pull-gesture.js'

test('pullMoveOf holds a downward move inside the slop so the native bounce never starts', () => {
  assert.equal(pullMoveOf({ dx: 0, dy: 1, claimed: false }), 'hold')
  assert.equal(pullMoveOf({ dx: 1, dy: 3, claimed: false }), 'hold')
  assert.equal(pullMoveOf({ dx: 2, dy: 5, claimed: false }), 'hold')
})

test('pullMoveOf waits on a still, sideways, or upward move inside the slop', () => {
  assert.equal(pullMoveOf({ dx: 0, dy: 0, claimed: false }), 'wait')
  assert.equal(pullMoveOf({ dx: 3, dy: 1, claimed: false }), 'wait')
  assert.equal(pullMoveOf({ dx: 3, dy: 3, claimed: false }), 'wait')
  assert.equal(pullMoveOf({ dx: 0, dy: -2, claimed: false }), 'wait')
})

test('pullMoveOf pulls a downward-dominant move past the slop and abandons any other', () => {
  assert.equal(pullMoveOf({ dx: 0, dy: PULL_SLOP_PX, claimed: false }), 'pull')
  assert.equal(pullMoveOf({ dx: 10, dy: 21, claimed: false }), 'pull')
  assert.equal(pullMoveOf({ dx: 10, dy: 20, claimed: false }), 'abandon')
  assert.equal(pullMoveOf({ dx: 10, dy: 10, claimed: false }), 'abandon')
  assert.equal(pullMoveOf({ dx: 0, dy: -PULL_SLOP_PX, claimed: false }), 'abandon')
})

test('pullMoveOf keeps pulling once claimed, whatever the direction', () => {
  assert.equal(pullMoveOf({ dx: 40, dy: 2, claimed: true }), 'pull')
  assert.equal(pullMoveOf({ dx: 0, dy: -20, claimed: true }), 'pull')
})

test('pullMoveOf abandons an unclaimed move the browser already scrolls natively', () => {
  assert.equal(pullMoveOf({ dx: 0, dy: 2, claimed: false, cancelable: false }), 'abandon')
  assert.equal(pullMoveOf({ dx: 0, dy: 30, claimed: false, cancelable: false }), 'abandon')
  assert.equal(pullMoveOf({ dx: 0, dy: 30, claimed: true, cancelable: false }), 'pull')
})

test('pull travel stays zero through the slop and the dead zone', () => {
  assert.equal(pullTravelOf(30), 0)
  assert.equal(pullTravelOf(PULL_SLOP_PX + PULL_DEADZONE_PX), 0)
  assert.equal(pullTravelOf(PULL_SLOP_PX + PULL_DEADZONE_PX + 10), 10)
})

test('a slight pull shows no indicator and moves no page', () => {
  assert.equal(pullProgressOf(30), 0)
  assert.equal(pullOffsetOf({ dy: 30, span: 800 }), 0)
})

test('the indicator stays hidden until the finger passes the slop and the dead zone', () => {
  const edge = PULL_SLOP_PX + PULL_DEADZONE_PX
  assert.equal(pullProgressOf(edge), 0)
  assert.equal(pullOffsetOf({ dy: edge, span: 800 }), 0)
  assert.ok(pullProgressOf(edge + 1) > 0)
})

test('progress and offset grow past the dead zone', () => {
  const dy = PULL_SLOP_PX + PULL_DEADZONE_PX + PULL_TRIGGER_TRAVEL_PX / 2
  assert.equal(pullProgressOf(dy), 0.5)
  assert.ok(pullOffsetOf({ dy, span: 800 }) > 0)
  assert.ok(pullOffsetOf({ dy: dy + 20, span: 800 }) > pullOffsetOf({ dy, span: 800 }))
})

test('only a deliberate pull commits a refresh', () => {
  const triggerDy = PULL_SLOP_PX + PULL_DEADZONE_PX + PULL_TRIGGER_TRAVEL_PX
  assert.equal(isPullCommitted(60), false)
  assert.equal(isPullCommitted(triggerDy - 1), false)
  assert.equal(isPullCommitted(triggerDy), true)
  assert.equal(isPullCommitted(140), true)
  assert.equal(pullProgressOf(500), 1)
})
