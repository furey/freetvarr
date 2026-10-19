import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CONTROLS_HIDE_KEY,
  loadControlsHideS,
  saveControlsHideS,
  controlsHideMsOf,
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
