import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RECORDING_SORTS, recordingSortFor, headerSortKey } from '../src/web/recording-sort.js'

test('recordingSortFor: newest by air date is the fallback', () => {
  assert.equal(recordingSortFor('nope').key, 'newest')
  assert.deepEqual(
    { column: recordingSortFor(undefined).column, dir: recordingSortFor(undefined).dir },
    { column: 'aired_at', dir: 'desc' },
  )
})

test('recordingSortFor: finds each sort by key', () => {
  for (const sort of RECORDING_SORTS) assert.equal(recordingSortFor(sort.key), sort)
})

test('headerSortKey: the Aired header flips between newest and oldest', () => {
  assert.equal(headerSortKey({ column: 'aired_at', current: 'newest' }), 'oldest')
  assert.equal(headerSortKey({ column: 'aired_at', current: 'oldest' }), 'newest')
  assert.equal(headerSortKey({ column: 'aired_at', current: 'az' }), 'newest')
})

test('headerSortKey: other headers pick their sort, unknown headers keep the current one', () => {
  assert.equal(headerSortKey({ column: 'title', current: 'newest' }), 'az')
  assert.equal(headerSortKey({ column: 'show_pattern', current: 'newest' }), 'show')
  assert.equal(headerSortKey({ column: 'status', current: 'largest' }), 'largest')
})
