import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  watchForActionLabelOf,
  watchForOfferOf,
  watchForTitleOf,
  watchRequestOf,
  watchedMessageOf,
} from '../src/web/watch-for.js'

test('watchForOfferOf: offers the trimmed query only when the guide has nothing', () => {
  assert.equal(watchForOfferOf({ query: '  Utopia ', guideCount: 0 }), 'Utopia')
  assert.equal(watchForOfferOf({ query: 'Utopia', guideCount: 3 }), null)
  assert.equal(watchForOfferOf({ query: 'Utopia', searching: true }), null)
  assert.equal(watchForOfferOf({ query: ' U ' }), null)
  assert.equal(watchForOfferOf({ query: null }), null)
})

test('watchForTitleOf: trims the title', () => {
  assert.equal(watchForTitleOf('  Hard Quiz  '), 'Hard Quiz')
  assert.equal(watchForTitleOf(undefined), '')
})

test('watchRequestOf: sends padding only for Record when it appears', () => {
  assert.deepEqual(watchRequestOf({ title: 'Utopia', recordWhenSeen: false, leadTime: 2, lagTime: 10 }), { title: 'Utopia', mode: 'notify' })
  assert.deepEqual(watchRequestOf({ title: 'Utopia', recordWhenSeen: true, leadTime: 5, lagTime: 30 }),
    { title: 'Utopia', mode: 'record', lead_time: 5, lag_time: 30 })
})

test('watchForActionLabelOf: follows the switch', () => {
  assert.equal(watchForActionLabelOf({ recordWhenSeen: false }), 'Watch for')
  assert.equal(watchForActionLabelOf({ recordWhenSeen: true }), 'Record when it appears')
})

test('watchedMessageOf: says what happens next', () => {
  assert.match(watchedMessageOf({ title: 'Utopia', item: { mode: 'notify' } }), /^Watching for "Utopia"/)
  assert.match(watchedMessageOf({ title: 'Utopia', item: { mode: 'record' } }), /once it is in the guide/)
  assert.match(watchedMessageOf({ title: 'Utopia', item: { mode: 'record', fulfilledAt: 'x' } }), /now records/)
})
