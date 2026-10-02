import { test } from 'node:test'
import assert from 'node:assert/strict'

import { cancelAction } from '../src/tvheadend.js'

test('cancelAction: stops a recording in progress', () => {
  assert.equal(cancelAction({ schedStatus: 'recording', autorecId: 'rule' }), 'stop')
})

test('cancelAction: skips a series-rule timer so the rule does not recreate it', () => {
  assert.equal(cancelAction({ schedStatus: 'scheduled', autorecId: 'rule' }), 'skip')
})

test('cancelAction: cancels a one-off timer', () => {
  assert.equal(cancelAction({ schedStatus: 'scheduled', autorecId: null }), 'cancel')
})
