import { test } from 'node:test'
import assert from 'node:assert/strict'

import { transmitterLabel } from '../src/web/transmitter-label.js'

test('transmitterLabel: strips the country prefix', () => {
  assert.equal(transmitterLabel('au-Sydney'), 'Sydney')
})

test('transmitterLabel: turns underscores into spaces', () => {
  assert.equal(transmitterLabel('au-Gold_Coast'), 'Gold Coast')
  assert.equal(transmitterLabel('au-Sydney_Kings_Cros'), 'Sydney Kings Cros')
})

test('transmitterLabel: leaves names without a country prefix alone', () => {
  assert.equal(transmitterLabel('DVB-T Network'), 'DVB-T Network')
  assert.equal(transmitterLabel(''), '')
  assert.equal(transmitterLabel(undefined), '')
})
