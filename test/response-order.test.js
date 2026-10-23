import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createResponseOrder } from '../src/web/response-order.js'

test('responses arriving in order are all accepted', () => {
  const order = createResponseOrder()
  const first = order.issue()
  const second = order.issue()
  assert.equal(order.accept(first), true)
  assert.equal(order.accept(second), true)
})

test('a response older than the last one applied is dropped', () => {
  const order = createResponseOrder()
  const first = order.issue()
  const second = order.issue()
  assert.equal(order.accept(second), true)
  assert.equal(order.accept(first), false)
})

test('only the newest request counts as the latest', () => {
  const order = createResponseOrder()
  const first = order.issue()
  assert.equal(order.isLatest(first), true)
  const second = order.issue()
  assert.equal(order.isLatest(first), false)
  assert.equal(order.isLatest(second), true)
})
