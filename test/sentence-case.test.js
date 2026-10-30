import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sentenceCase } from '../src/web/sentence-case.js'

test('sentenceCase: turns caps labels into sentence case', () => {
  assert.equal(sentenceCase('NOT IN GUIDE'), 'Not in guide')
  assert.equal(sentenceCase('RECENTLY IMPORTED'), 'Recently imported')
  assert.equal(sentenceCase('not imported'), 'Not imported')
})

test('sentenceCase: keeps proper names and A–Z', () => {
  assert.equal(sentenceCase('SHOW A–Z'), 'Show A–Z')
  assert.equal(sentenceCase('A–Z'), 'A–Z')
  assert.equal(sentenceCase('NOT IN TVHEADEND'), 'Not in TVHeadend')
  assert.equal(sentenceCase(''), '')
})
