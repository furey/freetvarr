import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SLIDE_MS, MAX_TICK_MS, RESUME_MIN_MS, rotationStart, isAdvancing, showsPauseButton, pauseButtonOf,
  fillFractionOf, wrapIndex, nextRotation,
} from '../src/web/hero-rotation.js'

const run = (state, events) => events.reduce(nextRotation, state)
const ticks = (count, nowMs = 0) => Array.from({ length: count }, () => ({ type: 'tick', nowMs, dtMs: MAX_TICK_MS }))
const slideTicks = Math.ceil(SLIDE_MS / MAX_TICK_MS)

test('advances one slide every seven seconds and wraps', () => {
  const start = rotationStart({ count: 3 })
  const half = run(start, ticks(slideTicks / 2))
  assert.equal(half.index, 0)
  assert.equal(fillFractionOf(half), 0.5)
  assert.equal(run(start, ticks(slideTicks)).index, 1)
  assert.equal(run(start, ticks(slideTicks * 3)).index, 0)
})

test('a long frame gap counts as one short tick', () => {
  const state = nextRotation(rotationStart({ count: 2 }), { type: 'tick', nowMs: 0, dtMs: 60_000 })
  assert.equal(state.elapsedMs, MAX_TICK_MS)
})

test('one slide, reduced motion, a hidden page, or an open player never advance', () => {
  assert.equal(isAdvancing(rotationStart({ count: 1 }), 0), false)
  assert.equal(isAdvancing(rotationStart({ count: 3, reducedMotion: true }), 0), false)
  assert.equal(isAdvancing(run(rotationStart({ count: 3 }), [{ type: 'hidden', hidden: true }]), 0), false)
  assert.equal(isAdvancing(run(rotationStart({ count: 3 }), [{ type: 'playerOpen', open: true }]), 0), false)
  const back = run(rotationStart({ count: 3 }), [{ type: 'hidden', hidden: true }, { type: 'hidden', hidden: false }])
  assert.equal(isAdvancing(back, 0), true)
})

test('hover pauses and leaving resumes from where the fill stopped', () => {
  const mid = run(rotationStart({ count: 3 }), ticks(4))
  const hovered = run(mid, [{ type: 'pointerEnter' }, ...ticks(10)])
  assert.equal(hovered.elapsedMs, mid.elapsedMs)
  assert.equal(pauseButtonOf(hovered, 0).label, 'Play slides')
  const left = run(hovered, [{ type: 'pointerLeave' }, ...ticks(1)])
  assert.equal(left.elapsedMs, mid.elapsedMs + MAX_TICK_MS)
})

test('keyboard focus pauses until focus leaves the hero or Play is pressed', () => {
  const focused = run(rotationStart({ count: 3 }), [{ type: 'keyboardFocus' }, { type: 'pointerLeave' }])
  assert.equal(isAdvancing(focused, 0), false)
  assert.equal(pauseButtonOf(focused, 0).action, 'play')
  assert.equal(isAdvancing(nextRotation(focused, { type: 'keyboardLeave' }), 0), true)
  assert.equal(isAdvancing(nextRotation(focused, { type: 'play' }), 0), true)
})

test('focus leaving late in a slide leaves at least three seconds before the next one', () => {
  const late = run(rotationStart({ count: 3 }), ticks(slideTicks - 2))
  const left = run(late, [{ type: 'keyboardFocus' }, { type: 'keyboardLeave' }])
  assert.equal(left.elapsedMs, SLIDE_MS - RESUME_MIN_MS)
  assert.equal(nextRotation(late, { type: 'keyboardLeave' }), late)
})

test('Pause pressed from the keyboard still holds after focus leaves', () => {
  const paused = run(rotationStart({ count: 3 }), [{ type: 'keyboardFocus' }, { type: 'pause' }, { type: 'keyboardLeave' }])
  assert.equal(isAdvancing(paused, 0), false)
})

test('Pause holds until Play, and Play clears hover and touch pauses', () => {
  const paused = run(rotationStart({ count: 3 }), [{ type: 'pause' }, { type: 'pointerEnter' }, { type: 'touchStart' }])
  assert.equal(pauseButtonOf(paused, 0).action, 'play')
  const played = nextRotation(paused, { type: 'play' })
  assert.equal(isAdvancing(played, 0), true)
  assert.deepEqual(pauseButtonOf(played, 0), { action: 'pause', label: 'Pause slides' })
})

