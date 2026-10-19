import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isSwipeDown,
  minutesLeftText,
  pictureInPictureSupportOf,
  togglePictureInPicture,
} from '../src/web/mini-player.js'

test('isSwipeDown needs a quick, mostly vertical, downward drag', () => {
  assert.equal(isSwipeDown({ startX: 100, startY: 100, endX: 110, endY: 220, ms: 300 }), true)
  assert.equal(isSwipeDown({ startX: 100, startY: 100, endX: 110, endY: 150, ms: 300 }), false)
  assert.equal(isSwipeDown({ startX: 100, startY: 220, endX: 100, endY: 100, ms: 300 }), false)
  assert.equal(isSwipeDown({ startX: 100, startY: 100, endX: 260, endY: 200, ms: 300 }), false)
  assert.equal(isSwipeDown({ startX: 100, startY: 100, endX: 100, endY: 300, ms: 1500 }), false)
})

test('minutesLeftText rounds up', () => {
  assert.equal(minutesLeftText({ endMs: 18 * 60_000 - 5, nowMs: 0 }), '18 min left')
  assert.equal(minutesLeftText({ endMs: null, nowMs: 0 }), '')
})

test('picture in picture uses the standard API when enabled', async () => {
  const calls = []
  const doc = {
    pictureInPictureEnabled: true,
    pictureInPictureElement: null,
    exitPictureInPicture: async () => calls.push('exit'),
  }
  const video = { requestPictureInPicture: async () => calls.push('enter') }
  assert.equal(pictureInPictureSupportOf({ video, doc }), true)
  assert.equal(await togglePictureInPicture({ video, doc }), true)
  doc.pictureInPictureElement = video
  assert.equal(await togglePictureInPicture({ video, doc }), false)
  assert.deepEqual(calls, ['enter', 'exit'])
})

test('picture in picture falls back to the WebKit presentation mode on iOS', async () => {
  const video = {
    webkitPresentationMode: 'inline',
    webkitSupportsPresentationMode: (mode) => mode === 'picture-in-picture',
    webkitSetPresentationMode(mode) { this.webkitPresentationMode = mode },
  }
  assert.equal(pictureInPictureSupportOf({ video, doc: {} }), true)
  await togglePictureInPicture({ video, doc: {} })
  assert.equal(video.webkitPresentationMode, 'picture-in-picture')
})

test('picture in picture is hidden when unsupported', () => {
  assert.equal(pictureInPictureSupportOf({ video: {}, doc: { pictureInPictureEnabled: false } }), false)
  assert.equal(pictureInPictureSupportOf({ video: { requestPictureInPicture() {}, disablePictureInPicture: true }, doc: { pictureInPictureEnabled: true } }), false)
})
