import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  initialMultiView,
  soundAfterTap,
  tapSound,
  soundButtonOf,
  isMutedIn,
  swapPictures,
  makeMain,
  mainPictureOf,
  setLayout,
  slotOf,
  snapCorner,
  insetBoxAt,
  clampInsetBox,
  watchingTitle,
} from '../src/web/multi-view.js'

test('tapping Muted gives that picture the sound and mutes the other', () => {
  assert.equal(soundAfterTap({ audible: 'primary', tapped: 'secondary' }), 'secondary')
  assert.equal(soundAfterTap({ audible: 'secondary', tapped: 'primary' }), 'primary')
  const state = tapSound(initialMultiView(), 'secondary')
  assert.equal(isMutedIn({ audible: state.audible, picture: 'secondary' }), false)
  assert.equal(isMutedIn({ audible: state.audible, picture: 'primary' }), true)
})

test('tapping Sound on the audible picture mutes it so both are silent', () => {
  assert.equal(soundAfterTap({ audible: 'primary', tapped: 'primary' }), null)
  const silent = tapSound(initialMultiView(), 'primary')
  assert.equal(silent.audible, null)
  assert.equal(isMutedIn({ audible: silent.audible, picture: 'primary' }), true)
  assert.equal(isMutedIn({ audible: silent.audible, picture: 'secondary' }), true)
})

test('tapping Muted when both are silent gives only that picture sound', () => {
  assert.equal(soundAfterTap({ audible: null, tapped: 'secondary' }), 'secondary')
  assert.equal(soundAfterTap({ audible: null, tapped: 'primary' }), 'primary')
})

test('each picture shows one button: Sound on the audible picture, Muted on the other', () => {
  assert.equal(soundButtonOf({ audible: 'primary', picture: 'primary' }).label, 'Sound')
  assert.equal(soundButtonOf({ audible: 'primary', picture: 'secondary' }).label, 'Muted')
  assert.equal(soundButtonOf({ audible: null, picture: 'primary' }).label, 'Muted')
  assert.equal(soundButtonOf({ audible: 'secondary', picture: 'secondary', channelName: 'ABC News' }).ariaLabel,
    'Sound on for ABC News. Tap to mute')
})

test('the first picture keeps the sound when a second joins', () => {
  assert.equal(initialMultiView().audible, 'primary')
})

test('swap exchanges sides and main with inset; make main swaps only when needed', () => {
  const state = initialMultiView()
  assert.equal(mainPictureOf(swapPictures(state)), 'secondary')
  assert.equal(mainPictureOf(swapPictures(swapPictures(state))), 'primary')
  assert.equal(makeMain(state, 'primary'), state)
  assert.equal(mainPictureOf(makeMain(state, 'secondary')), 'secondary')
})

test('swap keeps the sound with its picture', () => {
  const state = swapPictures(tapSound(initialMultiView(), 'secondary'))
  assert.equal(state.audible, 'secondary')
})

test('setLayout accepts split and inset only', () => {
  assert.equal(setLayout(initialMultiView(), 'inset').layout, 'inset')
  assert.equal(setLayout(initialMultiView(), 'grid').layout, 'split')
})

test('slots follow layout, order, and phone portrait stacking', () => {
  const split = initialMultiView()
  assert.equal(slotOf({ state: split, picture: 'primary', portraitPhone: false }), 'left')
  assert.equal(slotOf({ state: split, picture: 'secondary', portraitPhone: false }), 'right')
  assert.equal(slotOf({ state: swapPictures(split), picture: 'primary', portraitPhone: false }), 'right')
  const inset = setLayout(split, 'inset')
  assert.equal(slotOf({ state: inset, picture: 'primary', portraitPhone: false }), 'full')
  assert.equal(slotOf({ state: inset, picture: 'secondary', portraitPhone: false }), 'inset')
  assert.equal(slotOf({ state: inset, picture: 'primary', portraitPhone: true }), 'top')
  assert.equal(slotOf({ state: inset, picture: 'secondary', portraitPhone: true }), 'bottom')
})

test('snapCorner picks the corner nearest the dropped centre', () => {
  const frame = { width: 1000, height: 600 }
  assert.equal(snapCorner({ ...frame, centreX: 100, centreY: 100 }), 'top-left')
  assert.equal(snapCorner({ ...frame, centreX: 900, centreY: 100 }), 'top-right')
  assert.equal(snapCorner({ ...frame, centreX: 100, centreY: 500 }), 'bottom-left')
  assert.equal(snapCorner({ ...frame, centreX: 600, centreY: 301 }), 'bottom-right')
})

test('insetBoxAt places a 16:9 inset in each corner inside the margins', () => {
  const base = { frameWidth: 1366, frameHeight: 768, insetWidth: 340, margin: 24, topReserve: 80, bottomReserve: 60 }
  assert.deepEqual(insetBoxAt({ ...base, corner: 'top-left' }), { left: 24, top: 104, width: 340, height: 191 })
  assert.deepEqual(insetBoxAt({ ...base, corner: 'bottom-right' }), { left: 1002, top: 493, width: 340, height: 191 })
  assert.equal(insetBoxAt({ ...base, frameWidth: 300, corner: 'top-left' }).width, 252)
})

test('clampInsetBox keeps a dragged inset inside the frame', () => {
  const box = clampInsetBox({ left: -50, top: 900, width: 340, height: 191, frameWidth: 1000, frameHeight: 600 })
  assert.deepEqual(box, { left: 0, top: 409, width: 340, height: 191 })
})

test('watchingTitle counts channels', () => {
  assert.equal(watchingTitle(2), 'Watching 2 channels')
})
