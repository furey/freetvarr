import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MINI_CAPTION_LINE,
  captionLineOf,
  isHoverPointer,
  isSwipeDown,
  miniControlsShownOf,
  miniMenuItemsOf,
  miniPictureClickOf,
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

test('captionLineOf keeps mini cues low and never lifts them', () => {
  assert.equal(captionLineOf({ mini: true, lifted: true, liftedLine: 70, restingLine: 85 }), MINI_CAPTION_LINE)
  assert.equal(MINI_CAPTION_LINE, 90)
  assert.equal(captionLineOf({ mini: false, lifted: true, liftedLine: 70, restingLine: 85 }), 70)
  assert.equal(captionLineOf({ mini: false, lifted: false, liftedLine: 70, restingLine: 85 }), 85)
})

test('miniControlsShownOf holds controls while paused, the menu is open, or focus is inside', () => {
  const idle = { hovering: false, tapShown: false, paused: false, menuOpen: false, focusInside: false }
  assert.equal(miniControlsShownOf(idle), false)
  for (const key of Object.keys(idle)) assert.equal(miniControlsShownOf({ ...idle, [key]: true }), true)
})

test('miniPictureClickOf opens the full player only while controls show', () => {
  assert.equal(miniPictureClickOf({ controlsShown: true }), 'expand')
  assert.equal(miniPictureClickOf({ controlsShown: false }), 'reveal')
  assert.equal(isHoverPointer('mouse'), true)
  assert.equal(isHoverPointer('touch'), false)
})

test('miniMenuItemsOf lists captions only with captions and pop out only with support', () => {
  const keysOf = (options) => miniMenuItemsOf(options).map((item) => item.key)
  const wide = { phone: false, hasCaptions: true, captionsOn: true, canPip: true, pipActive: false, muted: false }
  assert.deepEqual(keysOf(wide), ['expand', 'captions', 'pip'])
  assert.deepEqual(keysOf({ ...wide, hasCaptions: false, canPip: false }), ['expand'])
  assert.deepEqual(keysOf({ ...wide, phone: true }), ['sound', 'expand', 'pip'])
  const captions = miniMenuItemsOf(wide).find((item) => item.key === 'captions')
  assert.deepEqual([captions.value, captions.on], ['On', true])
  const sound = miniMenuItemsOf({ ...wide, phone: true, muted: true }).find((item) => item.key === 'sound')
  assert.deepEqual([sound.value, sound.on], ['Muted', false])
})
