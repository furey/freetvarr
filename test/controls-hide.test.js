import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CONTROLS_HIDE_KEY,
  loadControlsHideS,
  saveControlsHideS,
  controlsHideMsOf,
  singleTapPlanOf,
  holdsControlsForFocus,
  isControlTarget,
} from '../src/web/controls-hide.js'

const memoryStorage = (initial = {}) => {
  const data = { ...initial }
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => { data[key] = value },
  }
}

const brokenStorage = {
  getItem: () => { throw new Error('blocked') },
  setItem: () => { throw new Error('blocked') },
}

test('controls hide after 3 seconds until a choice is saved', () => {
  assert.equal(loadControlsHideS(memoryStorage()), 3)
  assert.equal(controlsHideMsOf(memoryStorage()), 3000)
})

test('a saved choice from 1 to 5 seconds is read back', () => {
  const storage = memoryStorage()
  saveControlsHideS(storage, 5)
  assert.equal(storage.data[CONTROLS_HIDE_KEY], '5')
  assert.equal(loadControlsHideS(storage), 5)
  assert.equal(controlsHideMsOf(storage), 5000)
})

test('values outside the choices fall back to 3 seconds and are not saved', () => {
  assert.equal(loadControlsHideS(memoryStorage({ [CONTROLS_HIDE_KEY]: '9' })), 3)
  assert.equal(loadControlsHideS(memoryStorage({ [CONTROLS_HIDE_KEY]: 'abc' })), 3)
  const storage = memoryStorage()
  saveControlsHideS(storage, 7)
  assert.deepEqual(storage.data, {})
})

test('blocked storage keeps the default and does not throw', () => {
  assert.equal(loadControlsHideS(brokenStorage), 3)
  assert.doesNotThrow(() => saveControlsHideS(brokenStorage, 2))
})

test('a touch tap on the picture toggles the controls, a mouse click toggles pause', () => {
  assert.equal(singleTapPlanOf({ pointerType: 'touch', controlsShown: true }), 'hide')
  assert.equal(singleTapPlanOf({ pointerType: 'touch', controlsShown: false }), 'reveal')
  assert.equal(singleTapPlanOf({ pointerType: 'mouse', controlsShown: true }), 'toggle-pause')
  assert.equal(singleTapPlanOf({ pointerType: 'pen', controlsShown: false }), 'toggle-pause')
})

const element = ({ focusVisible = true, inside = true } = {}) => ({
  matches: (selector) => selector === ':focus-visible' && focusVisible,
  inside,
})
const rootOf = (self) => ({ contains: (el) => el === self.root || Boolean(el?.inside) })

test('a keyboard-focused control inside the player holds the controls shown', () => {
  const self = {}
  self.root = rootOf(self)
  assert.equal(holdsControlsForFocus({ focused: element(), root: self.root }), true)
  assert.equal(holdsControlsForFocus({ focused: element({ focusVisible: false }), root: self.root }), false)
  assert.equal(holdsControlsForFocus({ focused: element({ inside: false }), root: self.root }), false)
})

test('the player root itself never holds the controls, even when WebKit marks it focus-visible', () => {
  const self = {}
  self.root = { ...rootOf(self), matches: () => true }
  assert.equal(holdsControlsForFocus({ focused: self.root, root: self.root }), false)
  assert.equal(holdsControlsForFocus({ focused: null, root: self.root }), false)
})

test('taps on buttons and the scrubber count as control taps, taps on the picture do not', () => {
  const at = (match) => ({ closest: (selector) => (match && selector.includes(match) ? {} : null) })
  assert.equal(isControlTarget(at('button')), true)
  assert.equal(isControlTarget(at('input')), true)
  assert.equal(isControlTarget(at(null)), false)
  assert.equal(isControlTarget(null), false)
})
