import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createOverlayStack } from '../src/web/overlay-stack.js'

test('each pushed overlay sits above the one before it', () => {
  const stack = createOverlayStack()
  const first = stack.push()
  const second = stack.push()
  assert.ok(second.zIndex > first.zIndex)
})

test('only the newest overlay is on top', () => {
  const stack = createOverlayStack()
  const first = stack.push()
  const second = stack.push()
  assert.equal(stack.isTop(first.id), false)
  assert.equal(stack.isTop(second.id), true)
})

test('removing the top overlay makes the one below it the top', () => {
  const stack = createOverlayStack()
  const first = stack.push()
  const second = stack.push()
  stack.remove(second.id)
  assert.equal(stack.isTop(first.id), true)
  assert.equal(stack.size(), 1)
})

test('removing an unknown overlay changes nothing', () => {
  const stack = createOverlayStack()
  stack.push()
  stack.remove(999)
  assert.equal(stack.size(), 1)
})

test('a reopened overlay gets a z-index above the one it replaced', () => {
  const stack = createOverlayStack()
  const first = stack.push()
  const second = stack.push()
  stack.remove(first.id)
  const third = stack.push()
  assert.ok(third.zIndex > second.zIndex)
  assert.equal(stack.isTop(third.id), true)
})
