import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MINI_CAPTION_LINE,
  captionLineOf,
  liftedCaptionLineOf,
  closePictureInPictureOf,
  isHoverPointer,
  isSwipeDown,
  miniControlsShownOf,
  miniMenuItemsOf,
  miniCaptionsOnCardOf,
  miniMetaWithSoundOf,
  MINI_CAPTIONS_MIN_WIDTH,
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

test('picture in picture on WebKit uses the presentation mode, never the promise API', async () => {
  const calls = []
  const doc = { pictureInPictureEnabled: true, pictureInPictureElement: null, exitPictureInPicture: async () => calls.push('exit') }
  const video = {
    webkitPresentationMode: 'inline',
    webkitSupportsPresentationMode: (mode) => mode === 'picture-in-picture',
    webkitSetPresentationMode(mode) { calls.push(mode); this.webkitPresentationMode = mode },
    requestPictureInPicture: async () => calls.push('request'),
  }
  assert.equal(await togglePictureInPicture({ video, doc }), true)
  doc.pictureInPictureElement = video
  assert.equal(await togglePictureInPicture({ video, doc }), false)
  assert.deepEqual(calls, ['picture-in-picture', 'inline'])
})

test('picture in picture enters synchronously within the tap on WebKit', () => {
  const calls = []
  const video = {
    webkitPresentationMode: 'inline',
    webkitSupportsPresentationMode: () => true,
    webkitSetPresentationMode: (mode) => calls.push(mode),
  }
  togglePictureInPicture({ video, doc: {} })
  assert.deepEqual(calls, ['picture-in-picture'])
})

test('picture in picture is hidden in an iOS Home Screen app, where WebKit refuses it', () => {
  const doc = { pictureInPictureEnabled: true }
  const video = {
    requestPictureInPicture: async () => {},
    webkitSupportsPresentationMode: () => false,
    webkitSetPresentationMode() {},
  }
  assert.equal(pictureInPictureSupportOf({ video, doc }), false)
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

test('liftedCaptionLineOf keeps a caption line above the controls on a short landscape screen', () => {
  assert.equal(liftedCaptionLineOf({ frameHeight: 390, footerTop: 282, fallbackLine: 70 }), 64)
})

test('liftedCaptionLineOf never lifts cues higher than the fixed lift on taller screens', () => {
  assert.equal(liftedCaptionLineOf({ frameHeight: 810, footerTop: 692, fallbackLine: 70 }), 70)
  assert.equal(liftedCaptionLineOf({ frameHeight: 844, footerTop: 736, fallbackLine: 70 }), 70)
})

test('liftedCaptionLineOf falls back to the fixed lift when the controls cannot be measured', () => {
  assert.equal(liftedCaptionLineOf({ fallbackLine: 70 }), 70)
  assert.equal(liftedCaptionLineOf({ frameHeight: 390, footerTop: -4, fallbackLine: 70 }), 70)
  assert.equal(liftedCaptionLineOf({ frameHeight: 390, footerTop: 400, fallbackLine: 70 }), 70)
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

test('the card ⋯ menu lists Captions only when the card has no room for its button, then Pop out and Close player', () => {
  const keysOf = (options) => miniMenuItemsOf(options).map((item) => item.key)
  const card = { phone: false, hasCaptions: true, captionsOn: true, canPip: true, pipActive: false }
  assert.deepEqual(keysOf({ ...card, captionsOnCard: true }), ['pip', 'close'])
  assert.deepEqual(keysOf({ ...card, captionsOnCard: false }), ['captions', 'pip', 'close'])
  assert.deepEqual(keysOf({ ...card, captionsOnCard: false, hasCaptions: false, canPip: false }), ['close'])
  const captions = miniMenuItemsOf({ ...card, captionsOnCard: false }).find((item) => item.key === 'captions')
  assert.deepEqual([captions.value, captions.on], ['On', true])
  assert.equal(miniMenuItemsOf(card).at(-1).label, 'Close player')
})

test('the phone ⋯ sheet lists Sound, Pop out, and Close player, and never Play or Pause', () => {
  const phone = { phone: true, hasCaptions: true, captionsOn: false, canPip: true, pipActive: false }
  assert.deepEqual(miniMenuItemsOf({ ...phone, muted: false }).map((item) => item.key), ['sound', 'pip', 'close'])
  const sound = miniMenuItemsOf({ ...phone, muted: true })[0]
  assert.deepEqual([sound.value, sound.on], ['Muted', false])
  assert.equal(miniMenuItemsOf({ ...phone, muted: false })[0].value, 'On')
})

test('the card shows its Captions button only when four buttons clear the LIVE badge', () => {
  assert.equal(MINI_CAPTIONS_MIN_WIDTH, 251)
  assert.equal(miniCaptionsOnCardOf({ cardWidth: 240 }), false)
  assert.equal(miniCaptionsOnCardOf({ cardWidth: 250 }), false)
  assert.equal(miniCaptionsOnCardOf({ cardWidth: 251 }), true)
  assert.equal(miniCaptionsOnCardOf({ cardWidth: 360 }), true)
})

test('the phone bar meta line says Muted while the sound is off', () => {
  assert.equal(miniMetaWithSoundOf({ meta: 'Seven · 24 min left', muted: true, phone: true }), 'Seven · 24 min left · Muted')
  assert.equal(miniMetaWithSoundOf({ meta: 'Seven · 24 min left', muted: false, phone: true }), 'Seven · 24 min left')
  assert.equal(miniMetaWithSoundOf({ meta: 'Seven · 24 min left', muted: true, phone: false }), 'Seven · 24 min left')
  assert.equal(miniMetaWithSoundOf({ meta: '', muted: true, phone: true }), 'Muted')
})

test('closePictureInPictureOf exits the standard window when it shows this video', () => {
  const video = {}
  const calls = []
  const doc = { pictureInPictureElement: video, exitPictureInPicture: () => { calls.push('exit'); return Promise.resolve() } }
  assert.equal(closePictureInPictureOf({ video, doc }), true)
  assert.deepEqual(calls, ['exit'])
})

test('closePictureInPictureOf leaves another video in picture in picture alone', () => {
  const calls = []
  const doc = { pictureInPictureElement: {}, exitPictureInPicture: () => { calls.push('exit'); return Promise.resolve() } }
  assert.equal(closePictureInPictureOf({ video: {}, doc }), false)
  assert.deepEqual(calls, [])
})

test('closePictureInPictureOf returns iOS Safari picture in picture to inline', () => {
  const modes = []
  const video = { webkitPresentationMode: 'picture-in-picture', webkitSetPresentationMode: (mode) => modes.push(mode) }
  assert.equal(closePictureInPictureOf({ video, doc: { pictureInPictureElement: null } }), true)
  assert.deepEqual(modes, ['inline'])
})

test('closePictureInPictureOf does nothing for an inline or missing video', () => {
  const modes = []
  const video = { webkitPresentationMode: 'inline', webkitSetPresentationMode: (mode) => modes.push(mode) }
  assert.equal(closePictureInPictureOf({ video, doc: {} }), false)
  assert.equal(closePictureInPictureOf({ video: null, doc: {} }), false)
  assert.deepEqual(modes, [])
})
