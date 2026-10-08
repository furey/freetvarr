import { test } from 'node:test'
import assert from 'node:assert/strict'

import { isOffAir } from '../src/tvheadend.js'

const services = new Map([
  ['disabled', { enabled: false }],
  ['other-disabled', { enabled: false }],
  ['enabled', { enabled: true }],
])

test('isOffAir: a channel whose only service is disabled is off air', () => {
  assert.equal(isOffAir({ serviceIds: ['disabled'], services }), true)
})

test('isOffAir: a channel whose every service is disabled is off air', () => {
  assert.equal(isOffAir({ serviceIds: ['disabled', 'other-disabled'], services }), true)
})

test('isOffAir: one enabled service keeps the channel on air', () => {
  assert.equal(isOffAir({ serviceIds: ['disabled', 'enabled'], services }), false)
})

test('isOffAir: an unknown service is not treated as off air', () => {
  assert.equal(isOffAir({ serviceIds: ['unknown'], services }), false)
  assert.equal(isOffAir({ serviceIds: ['unknown'], services: new Map() }), false)
})

test('isOffAir: a channel with no services is not off air', () => {
  assert.equal(isOffAir({ serviceIds: [], services }), false)
  assert.equal(isOffAir({ services }), false)
})
