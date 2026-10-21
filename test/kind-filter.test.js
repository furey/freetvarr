import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  airingPairOf,
  airsKindNowOrNext,
  kindFilterChoicesOf,
  kindOfQuery,
  showsMovieChip,
} from '../src/web/kind-filter.js'

const nameLabel = (q) => `Channels named “${q}”`

test('kindOfQuery reads the whole trimmed query as a kind word, ignoring case', () => {
  for (const word of ['film', 'Films', ' MOVIE ', 'movies']) assert.equal(kindOfQuery(word), 'movie')
  for (const word of ['series', 'Show', 'shows']) assert.equal(kindOfQuery(word), 'series')
  for (const word of ['one-off', 'One  off', 'oneoff']) assert.equal(kindOfQuery(word), 'one-off')
})

test('kindOfQuery leaves channel names and partial words to the name filter', () => {
  for (const text of ['SBS World Movies', 'fil', 'film4', '', '7mate', null]) assert.equal(kindOfQuery(text), null)
})

test('kindFilterChoicesOf offers the kind first and the name match second', () => {
  assert.deepEqual(kindFilterChoicesOf({ query: ' Film ', nameLabel }), [
    { key: 'kind', label: 'Movies showing now or next', icon: 'kind' },
    { key: 'name', label: 'Channels named “Film”', icon: 'name' },
  ])
  assert.equal(kindFilterChoicesOf({ query: 'shows', nameLabel })[0].label, 'Series showing now or next')
  assert.equal(kindFilterChoicesOf({ query: 'one off', nameLabel })[0].label, 'One-offs showing now or next')
  assert.deepEqual(kindFilterChoicesOf({ query: 'ABC', nameLabel }), [])
})

test('airingPairOf finds the programme on now and the earliest one after it', () => {
  const past = { start: 0, end: 10 }
  const now = { start: 10, end: 20 }
  const later = { start: 30, end: 40 }
  const next = { start: 20, end: 30 }
  assert.deepEqual(airingPairOf({ programmes: [past, now, later, next], nowMs: 15 }), { now, next })
  assert.deepEqual(airingPairOf({ programmes: [later, next], nowMs: 15 }), { now: null, next })
  assert.deepEqual(airingPairOf({ programmes: undefined, nowMs: 15 }), { now: null, next: null })
})

test('airsKindNowOrNext matches the kind on either the current or the next programme', () => {
  const movie = { kind: 'movie' }
  const series = { kind: 'series' }
  assert.equal(airsKindNowOrNext({ now: series, next: movie, kind: 'movie' }), true)
  assert.equal(airsKindNowOrNext({ now: movie, next: null, kind: 'movie' }), true)
  assert.equal(airsKindNowOrNext({ now: series, next: series, kind: 'movie' }), false)
  assert.equal(airsKindNowOrNext({ now: null, next: null, kind: 'one-off' }), false)
})

test('showsMovieChip marks movies only', () => {
  assert.equal(showsMovieChip({ kind: 'movie' }), true)
  assert.equal(showsMovieChip({ kind: 'one-off' }), false)
  assert.equal(showsMovieChip({ kind: null }), false)
  assert.equal(showsMovieChip(null), false)
})
