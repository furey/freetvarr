import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boundedMap, boundedSet } from '../src/web/bounded-cache.js'

test('a bounded map drops the oldest entry past its limit', () => {
  const map = boundedMap(2)
  map.set('a', 1).set('b', 2).set('c', 3)
  assert.deepEqual([...map.keys()], ['b', 'c'])
})

test('setting a key again makes it the newest', () => {
  const map = boundedMap(2)
  map.set('a', 1)
  map.set('b', 2)
  map.set('a', 3)
  map.set('c', 4)
  assert.deepEqual([...map], [['a', 3], ['c', 4]])
})

test('a bounded set drops the oldest value past its limit', () => {
  const set = boundedSet(2)
  set.add('a').add('b').add('a').add('c')
  assert.deepEqual([...set], ['a', 'c'])
})
