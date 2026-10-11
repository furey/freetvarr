import { test } from 'node:test'
import assert from 'node:assert/strict'
import { captionsShowing, captionPreferenceAfterChange } from '../src/web/live-captions.js'

test('captionsShowing is true only when a track is showing', () => {
  assert.equal(captionsShowing([{ mode: 'disabled' }, { mode: 'hidden' }]), false)
  assert.equal(captionsShowing([{ mode: 'disabled' }, { mode: 'showing' }]), true)
  assert.equal(captionsShowing([]), false)
})

test('a change that matches our own write keeps the preference', () => {
  assert.equal(captionPreferenceAfterChange({ observedShowing: true, expectedShowing: true, preference: true }), true)
  assert.equal(captionPreferenceAfterChange({ observedShowing: false, expectedShowing: false, preference: false }), false)
  assert.equal(captionPreferenceAfterChange({ observedShowing: false, expectedShowing: false, preference: true }), true)
})

test('the native menu turning captions on sets the preference on', () => {
  assert.equal(captionPreferenceAfterChange({ observedShowing: true, expectedShowing: false, preference: false }), true)
})

test('the native menu turning captions off sets the preference off', () => {
  assert.equal(captionPreferenceAfterChange({ observedShowing: false, expectedShowing: true, preference: true }), false)
})
