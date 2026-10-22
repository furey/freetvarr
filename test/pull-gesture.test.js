import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PULL_SLOP_PX, pullMoveOf } from '../src/web/pull-gesture.js'

test('pullMoveOf holds a downward move inside the slop so the native bounce never starts', () => {
  assert.equal(pullMoveOf({ dx: 0, dy: 1, claimed: false }), 'hold')
  assert.equal(pullMoveOf({ dx: 2, dy: 3, claimed: false }), 'hold')
  assert.equal(pullMoveOf({ dx: 3, dy: 3, claimed: false }), 'hold')
})

test('pullMoveOf waits on a still, sideways, or upward move inside the slop', () => {
  assert.equal(pullMoveOf({ dx: 0, dy: 0, claimed: false }), 'wait')
  assert.equal(pullMoveOf({ dx: 3, dy: 1, claimed: false }), 'wait')
  assert.equal(pullMoveOf({ dx: 0, dy: -2, claimed: false }), 'wait')
})

test('pullMoveOf pulls a downward-dominant move past the slop and abandons any other', () => {
  assert.equal(pullMoveOf({ dx: 0, dy: PULL_SLOP_PX, claimed: false }), 'pull')
  assert.equal(pullMoveOf({ dx: 10, dy: 10, claimed: false }), 'pull')
  assert.equal(pullMoveOf({ dx: 11, dy: 10, claimed: false }), 'abandon')
  assert.equal(pullMoveOf({ dx: 0, dy: -PULL_SLOP_PX, claimed: false }), 'abandon')
})

test('pullMoveOf keeps pulling once claimed, whatever the direction', () => {
  assert.equal(pullMoveOf({ dx: 40, dy: 2, claimed: true }), 'pull')
  assert.equal(pullMoveOf({ dx: 0, dy: -20, claimed: true }), 'pull')
})