test('a touch holds the slide and lifting resumes at once with at least three seconds left', () => {
  const late = run(rotationStart({ count: 3 }), ticks(slideTicks - 2))
  const touched = nextRotation(late, { type: 'touchStart' })
  assert.equal(isAdvancing(touched, 0), false)
  const lifted = nextRotation(touched, { type: 'touchEnd' })
  assert.equal(isAdvancing(lifted, 0), true)
  assert.equal(lifted.elapsedMs, SLIDE_MS - RESUME_MIN_MS)
  assert.equal(nextRotation(late, { type: 'touchEnd' }), late)
})

test('a swipe while playing keeps playing on the new slide', () => {
  const swiped = run(rotationStart({ count: 3 }), [{ type: 'touchStart' }, { type: 'touchEnd' }, { type: 'step', delta: 1 }])
  assert.deepEqual([swiped.index, swiped.elapsedMs], [1, 0])
  assert.equal(isAdvancing(swiped, 0), true)
})

test('goTo and step jump, wrap, and restart the fill', () => {
  const mid = run(rotationStart({ count: 4 }), ticks(5))
  assert.deepEqual([nextRotation(mid, { type: 'goTo', index: 2 }).index, nextRotation(mid, { type: 'goTo', index: 2 }).elapsedMs], [2, 0])
  assert.equal(nextRotation(mid, { type: 'step', delta: -1 }).index, 3)
  assert.equal(nextRotation(mid, { type: 'step', delta: 1 }).index, 1)
  assert.equal(wrapIndex({ index: 5, count: 0 }), 0)
})

test('sync keeps the current slide when it still exists and clamps otherwise', () => {
  const at2 = run(rotationStart({ count: 4 }), [{ type: 'goTo', index: 2 }, ...ticks(3)])
  const kept = nextRotation(at2, { type: 'sync', count: 5, index: 2 })
  assert.equal(kept.elapsedMs, at2.elapsedMs)
  const moved = nextRotation(at2, { type: 'sync', count: 5, index: 3 })
  assert.deepEqual([moved.index, moved.elapsedMs], [3, 0])
  assert.equal(nextRotation(at2, { type: 'sync', count: 2, index: -1 }).index, 0)
})

test('reduced motion hides Pause and shows a full bar', () => {
  const reduced = nextRotation(rotationStart({ count: 3 }), { type: 'reducedMotion', reduced: true })
  assert.equal(showsPauseButton(reduced), false)
  assert.equal(fillFractionOf(reduced), 1)
  assert.equal(showsPauseButton(rotationStart({ count: 3 })), true)
  assert.equal(showsPauseButton(rotationStart({ count: 1 })), false)
  assert.equal(nextRotation(reduced, { type: 'nothing' }), reduced)
})

test('an open sheet holds the slide, even with the page hidden, until it closes', () => {
  const opened = run(rotationStart({ count: 3 }), [{ type: 'overlayOpen', open: true }, ...ticks(slideTicks * 2)])
  assert.deepEqual([opened.index, opened.elapsedMs], [0, 0])
  assert.equal(pauseButtonOf(opened, 0).action, 'play')
  const back = run(opened, [{ type: 'hidden', hidden: true }, { type: 'hidden', hidden: false }, ...ticks(slideTicks)])
  assert.equal(back.index, 0)
  assert.equal(isAdvancing(nextRotation(back, { type: 'overlayOpen', open: false }), 0), true)
})

test('closing a sheet late in a slide leaves at least three seconds before the next one', () => {
  const late = run(rotationStart({ count: 3 }), ticks(slideTicks - 2))
  const closed = run(late, [{ type: 'overlayOpen', open: true }, { type: 'overlayOpen', open: false }])
  assert.equal(closed.elapsedMs, SLIDE_MS - RESUME_MIN_MS)
  const early = run(rotationStart({ count: 3 }), ticks(2))
  assert.equal(run(early, [{ type: 'overlayOpen', open: true }, { type: 'overlayOpen', open: false }]).elapsedMs, early.elapsedMs)
  assert.equal(nextRotation(late, { type: 'overlayOpen', open: false }), late)
})

test('after a sheet closes, hover over the buttons still holds the slide until the pointer leaves', () => {
  const closed = [{ type: 'overlayOpen', open: true }, { type: 'overlayOpen', open: false }]
  const hovered = run(rotationStart({ count: 3 }), [...closed, { type: 'pointerEnter' }])
  assert.equal(isAdvancing(hovered, 0), false)
  assert.equal(isAdvancing(nextRotation(hovered, { type: 'pointerLeave' }), 0), true)
})
