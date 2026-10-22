import { test } from 'node:test'
import assert from 'node:assert/strict'
import { correctionRowsOf, movieChoiceLabelOf, movieKindRowOf } from '../src/web/movie-choice.js'

test('movieChoiceLabelOf: names the action for each choice', () => {
  assert.equal(movieChoiceLabelOf('not-movie'), 'Not a movie')
  assert.equal(movieChoiceLabelOf('movie'), 'This is a movie')
  assert.equal(movieChoiceLabelOf(null), null)
})

test('movieKindRowOf: a tag menu row for a choice, nothing without one', () => {
  assert.deepEqual(movieKindRowOf('not-movie'), { key: 'movie-kind', label: 'Not a movie', icon: 'tag' })
  assert.deepEqual(movieKindRowOf('movie'), { key: 'movie-kind', label: 'This is a movie', icon: 'tag' })
  assert.equal(movieKindRowOf(undefined), null)
})

test('correctionRowsOf: one row per override with its choice, unknown kinds left out', () => {
  assert.deepEqual(correctionRowsOf([
    { showKey: 'king-kong', kind: 'not-movie', title: 'King Kong' },
    { showKey: 'heron', kind: 'movie', title: '' },
    { showKey: 'egret', kind: 'series', title: 'Egret' },
  ]), [
    { showKey: 'king-kong', title: 'King Kong', choice: 'Not a movie' },
    { showKey: 'heron', title: 'heron', choice: 'Movie' },
  ])
  assert.deepEqual(correctionRowsOf(), [])
})
