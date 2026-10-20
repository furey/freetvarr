import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  initialRotateState,
  rotateStepOf,
  fullscreenExitedState,
  isPhoneScreen,
  ROTATE_QUIET_MS,
} from '../src/web/rotate-fullscreen.js'

const turn = (state, { landscape, eligible = true, fullscreen = false, nowMs = 10_000 }) =>
  rotateStepOf(state, { landscape, eligible, fullscreen, nowMs })

test('turning a phone to landscape enters full screen once', () => {
  const portrait = initialRotateState(false)
  const first = turn(portrait, { landscape: true })
  assert.equal(first.enter, true)
  assert.equal(turn(first.state, { landscape: true, nowMs: 20_000 }).enter, false)
})

test('leaving full screen in landscape stays in the page until the next portrait to landscape turn', () => {
  const entered = turn(initialRotateState(false), { landscape: true, nowMs: 0 }).state
  const exited = fullscreenExitedState(entered, 5_000)
  assert.equal(turn(exited, { landscape: true, nowMs: 6_000 }).enter, false)
  const backToPortrait = turn(exited, { landscape: false, nowMs: 9_000 }).state
  assert.equal(turn(backToPortrait, { landscape: true, nowMs: 12_000 }).enter, true)
})

test('orientation blips just after full screen ends never re-enter it', () => {
  const entered = turn(initialRotateState(false), { landscape: true, nowMs: 0 }).state
  const exited = fullscreenExitedState(entered, 5_000)
  const blip = turn(exited, { landscape: false, nowMs: 5_100 }).state
  assert.equal(turn(blip, { landscape: true, nowMs: 5_200 }).enter, false)
  assert.equal(turn(blip, { landscape: true, nowMs: 5_000 + ROTATE_QUIET_MS + 10 }).enter, false)
})

test('opening the player already in landscape waits for a rotation', () => {
  const landscape = initialRotateState(true)
  assert.equal(landscape.armed, false)
  const portrait = turn(landscape, { landscape: false }).state
  assert.equal(turn(portrait, { landscape: true, nowMs: 30_000 }).enter, true)
})

test('the mini player, Multiview, and existing full screen never auto-enter', () => {
  const portrait = initialRotateState(false)
  assert.equal(turn(portrait, { landscape: true, eligible: false }).enter, false)
  assert.equal(turn(portrait, { landscape: true, fullscreen: true }).enter, false)
})

test('only touch screens with a phone-sized short side count as phones', () => {
  assert.equal(isPhoneScreen({ coarsePointer: true, screenWidth: 393, screenHeight: 852 }), true)
  assert.equal(isPhoneScreen({ coarsePointer: true, screenWidth: 852, screenHeight: 393 }), true)
  assert.equal(isPhoneScreen({ coarsePointer: true, screenWidth: 820, screenHeight: 1180 }), false)
  assert.equal(isPhoneScreen({ coarsePointer: false, screenWidth: 393, screenHeight: 852 }), false)
})
