import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  minutesLeft,
  timeLeftLabel,
  nextLabel,
  phoneMetaLine,
  groupsOf,
  matchesFilter,
} from '../src/web/live-list.js'

const clockText = (ms) => `t${ms}`
const nowMs = 0
const minute = 60_000

test('minutesLeft rounds up and never goes negative', () => {
  assert.equal(minutesLeft({ program: { end: 90_000 }, nowMs }), 2)
  assert.equal(minutesLeft({ program: { end: -5_000 }, nowMs }), 0)
})

test('timeLeftLabel counts minutes under an hour and names the end time after that', () => {
  assert.equal(timeLeftLabel({ program: { end: 27 * minute }, nowMs, clockText }), '27 min left')
  assert.equal(timeLeftLabel({ program: { end: 59 * minute }, nowMs, clockText }), '59 min left')
  assert.equal(timeLeftLabel({ program: { end: 60 * minute }, nowMs, clockText }), `until t${60 * minute}`)
})

test('nextLabel joins title and start time and is empty without a next programme', () => {
  assert.equal(nextLabel({ next: { title: 'The Rookie', start: 5 }, clockText }), 'The Rookie · t5')
  assert.equal(nextLabel({ next: null, clockText }), '')
})

test('phoneMetaLine puts the next title after the time left', () => {
  const program = { end: 27 * minute }
  assert.equal(phoneMetaLine({ program, next: { title: 'QI', start: 1 }, nowMs, clockText }), '27 min left · Next QI')
  assert.equal(phoneMetaLine({ program, next: null, nowMs, clockText }), '27 min left')
})

const entry = (id, pinned, extra = {}) => ({ channel: { id, name: `Ch ${id}`, number: id, pinned }, ...extra })
const groupLabelOf = ({ pinned, anyPinned }) => (pinned ? 'Favourites' : anyPinned ? 'Other channels' : 'Channels')

test('groupsOf splits favourites from the rest and relabels when nothing is pinned', () => {
  const entries = [entry(1, true), entry(2, false)]
  assert.deepEqual(groupsOf({ entries, favouritesOnly: false, groupLabelOf }).map((g) => g.label), ['Favourites', 'Other channels'])
  assert.deepEqual(groupsOf({ entries: [entry(2, false)], favouritesOnly: false, groupLabelOf }).map((g) => g.label), ['Channels'])
})

test('groupsOf drops the other channels when favourites only is on', () => {
  const groups = groupsOf({ entries: [entry(1, true), entry(2, false)], favouritesOnly: true, groupLabelOf })
  assert.deepEqual(groups.map((g) => g.key), ['pinned'])
  assert.deepEqual(groupsOf({ entries: [entry(2, false)], favouritesOnly: true, groupLabelOf }), [])
})

test('matchesFilter checks channel name, number, now and next titles', () => {
  const e = entry(7, false, { now: { title: 'Home and Away' }, next: { title: 'Neighbours' } })
  assert.equal(matchesFilter({ entry: e, query: '' }), true)
  assert.equal(matchesFilter({ entry: e, query: ' away ' }), true)
  assert.equal(matchesFilter({ entry: e, query: 'neigh' }), true)
  assert.equal(matchesFilter({ entry: e, query: 'ch 7' }), true)
  assert.equal(matchesFilter({ entry: e, query: 'zzz' }), false)
})
