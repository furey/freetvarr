import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSettingBaseline } from '../src/web/setting-baseline.js'

test('a setting that never loaded is never reported as changed', () => {
  const baseline = createSettingBaseline()
  assert.equal(baseline.isChanged(true), false)
  assert.equal(baseline.isChanged(false), false)
})

test('a loaded setting is changed only when the value differs', () => {
  const baseline = createSettingBaseline()
  baseline.remember(false)
  assert.equal(baseline.isChanged(false), false)
  assert.equal(baseline.isChanged(true), true)
})

test('remembering the saved value clears the change', () => {
  const baseline = createSettingBaseline()
  baseline.remember(true)
  assert.equal(baseline.isChanged(false), true)
  baseline.remember(false)
  assert.equal(baseline.isChanged(false), false)
})
