import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { adRemovalModeOf, rolledBackStepsOf } from '../src/web/show-page.js'

const sheet = readFileSync(new URL('../src/web/components/recording-options-sheet.js', import.meta.url), 'utf8')

test('rolledBackStepsOf: a failed padding save puts back the last saved values, but not a newer step', () => {
  const saved = { episodes_to_keep: 0, lead_time: 2, lag_time: 10 }
  assert.deepEqual(rolledBackStepsOf({ failed: { lag_time: 15 }, saved }), { lag_time: 10 })
  assert.deepEqual(rolledBackStepsOf({ failed: { lag_time: 15, lead_time: 5 }, saved, pending: { lead_time: 10 } }), { lag_time: 10 })
})

test('adRemovalModeOf: switching ad removal off goes back to Detect when the folder was on Detect', () => {
  assert.equal(adRemovalModeOf({ on: true, openMode: 'detect' }), 'cut')
  assert.equal(adRemovalModeOf({ on: false, openMode: 'detect' }), 'detect')
  assert.equal(adRemovalModeOf({ on: false, openMode: 'cut' }), 'off')
  assert.equal(adRemovalModeOf({ on: false, openMode: 'off' }), 'off')
})

test('recording options sheet: a failed rule save rolls the steppers back, and the ad switch keeps Detect', () => {
  assert.match(sheet, /const rolledBack = rolledBackStepsOf\(\{ failed: patch, saved: savedSteps, pending: pendingPatch\.value \}\)/)
  assert.match(sheet, /savedSteps = \{ \.\.\.savedSteps, \.\.\.patch \}/)
  assert.match(sheet, /ad_removal: adRemovalModeOf\(\{ on: next, openMode: openAdMode \}\)/)
})
