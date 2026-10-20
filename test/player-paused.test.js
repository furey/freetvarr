import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  initialPausedState,
  pausedStateAfter,
  shownPausedOf,
  STUCK_AFTER_MS,
  VIDEO_STATE_EVENTS,
  PAGE_RESYNC_EVENTS,
} from '../src/web/player-paused.js'

const fakeVideo = (fields = {}) => ({ paused: false, currentTime: 10, seeking: false, ended: false, readyState: 4, networkState: 1, ...fields })

const run = (steps) => steps.reduce((state, step) => pausedStateAfter(state, step), initialPausedState)

test('playing shows Pause', () => {
  const state = run([{ type: 'playing', video: fakeVideo(), nowMs: 0 }])
  assert.equal(shownPausedOf(state), false)
})

test('an external pause with no pause event shows Play on the next resync', () => {
  const video = fakeVideo()
  const playing = run([{ type: 'playing', video, nowMs: 0 }])
  video.paused = true
  for (const type of ['visibilitychange', 'pageshow', 'focus', 'webkitendfullscreen', 'tick']) {
    assert.equal(shownPausedOf(pausedStateAfter(playing, { type, video, nowMs: 500 })), true, type)
  }
})

test('the pause event shows Play even after a play event earlier', () => {
  const video = fakeVideo()
  const state = run([
    { type: 'play', video, nowMs: 0 },
    { type: 'pause', video: { ...video, paused: true }, nowMs: 100 },
  ])
  assert.equal(state.paused, true)
})

test('a play event never overrides a video that is still paused', () => {
  const state = run([{ type: 'play', video: fakeVideo({ paused: true }), nowMs: 0 }])
  assert.equal(shownPausedOf(state), true)
})

test('a picture frozen without a pause shows Play once it has not moved for a while', () => {
  const video = fakeVideo()
  const steps = [{ type: 'playing', video, nowMs: 0 }]
  for (let ms = 1_000; ms <= STUCK_AFTER_MS; ms += 1_000) steps.push({ type: 'tick', video, nowMs: ms })
  const frozen = run(steps)
  assert.equal(frozen.paused, false)
  assert.equal(frozen.stuck, true)
  assert.equal(shownPausedOf(frozen), true)
})

test('a moving picture never counts as frozen', () => {
  const steps = [{ type: 'playing', video: fakeVideo({ currentTime: 0 }), nowMs: 0 }]
  for (let s = 1; s <= 10; s += 1) steps.push({ type: 'tick', video: fakeVideo({ currentTime: s }), nowMs: s * 1_000 })
  assert.equal(shownPausedOf(run(steps)), false)
})

test('a seek or a fresh play restarts the frozen clock', () => {
  const video = fakeVideo()
  const nearlyFrozen = run([
    { type: 'playing', video, nowMs: 0 },
    { type: 'tick', video, nowMs: STUCK_AFTER_MS - 100 },
    { type: 'seeked', video, nowMs: STUCK_AFTER_MS - 50 },
  ])
  assert.equal(pausedStateAfter(nearlyFrozen, { type: 'tick', video, nowMs: STUCK_AFTER_MS + 100 }).stuck, false)
})

test('a resumed video clears the frozen state', () => {
  const video = fakeVideo()
  const frozen = run([{ type: 'playing', video, nowMs: 0 }, { type: 'tick', video, nowMs: STUCK_AFTER_MS }])
  assert.equal(frozen.stuck, true)
  const moving = pausedStateAfter(frozen, { type: 'timeupdate', video: fakeVideo({ currentTime: 11 }), nowMs: STUCK_AFTER_MS + 200 })
  assert.equal(shownPausedOf(moving), false)
})

test('the players listen for every event that can change paused', () => {
  for (const type of ['play', 'playing', 'pause', 'waiting', 'stalled', 'webkitendfullscreen']) {
    assert.ok(VIDEO_STATE_EVENTS.includes(type), type)
  }
  assert.deepEqual(PAGE_RESYNC_EVENTS.map((e) => e.type), ['visibilitychange', 'pageshow', 'focus'])
})

test('a missing video counts as paused', () => {
  assert.equal(pausedStateAfter(initialPausedState, { type: 'sync', video: null, nowMs: 0 }).paused, true)
})

test('a stream buffering without data never shows Play, however long it waits', () => {
  const video = fakeVideo({ readyState: 2, networkState: 2 })
  const steps = [{ type: 'playing', video: fakeVideo({ readyState: 4 }), nowMs: 0 }, { type: 'waiting', video, nowMs: 100 }]
  for (let ms = 1_000; ms <= 10_000; ms += 1_000) steps.push({ type: 'tick', video, nowMs: ms })
  const state = run(steps)
  assert.equal(state.buffering, true)
  assert.equal(shownPausedOf(state), false)
})

test('a stalled or seeking stream with data stays buffering until playing or canplay', () => {
  for (const type of ['stalled', 'seeking']) {
    const video = fakeVideo({ readyState: 4 })
    const steps = [{ type: 'playing', video, nowMs: 0 }, { type, video, nowMs: 100 }]
    for (let ms = 1_000; ms <= 10_000; ms += 1_000) steps.push({ type: 'tick', video, nowMs: ms })
    const waiting = run(steps)
    assert.equal(shownPausedOf(waiting), false, type)
    const resumed = pausedStateAfter(waiting, { type: 'canplay', video, nowMs: 10_100 })
    assert.equal(resumed.buffering, false, type)
  }
})

test('an interruption that freezes a picture with data shows Play', () => {
  const video = fakeVideo({ readyState: 4, networkState: 2 })
  const steps = [{ type: 'playing', video, nowMs: 0 }]
  for (let ms = 1_000; ms <= STUCK_AFTER_MS; ms += 1_000) steps.push({ type: 'tick', video, nowMs: ms })
  const state = run(steps)
  assert.equal(state.buffering, false)
  assert.equal(shownPausedOf(state), true)
})

test('a hidden page never counts a still picture as frozen', () => {
  const video = fakeVideo({ readyState: 4 })
  const steps = [{ type: 'playing', video, nowMs: 0 }]
  for (let ms = 1_000; ms <= 10_000; ms += 1_000) steps.push({ type: 'tick', video, nowMs: ms, pageVisible: false })
  assert.equal(shownPausedOf(run(steps)), false)
})
