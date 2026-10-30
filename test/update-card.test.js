import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  UPDATE_LATER_MS,
  laterAfterPlaybackOf,
  laterOf,
  releaseNotesUrlOf,
  shownVersionOf,
  updateCardBottomOf,
  updateCardCopyOf,
  updateCardVisibleOf,
} from '../src/web/update-card.js'

const base = { stale: true, ready: true, playerFull: false, later: null, playing: false, nowMs: 1_000 }

test('updateCardVisibleOf waits for a stale build and the appear delay', () => {
  assert.equal(updateCardVisibleOf(base), true)
  assert.equal(updateCardVisibleOf({ ...base, stale: false }), false)
  assert.equal(updateCardVisibleOf({ ...base, ready: false }), false)
})

test('updateCardVisibleOf never shows over the full player or multi-view', () => {
  assert.equal(updateCardVisibleOf({ ...base, playerFull: true, playing: true }), false)
  assert.equal(updateCardVisibleOf({ ...base, playing: true }), true)
})

test('Later with nothing playing hides the card for an hour', () => {
  const later = laterOf({ playing: false, nowMs: 1_000 })
  assert.deepEqual(later, { untilMs: 1_000 + UPDATE_LATER_MS })
  assert.equal(updateCardVisibleOf({ ...base, later, nowMs: 2_000 }), false)
  assert.equal(updateCardVisibleOf({ ...base, later, nowMs: 1_000 + UPDATE_LATER_MS }), true)
})

test('Later while playing hides the card until playback stops', () => {
  const later = laterOf({ playing: true, nowMs: 1_000 })
  assert.deepEqual(later, { untilStopped: true })
  assert.equal(updateCardVisibleOf({ ...base, later, playing: true, nowMs: 9e12 }), false)
  assert.equal(laterAfterPlaybackOf({ later, playing: true }), later)
  assert.equal(laterAfterPlaybackOf({ later, playing: false }), null)
  const timed = { untilMs: 5 }
  assert.equal(laterAfterPlaybackOf({ later: timed, playing: false }), timed)
})

test('shownVersionOf shows the version only when it differs from the loaded one', () => {
  assert.equal(shownVersionOf({ latestVersion: '2.0.1', loadedVersion: '2.0.0' }), '2.0.1')
  assert.equal(shownVersionOf({ latestVersion: '2.0.0', loadedVersion: '2.0.0' }), '')
  assert.equal(shownVersionOf({ latestVersion: '2.0.1', loadedVersion: null }), '')
  assert.equal(shownVersionOf({ latestVersion: null, loadedVersion: '2.0.0' }), '')
})

test('updateCardCopyOf switches copy while something plays', () => {
  const idle = updateCardCopyOf({ playing: false, version: '2.0.1' })
  assert.equal(idle.body, 'Reload to start using it. Your recordings and settings stay as they are.')
  assert.equal(idle.note, '')
  assert.equal(idle.reloadLabel, 'Reload')
  assert.equal(idle.releaseUrl, 'https://github.com/furey/freetvarr/releases/tag/2.0.1')
  const playing = updateCardCopyOf({ playing: true, version: '' })
  assert.equal(playing.body, 'Reloading stops what\'s playing. Your recordings and settings stay as they are.')
  assert.equal(playing.note, 'Choose Later and this comes back when you stop watching.')
  assert.equal(playing.reloadLabel, 'Reload now')
  assert.equal(playing.releaseUrl, '')
  assert.equal(releaseNotesUrlOf('2.0.0'), 'https://github.com/furey/freetvarr/releases/tag/2.0.0')
})

test('updateCardBottomOf keeps the CSS place unless the mini player is in the way', () => {
  const wide = { phone: false, viewportWidth: 1280, viewportHeight: 800, railWidth: 88 }
  assert.equal(updateCardBottomOf({ ...wide, miniRect: null }), null)
  assert.equal(updateCardBottomOf({ ...wide, miniRect: { left: 896, top: 510 } }), null)
  assert.equal(updateCardBottomOf({ ...wide, viewportWidth: 834, miniRect: { left: 450, top: 510 } }), 314)
  const phone = { phone: true, viewportWidth: 390, viewportHeight: 844, railWidth: 0 }
  assert.equal(updateCardBottomOf({ ...phone, miniRect: { left: 8, top: 688 } }), 164)
  assert.equal(updateCardBottomOf({ ...phone, miniRect: null }), null)
})
