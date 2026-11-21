import { test, mock, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createPressIntent, PRESS_SLOP_PX, PRESS_STILL_MS } from '../src/web/press-intent.js'

const pointer = (type, { x = 0, y = 0 } = {}) => Object.assign(new Event(type), { clientX: x, clientY: y })

const pressed = () => {
  const target = new EventTarget()
  const intents = []
  const press = createPressIntent({ target })
  press.arm({ event: pointer('pointerdown'), onIntent: () => intents.push('preload') })
  return { target, intents }
}

beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }))

afterEach(() => mock.timers.reset())

test('press intent: a finger held still fires once after the still time', () => {
  const { intents } = pressed()
  mock.timers.tick(PRESS_STILL_MS - 1)
  assert.deepEqual(intents, [])
  mock.timers.tick(1)
  mock.timers.tick(PRESS_STILL_MS)
  assert.deepEqual(intents, ['preload'])
})

test('press intent: a quick tap fires on release', () => {
  const { target, intents } = pressed()
  target.dispatchEvent(pointer('pointerup'))
  mock.timers.tick(PRESS_STILL_MS)
  assert.deepEqual(intents, ['preload'])
})

test('press intent: a swipe past the slop cancels, so nothing preloads', () => {
  const { target, intents } = pressed()
  target.dispatchEvent(pointer('pointermove', { y: PRESS_SLOP_PX + 1 }))
  target.dispatchEvent(pointer('pointerup', { y: 40 }))
  mock.timers.tick(PRESS_STILL_MS)
  assert.deepEqual(intents, [])
})

test('press intent: a small wobble inside the slop still counts as a press', () => {
  const { target, intents } = pressed()
  target.dispatchEvent(pointer('pointermove', { x: 2, y: 2 }))
  target.dispatchEvent(pointer('pointerup', { x: 2, y: 2 }))
  assert.deepEqual(intents, ['preload'])
})

test('press intent: a cancelled pointer, such as a browser scroll, fires nothing', () => {
  const { target, intents } = pressed()
  target.dispatchEvent(pointer('pointercancel'))
  mock.timers.tick(PRESS_STILL_MS)
  target.dispatchEvent(pointer('pointerup'))
  assert.deepEqual(intents, [])
})
