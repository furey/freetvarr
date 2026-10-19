import { test } from 'node:test'
import assert from 'node:assert/strict'
import { searchShowsOf } from '../src/web/search-results.js'
import { showKeyOf as keyOf } from '../src/web/show-key.js'

const recordings = [{ title: 'The Block' }, { title: 'The Block' }, { title: 'Gruen' }, { title: 'Blockbusters' }]
const series = [{ title: 'The Block' }, { title: 'Hard Quiz' }]

test('searchShowsOf: short queries return nothing', () => {
  assert.deepEqual(searchShowsOf({ query: 'b', keyOf, recordings, series }), [])
})

test('searchShowsOf: groups recordings and rules into one show per key', () => {
  const results = searchShowsOf({ query: 'block', keyOf, recordings, series })
  assert.deepEqual(results, [
    { key: 'blockbusters', title: 'Blockbusters', meta: '1 recording' },
    { key: 'the-block', title: 'The Block', meta: '2 recordings · Series rule' },
  ])
})

test('searchShowsOf: a rule with no recordings still matches, accents fold', () => {
  assert.deepEqual(searchShowsOf({ query: 'quiz', keyOf, recordings, series }), [{ key: 'hard-quiz', title: 'Hard Quiz', meta: 'Series rule' }])
  assert.equal(searchShowsOf({ query: 'grüen', keyOf, recordings, series })[0].title, 'Gruen')
})
