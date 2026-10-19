import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sharedChannelName } from '../src/tuner-status.js'

const inputs = [{ input: 'adapter-1', mux: '177.5MHz' }, { input: 'adapter-2', mux: '191.625MHz' }]
const subscriptions = [
  { service: 'adapter-1/177.5MHz/7mate', channel: '7mate' },
  { service: 'adapter-2/191.625MHz/9HD', channel: '9HD Sydney' },
]

test('names the channel already tuned on the same multiplex', () => {
  assert.equal(sharedChannelName({ mux: '177.5MHz', inputs, subscriptions }), '7mate')
})

test('returns null when no tuner holds the multiplex', () => {
  assert.equal(sharedChannelName({ mux: '226.5MHz', inputs, subscriptions }), null)
})

test('returns null when the tuner has no named subscription', () => {
  assert.equal(sharedChannelName({ mux: '177.5MHz', inputs, subscriptions: [{ service: 'adapter-1/177.5MHz/x' }] }), null)
})
