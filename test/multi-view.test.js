import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  initialMultiView,
  soundAfterTap,
  tapSound,
  soundButtonOf,
  isMutedIn,
  audibleSessionsOf,
  swapPictures,
  makeMain,
  mainPictureOf,
  setLayout,
  slotOf,
  snapCorner,
  insetBoxAt,
  clampInsetBox,
  watchingTitle,
  addPicture,
  nextPictureOf,
  soundAfterStop,
  removePicture,
  promoteIntoPrimary,
  pictureLimitOf,
  canAddPictureOf,
  shownLayoutOf,
  slotCountOf,
  tileBoxesOf,
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

test('adding pictures appends the next free one and stops at 4', () => {
  const three = addPicture(initialMultiView())
  assert.deepEqual(three.order, ['primary', 'secondary', 'third'])
  const four = addPicture(three)
  assert.deepEqual(four.order, ['primary', 'secondary', 'third', 'fourth'])
  assert.equal(addPicture(four), four)
  assert.equal(nextPictureOf(['primary', 'third']), 'secondary')
})

test('make main swaps the chosen picture with the main one and keeps the sound with its picture', () => {
  const four = { ...addPicture(addPicture(initialMultiView())), audible: 'third' }
  const state = makeMain(four, 'third')
  assert.deepEqual(state.order, ['third', 'secondary', 'primary', 'fourth'])
  assert.equal(state.audible, 'third')
})

test('a stopped audible picture hands the sound to the main picture, skipping ended ones', () => {
  const order = ['primary', 'secondary', 'third']
  assert.equal(soundAfterStop({ audible: 'secondary', stopped: 'secondary', order }), 'primary')
  assert.equal(soundAfterStop({ audible: 'primary', stopped: 'primary', order }), 'secondary')
  assert.equal(soundAfterStop({ audible: 'primary', stopped: 'primary', order, ended: ['secondary'] }), 'third')
  assert.equal(soundAfterStop({ audible: 'third', stopped: 'secondary', order }), 'third')
  assert.equal(soundAfterStop({ audible: null, stopped: 'secondary', order }), null)
})

test('removing a picture closes its slot and moves its sound to the main picture', () => {
  const state = removePicture({ ...addPicture(initialMultiView()), audible: 'third' }, 'third')
  assert.deepEqual(state.order, ['primary', 'secondary'])
  assert.equal(state.audible, 'primary')
})

test('removing the primary picture promotes a companion into its place', () => {
  const four = addPicture(addPicture(initialMultiView()))
  const state = promoteIntoPrimary({ ...four, order: ['secondary', 'primary', 'third', 'fourth'], audible: 'secondary' }, 'secondary')
  assert.deepEqual(state.order, ['primary', 'third', 'fourth'])
  assert.equal(state.audible, 'primary')
  const lost = promoteIntoPrimary({ ...four, audible: 'primary' }, 'secondary')
  assert.deepEqual(lost.order, ['primary', 'third', 'fourth'])
  assert.equal(lost.audible, 'primary')
})

test('phones show 2 pictures, tablets and computers 4, never more than the NAS streams', () => {
  assert.equal(pictureLimitOf({ compact: true }), 2)
  assert.equal(pictureLimitOf({ compact: false }), 4)
  assert.equal(pictureLimitOf({ compact: false, streams: { max: 3, inUse: 0 } }), 3)
  assert.equal(canAddPictureOf({ count: 2, compact: true }), false)
  assert.equal(canAddPictureOf({ count: 3, compact: false, streams: { max: 4, inUse: 3 } }), true)
  assert.equal(canAddPictureOf({ count: 3, compact: false, streams: { max: 4, inUse: 4 } }), false)
  assert.equal(canAddPictureOf({ count: 4, compact: false }), false)
})

test('3 or more pictures show Grid or Big and small with a strip, and use tiles', () => {
  const three = addPicture(initialMultiView())
  assert.equal(shownLayoutOf({ layout: 'split', portraitPhone: false, count: 3 }), 'grid')
  assert.equal(shownLayoutOf({ layout: 'inset', portraitPhone: false, count: 4 }), 'strip')
  assert.equal(shownLayoutOf({ layout: 'inset', portraitPhone: true, count: 2 }), 'stacked')
  assert.equal(slotOf({ state: three, picture: 'third', portraitPhone: false }), 'tile')
  assert.equal(slotCountOf({ count: 3, canAdd: true }), 4)
  assert.equal(slotCountOf({ count: 3, canAdd: false }), 3)
  assert.equal(slotCountOf({ count: 2, canAdd: true }), 2)
})

const AREA = { left: 28, top: 76, width: 1310, height: 644 }
const inside = (box, area) => box.left >= area.left - 1 && box.top >= area.top - 1
  && box.left + box.width <= area.left + area.width + 1 && box.top + box.height <= area.top + area.height + 1
const overlaps = (a, b) => a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height

test('grid tiles are four 16:9 boxes inside the area with no overlap', () => {
  const boxes = tileBoxesOf({ layout: 'grid', slots: 4, area: AREA })
  assert.equal(boxes.length, 4)
  for (const box of boxes) {
    assert.ok(inside(box, AREA))
    assert.ok(Math.abs(box.width * 9 / 16 - box.height) <= 1)
  }
  assert.ok(!boxes.some((a, i) => boxes.some((b, j) => i !== j && overlaps(a, b))))
  assert.equal(boxes[0].top, boxes[1].top)
  assert.equal(boxes[0].left, boxes[2].left)
})

test('the strip sits to the right when landscape and below when portrait', () => {
  const right = tileBoxesOf({ layout: 'strip', slots: 4, area: AREA })
  assert.ok(right[1].left > right[0].left + right[0].width)
  assert.ok(right[1].width < right[0].width)
  assert.ok(right.every((box) => inside(box, AREA)))
  const portraitArea = { left: 24, top: 92, width: 786, height: 1050 }
  const below = tileBoxesOf({ layout: 'strip', slots: 4, area: portraitArea })
  assert.ok(below[1].top > below[0].top + below[0].height)
  assert.equal(below[1].top, below[3].top)
  assert.ok(below.every((box) => inside(box, portraitArea)))
  const short = { left: 0, top: 0, width: 1000, height: 300 }
  assert.ok(tileBoxesOf({ layout: 'strip', slots: 4, area: short }).every((box) => inside(box, short)))
})

test('only the picture with the sound counts as heard in Multiview', () => {
  const ids = { primary: 'a', secondary: 'b', third: null, fourth: 'c' }
  const sessionOf = (picture) => ids[picture]
  assert.deepEqual([...audibleSessionsOf({ active: true, audible: 'secondary', sessionOf })], [['a', false], ['b', true], ['c', false]])
  assert.deepEqual([...audibleSessionsOf({ active: true, audible: null, sessionOf })], [['a', false], ['b', false], ['c', false]])
  assert.deepEqual([...audibleSessionsOf({ active: false, audible: null, sessionOf: (picture) => (picture === 'primary' ? 'a' : null) })], [['a', true]])
})
