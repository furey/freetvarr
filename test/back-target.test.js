import { test } from 'node:test'
import assert from 'node:assert/strict'
import { backTargetOf, entryStateWithOrigin, BACK_FALLBACK } from '../src/web/back-target.js'

const SHOW = '#/recordings/show/the-bear'

test('backTargetOf: opened from Home says Home and returns there', () => {
  assert.deepEqual(backTargetOf({ previousHash: '#/home', currentHash: SHOW }), { label: 'Home', route: '#/home', usesHistory: true })
})

test('backTargetOf: opened from the Recordings library says Recordings and keeps the query', () => {
  const previousHash = '#/recordings?view=grid'
  assert.deepEqual(backTargetOf({ previousHash, currentHash: SHOW }), { label: 'Recordings', route: previousHash, usesHistory: true })
})

test('backTargetOf: opened from Scheduled says Scheduled', () => {
  assert.equal(backTargetOf({ previousHash: '#/recordings/scheduled', currentHash: SHOW }).label, 'Scheduled')
})

test('backTargetOf: opened from Guide, Live TV, or Settings uses that destination name', () => {
  assert.equal(backTargetOf({ previousHash: '#/guide', currentHash: SHOW }).label, 'TV guide')
  assert.equal(backTargetOf({ previousHash: '#/live', currentHash: SHOW }).label, 'Live TV')
  assert.equal(backTargetOf({ previousHash: '#/settings/system/health', currentHash: SHOW }).label, 'Settings')
})

test('backTargetOf: opened from another show says Back', () => {
  assert.equal(backTargetOf({ previousHash: '#/recordings/show/severance', currentHash: SHOW }).label, 'Back')
})

test('backTargetOf: a direct link or the same page falls back to Recordings', () => {
  assert.equal(backTargetOf({ previousHash: undefined, currentHash: SHOW }), BACK_FALLBACK)
  assert.equal(backTargetOf({ previousHash: '', currentHash: SHOW }), BACK_FALLBACK)
  assert.equal(backTargetOf({ previousHash: SHOW, currentHash: SHOW }), BACK_FALLBACK)
  assert.equal(BACK_FALLBACK.usesHistory, false)
})

test('backTargetOf: a caller can supply its own fallback', () => {
  const fallback = { label: 'TV guide', route: '#/guide', usesHistory: false }
  assert.equal(backTargetOf({ previousHash: null, fallback }), fallback)
})

test('entryStateWithOrigin: a new history entry records the page it came from', () => {
  assert.deepEqual(entryStateWithOrigin({ state: null, originHash: '#/home' }), { cameFrom: '#/home' })
  assert.deepEqual(entryStateWithOrigin({ state: { scroll: 4 }, originHash: '#/home' }), { scroll: 4, cameFrom: '#/home' })
})

test('entryStateWithOrigin: going back or forward keeps the origin the entry already has', () => {
  const state = { cameFrom: '#/recordings' }
  assert.equal(entryStateWithOrigin({ state, originHash: '#/home' }), state)
})

test('entryStateWithOrigin: an entry with no origin page stores null', () => {
  assert.deepEqual(entryStateWithOrigin({ state: null, originHash: '' }), { cameFrom: null })
})
