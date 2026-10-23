import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PULL_SLOP_PX,
  PULL_REVEAL_OFFSET_PX,
  PULL_COMMIT_OFFSET_PX,
  pullMoveOf,
  pullOffsetOf,
  pullProgressOf,
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

test('the page follows the finger from the first move past the slop, with growing resistance', () => {
  assert.equal(pullOffsetOf(PULL_SLOP_PX), 0)
  assert.ok(pullOffsetOf(PULL_SLOP_PX + 4) > 2)
  const early = pullOffsetOf(40) - pullOffsetOf(20)
  const late = pullOffsetOf(200) - pullOffsetOf(180)
  assert.ok(early > late)
  assert.ok(pullOffsetOf(200) < 200)
})

test('the indicator stays hidden until the page offset passes the reveal point', () => {
  assert.equal(pullProgressOf(0), 0)
  assert.equal(pullProgressOf(PULL_REVEAL_OFFSET_PX), 0)
  assert.ok(pullProgressOf(PULL_REVEAL_OFFSET_PX + 1) > 0)
  assert.equal(pullProgressOf((PULL_REVEAL_OFFSET_PX + PULL_COMMIT_OFFSET_PX) / 2), 0.5)
  assert.equal(pullProgressOf(PULL_COMMIT_OFFSET_PX), 1)
  assert.equal(pullProgressOf(500), 1)
})

test('a commit needs the page offset at the commit point', () => {
  assert.equal(isPullCommitted(PULL_COMMIT_OFFSET_PX - 1), false)
  assert.equal(isPullCommitted(PULL_COMMIT_OFFSET_PX), true)
})

test('a commit takes a deliberate pull of about 150 to 170 px of finger travel', () => {
  assert.equal(isPullCommitted(pullOffsetOf(150)), false)
  assert.equal(isPullCommitted(pullOffsetOf(170)), true)
  assert.equal(pullProgressOf(pullOffsetOf(50)), 0)
})
