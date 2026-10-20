import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHistoryEntries, createOverlayStack } from '../src/web/overlay-stack.js'

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

const fakeHistory = () => {
  const entries = [{ state: null }]
  let index = 0
  const pops = []
  return {
    get state() { return entries[index].state },
    get length() { return entries.length },
    pushState(state) {
      entries.splice(index + 1)
      entries.push({ state })
      index += 1
    },
    back() {
      index = Math.max(0, index - 1)
      pops.push(index)
    },
    pops,
  }
}

const historyStack = (history) => {
  const later = []
  const entries = createHistoryEntries({ history, usesBackGesture: () => true, later: (run) => later.push(run) })
  const stack = entries.attach(createOverlayStack({ entries }))
  const flush = () => later.splice(0).forEach((run) => run())
  const pop = () => {
    history.pops.length = 0
    entries.onPop()
  }
  return { stack, entries, flush, pop }
}

test('opening a dismissible overlay adds one history entry', () => {
  const history = fakeHistory()
  const { stack } = historyStack(history)
  stack.push({ onBack: () => {} })
  assert.equal(history.length, 2)
  stack.push()
  assert.equal(history.length, 2)
})

test('the back gesture closes the overlay it opened', () => {
  const history = fakeHistory()
  const { stack, pop } = historyStack(history)
  const closed = []
  const layer = stack.push({ onBack: () => { closed.push(layer.id); stack.remove(layer.id) } })
  history.back()
  pop()
  assert.deepEqual(closed, [layer.id])
  assert.equal(stack.size(), 0)
})

test('closing an overlay normally removes its history entry', () => {
  const history = fakeHistory()
  const { stack, flush, pop } = historyStack(history)
  const layer = stack.push({ onBack: () => assert.fail('back should not close it again') })
  stack.remove(layer.id)
  flush()
  assert.equal(history.state, null)
  pop()
})

test('a stale entry left under a newer overlay is skipped on the way back', () => {
  const history = fakeHistory()
  const { stack, flush, pop } = historyStack(history)
  const menu = stack.push({ onBack: () => stack.remove(menu.id) })
  stack.remove(menu.id)
  const info = stack.push({ onBack: () => stack.remove(info.id) })
  flush()
  assert.equal(history.state.overlayId, info.id)
  stack.remove(info.id)
  flush()
  pop()
  pop()
  assert.equal(history.state, null)
})

test('the back gesture closes only the overlays above the current entry', () => {
  const history = fakeHistory()
  const { stack, pop } = historyStack(history)
  const first = stack.push({ onBack: () => stack.remove(first.id) })
  const second = stack.push({ onBack: () => stack.remove(second.id) })
  history.back()
  pop()
  assert.equal(stack.has(first.id), true)
  assert.equal(stack.has(second.id), false)
})
