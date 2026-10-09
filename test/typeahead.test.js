import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterOptions, optionLabel, nextIndex, nextChoosableIndex, isChoosable } from '../src/web/typeahead.js'

const options = [
  { id: 'a', name: 'ABC Kids' },
  { id: 'b', name: 'ABC TV' },
  { id: 'c', name: 'Seven', number: 7 },
  { id: 'd', name: '7two' },
  { id: 'e', name: '7mate' },
  { id: 'f', name: 'Nine' },
  { id: 'g', name: '9Gem' },
  { id: 'h', name: 'The ABC Shop' },
]

const names = (query) => filterOptions({ options, query }).map((o) => o.name)

test('an empty query keeps every option in order', () => {
  assert.deepEqual(names(''), options.map((o) => o.name))
  assert.deepEqual(names('   '), options.map((o) => o.name))
})

test('matching ignores case', () => {
  assert.deepEqual(names('nine'), ['Nine'])
  assert.deepEqual(names('NINE'), ['Nine'])
})

test('exact match ranks before prefix, prefix before word start, word start before contains', () => {
  const ranked = filterOptions({
    options: [
      { id: '1', name: 'Big ABC' },
      { id: '2', name: 'XABCX' },
      { id: '3', name: 'ABC Kids' },
      { id: '4', name: 'ABC' },
    ],
    query: 'abc',
  }).map((o) => o.id)
  assert.deepEqual(ranked, ['4', '3', '1', '2'])
})

test('the digit 7 finds 7two and 7mate by name and Seven by number', () => {
  assert.deepEqual(names('7'), ['7two', '7mate', 'Seven'])
})

test('abc finds ABC Kids, ABC TV and The ABC Shop', () => {
  assert.deepEqual(names('abc'), ['ABC Kids', 'ABC TV', 'The ABC Shop'])
})

test('every word of the query must match', () => {
  assert.deepEqual(names('abc tv'), ['ABC TV'])
  assert.deepEqual(names('shop abc'), ['The ABC Shop'])
})

test('a number only matches the whole channel number', () => {
  const ten = [{ id: 'x', name: 'Ten', number: 10 }]
  assert.deepEqual(filterOptions({ options: ten, query: '1' }), [])
  assert.equal(filterOptions({ options: ten, query: '10' }).length, 1)
})

test('a query with no match gives an empty list', () => {
  assert.deepEqual(names('zzz'), [])
})

test('optionLabel falls back to the none label', () => {
  assert.equal(optionLabel({ options, value: 'b', noneLabel: 'No guide' }), 'ABC TV')
  assert.equal(optionLabel({ options, value: '', noneLabel: 'No guide' }), 'No guide')
  assert.equal(optionLabel({ options, value: 'gone', noneLabel: 'No guide' }), 'No guide')
})

test('optionLabel joins the names of several linked guides', () => {
  assert.equal(optionLabel({ options, value: 'a,b', noneLabel: 'No guide' }), 'ABC Kids + ABC TV')
  assert.equal(optionLabel({ options, value: 'a,gone', noneLabel: 'No guide' }), 'ABC Kids')
})

test('nextIndex wraps and starts at the ends', () => {
  assert.equal(nextIndex({ current: -1, delta: 1, length: 3 }), 0)
  assert.equal(nextIndex({ current: -1, delta: -1, length: 3 }), 2)
  assert.equal(nextIndex({ current: 2, delta: 1, length: 3 }), 0)
  assert.equal(nextIndex({ current: 0, delta: -1, length: 3 }), 2)
  assert.equal(nextIndex({ current: 0, delta: 1, length: 0 }), -1)
})

const withEmpty = [
  { id: '', name: 'No listings' },
  { id: 'n', name: 'ABC Business in 90 Seconds', empty: true },
  { id: 'a', name: 'ABC NEWS' },
  { id: 'b', name: 'ABC Business', empty: true },
]

test('filterOptions lists guide channels with no shows after the ones with shows', () => {
  assert.deepEqual(filterOptions({ options: withEmpty.slice(1), query: 'abc' }).map((o) => o.id), ['a', 'n', 'b'])
})

test('nextChoosableIndex skips guide channels with no shows', () => {
  assert.equal(isChoosable(withEmpty[1]), false)
  assert.equal(nextChoosableIndex({ options: withEmpty, current: 0, delta: 1 }), 2)
  assert.equal(nextChoosableIndex({ options: withEmpty, current: 2, delta: 1 }), 0)
  assert.equal(nextChoosableIndex({ options: withEmpty, current: 0, delta: -1 }), 2)
  assert.equal(nextChoosableIndex({ options: [withEmpty[1]], current: -1, delta: 1 }), -1)
})
