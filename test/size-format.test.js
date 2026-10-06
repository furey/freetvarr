import { test } from 'node:test'
import assert from 'node:assert/strict'

import { formatDiskSize } from '../src/web/size-format.js'

const GB = 1e9

test('formatDiskSize: under 10GB keeps one decimal, under 1000GB none', () => {
  assert.equal(formatDiskSize(1.44 * GB), '1.4GB')
  assert.equal(formatDiskSize(250 * GB), '250GB')
  assert.equal(formatDiskSize(999.4 * GB), '999GB')
})

test('formatDiskSize: 1000GB and over read as TB with one decimal', () => {
  assert.equal(formatDiskSize(1000 * GB), '1.0TB')
  assert.equal(formatDiskSize(30249 * GB), '30.2TB')
})
