import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  AD_SCAN_TITLE,
  LIBRARY_FILE_GONE_TITLE,
  adScanTitle,
  canAdScan,
  isAdScanBlocked,
} from '../src/web/ad-scan.js'

test('canAdScan: needs ad removal on and an imported recording', () => {
  assert.equal(canAdScan({ adRemovalEnabled: true, recording: { status: 'done' } }), true)
  assert.equal(canAdScan({ adRemovalEnabled: false, recording: { status: 'done' } }), false)
  assert.equal(canAdScan({ adRemovalEnabled: true, recording: { status: 'not_imported' } }), false)
})

test('isAdScanBlocked: blocks only when the library file is known to be gone', () => {
  assert.equal(isAdScanBlocked({ library_file_present: false }), true)
  assert.equal(isAdScanBlocked({ library_file_present: true }), false)
  assert.equal(isAdScanBlocked({}), false)
})

test('adScanTitle: says why a blocked button is greyed out', () => {
  assert.equal(adScanTitle({ library_file_present: false }), LIBRARY_FILE_GONE_TITLE)
  assert.equal(adScanTitle({ library_file_present: true }), AD_SCAN_TITLE)
})
