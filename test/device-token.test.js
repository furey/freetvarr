import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEVICE_TOKEN_KEY, deviceTokenFrom } from '../src/web/device-token.js'

const memoryStorage = () => {
  const items = new Map()
  return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => items.set(key, value) }
}

test('deviceTokenFrom: keeps one token per browser across page loads', () => {
  const storage = memoryStorage()
  let n = 0
  const newToken = () => `t${++n}`
  assert.equal(deviceTokenFrom({ storage, newToken }), 't1')
  assert.equal(deviceTokenFrom({ storage, newToken }), 't1')
  assert.equal(storage.getItem(DEVICE_TOKEN_KEY), 't1')
})

test('deviceTokenFrom: still gives a token when storage is blocked', () => {
  const storage = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
  assert.equal(deviceTokenFrom({ storage, newToken: () => 'fresh' }), 'fresh')
  assert.equal(deviceTokenFrom({ storage: null, newToken: () => 'fresh' }), 'fresh')
})
