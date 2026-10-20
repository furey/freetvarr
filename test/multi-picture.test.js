import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  keyPictureOf,
  pictureControlsAfter,
  pictureBadgeOf,
  resumeLabelOf,
  pictureOverlayOf,
  multiHintOf,
  pictureMenuOf,
  endedActionsOf,
} from '../src/web/multi-picture.js'

test('keys act on the picture you hear, or the main picture when both are muted', () => {
  assert.equal(keyPictureOf({ audible: 'secondary', order: ['primary', 'secondary'] }), 'secondary')
  assert.equal(keyPictureOf({ audible: null, order: ['secondary', 'primary'] }), 'secondary')
})

test('pointing shows controls for that picture only, and leaving hides them', () => {
  assert.equal(pictureControlsAfter({ shownFor: null, picture: 'primary', event: 'point' }), 'primary')
  assert.equal(pictureControlsAfter({ shownFor: 'primary', picture: 'secondary', event: 'point' }), 'secondary')
  assert.equal(pictureControlsAfter({ shownFor: 'primary', picture: 'primary', event: 'leave' }), null)
  assert.equal(pictureControlsAfter({ shownFor: 'secondary', picture: 'primary', event: 'leave' }), 'secondary')
})

test('a tap shows controls first and a second tap on the same picture hides them', () => {
  assert.equal(pictureControlsAfter({ shownFor: null, picture: 'primary', event: 'tap' }), 'primary')
  assert.equal(pictureControlsAfter({ shownFor: 'primary', picture: 'primary', event: 'tap' }), null)
  assert.equal(pictureControlsAfter({ shownFor: 'primary', picture: 'secondary', event: 'tap' }), 'secondary')
  assert.equal(pictureControlsAfter({ shownFor: 'primary', picture: null, event: 'timeout' }), null)
})

test('the badge reads Paused, the minutes behind, or Live', () => {
  assert.deepEqual(pictureBadgeOf({ paused: true, behindMinutes: 3 }), { kind: 'paused', text: 'Paused' })
  assert.deepEqual(pictureBadgeOf({ paused: false, behindMinutes: 2 }), { kind: 'behind', text: '2 min behind' })
  assert.deepEqual(pictureBadgeOf({ paused: false, behindMinutes: 0 }), { kind: 'live', text: 'Live' })
})

test('the resume label adds the minutes behind when there are any', () => {
  assert.equal(resumeLabelOf({ behindMinutes: 3 }), 'Paused · 3 min behind')
  assert.equal(resumeLabelOf({ behindMinutes: 0 }), 'Paused')
})

test('a paused picture keeps a Play button and dims after its controls hide', () => {
  assert.deepEqual(pictureOverlayOf({ playing: true, controlsShown: false, paused: true }),
    { controls: false, resume: true, badge: true, dim: true })
  assert.deepEqual(pictureOverlayOf({ playing: true, controlsShown: true, paused: true }),
    { controls: true, resume: false, badge: false, dim: true })
  assert.deepEqual(pictureOverlayOf({ playing: false, controlsShown: true, paused: false }),
    { controls: false, resume: false, badge: false, dim: false })
})

test('the hint names pointing or tapping, and the gesture that makes the small picture big', () => {
  assert.match(multiHintOf({ layout: 'split', hover: true }), /^Point at a picture/)
  assert.match(multiHintOf({ layout: 'stacked', hover: false }), /^Tap a picture/)
  assert.match(multiHintOf({ layout: 'inset', hover: true }), /double-click it/)
  assert.match(multiHintOf({ layout: 'inset', hover: false }), /double-tap it/)
})

test('the hint names the others once a third picture joins, and how to make a small one main', () => {
  assert.match(multiHintOf({ layout: 'grid', hover: true }), /the others mute/)
  assert.match(multiHintOf({ layout: 'split', hover: true }), /the other mutes/)
  assert.match(multiHintOf({ layout: 'strip', hover: false }), /Double-tap a small picture/)
})

test('the picture menu keeps 2-picture items and adds Make main and Remove from 3 pictures', () => {
  assert.deepEqual(pictureMenuOf({ count: 2, isMain: false }).map((i) => i.label), ['Full screen', 'Change channel', 'Stop watching'])
  assert.deepEqual(pictureMenuOf({ count: 3, isMain: false }).map((i) => i.label), ['Make main', 'Change channel', 'Full screen', 'Remove'])
  assert.deepEqual(pictureMenuOf({ count: 4, isMain: true }).map((i) => i.key), ['change', 'full', 'stop'])
})

test('a stopped picture in Multiview offers Pick a channel and Remove', () => {
  assert.deepEqual(endedActionsOf({ multiActive: true, phase: 'ended' }).map((a) => a.label), ['Pick a channel', 'Remove'])
  assert.deepEqual(endedActionsOf({ multiActive: true, phase: 'live' }), [])
  assert.deepEqual(endedActionsOf({ multiActive: false, phase: 'ended' }), [])
})
