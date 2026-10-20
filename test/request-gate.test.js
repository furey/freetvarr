import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createRequestGate } from '../src/web/shared/request-gate.js'

const enterAll = ({ gate, count }) => {
  const granted = []
  const leaves = Array.from({ length: count }, (_, i) => gate.enter(() => granted.push(i)))
  return { granted, leaves }
}

test('the gate lets in only the limit at once', () => {
  const gate = createRequestGate({ limit: 2 })
  const { granted } = enterAll({ gate, count: 5 })
  assert.deepEqual(granted, [0, 1])
  assert.equal(gate.activeCount(), 2)
  assert.equal(gate.waitingCount(), 3)
})

test('leaving the gate lets the next waiting request in', () => {
  const gate = createRequestGate({ limit: 2 })
  const { granted, leaves } = enterAll({ gate, count: 4 })
  leaves[0]()
  assert.deepEqual(granted, [0, 1, 2])
  leaves[1]()
  assert.deepEqual(granted, [0, 1, 2, 3])
})

test('a request that leaves while waiting is never let in', () => {
  const gate = createRequestGate({ limit: 1 })
  const { granted, leaves } = enterAll({ gate, count: 3 })
  leaves[1]()
  leaves[0]()
  assert.deepEqual(granted, [0, 2])
  assert.equal(gate.waitingCount(), 0)
})

test('leaving twice frees only one place', () => {
  const gate = createRequestGate({ limit: 1 })
  const { leaves } = enterAll({ gate, count: 3 })
  leaves[0]()
  leaves[0]()
  assert.equal(gate.activeCount(), 1)
  assert.equal(gate.waitingCount(), 1)
})
