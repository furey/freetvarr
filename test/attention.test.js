import { test } from 'node:test'
import assert from 'node:assert/strict'

import { attentionChangesOf, attentionPathOf, isAttending } from '../src/web/attention.js'

const video = (overrides = {}) => ({ paused: false, ended: false, muted: false, volume: 1, ...overrides })

test('a single picture counts while visible and playing, muted or not', () => {
  assert.equal(isAttending({ visible: true, video: video() }), true)
  assert.equal(isAttending({ visible: true, video: video({ muted: true }) }), true)
  assert.equal(isAttending({ visible: true, video: video({ volume: 0 }) }), true)
  assert.equal(isAttending({ visible: false, video: video() }), false)
  assert.equal(isAttending({ visible: true, video: video({ paused: true }) }), false)
  assert.equal(isAttending({ visible: true, video: video({ ended: true }) }), false)
  assert.equal(isAttending({ visible: true, video: null }), false)
})

test('the Miniplayer counts while visible and playing, muted or not', () => {
  assert.equal(isAttending({ visible: true, video: video({ muted: true }) }), true)
  assert.equal(isAttending({ visible: false, video: video() }), false)
  assert.equal(isAttending({ visible: true, video: video({ paused: true }) }), false)
})

test('with several Multiview tiles, a tile counts only with the sound or captions', () => {
  assert.equal(isAttending({ visible: true, video: video(), shared: true }), true)
  assert.equal(isAttending({ visible: true, video: video({ muted: true }), captions: true, shared: true }), true)
  assert.equal(isAttending({ visible: true, video: video({ muted: true }), shared: true }), false)
  assert.equal(isAttending({ visible: true, video: video({ volume: 0 }), shared: true }), false)
  assert.equal(isAttending({ visible: false, video: video(), shared: true }), false)
  assert.equal(isAttending({ visible: true, video: video({ paused: true }), captions: true, shared: true }), false)
})

test('the only Multiview tile left counts even when muted', () => {
  assert.equal(isAttending({ visible: true, video: video({ muted: true }), shared: false }), true)
})

test('a new session reports only once it is attended, then each change once', () => {
  const first = attentionChangesOf({ current: [{ kind: 'live', sessionId: 'a', attending: false }] })
  assert.deepEqual(first.changes, [])
  const second = attentionChangesOf({ sent: first.sent, current: [{ kind: 'live', sessionId: 'a', attending: true }] })
  assert.deepEqual(second.changes, [{ kind: 'live', sessionId: 'a', attending: true }])
  const third = attentionChangesOf({ sent: second.sent, current: [{ kind: 'live', sessionId: 'a', attending: true }] })
  assert.deepEqual(third.changes, [])
  const hidden = attentionChangesOf({ sent: third.sent, current: [{ kind: 'live', sessionId: 'a', attending: false }] })
  assert.deepEqual(hidden.changes, [{ kind: 'live', sessionId: 'a', attending: false }])
})

test('in Multiview only the tile with the sound is attended, and a shared session counts once', () => {
  const { changes } = attentionChangesOf({
    current: [
      { kind: 'live', sessionId: 'a', attending: false },
      { kind: 'live', sessionId: 'b', attending: true },
      { kind: 'live', sessionId: 'b', attending: false },
      { kind: 'live', sessionId: null, attending: true },
    ],
  })
  assert.deepEqual(changes, [{ kind: 'live', sessionId: 'b', attending: true }])
})

test('ended sessions drop out and live and playback ids stay apart', () => {
  const sent = attentionChangesOf({ current: [{ kind: 'live', sessionId: 'x', attending: true }] }).sent
  const { changes, sent: next } = attentionChangesOf({ sent, current: [{ kind: 'play', sessionId: 'x', attending: true }] })
  assert.deepEqual(changes, [{ kind: 'play', sessionId: 'x', attending: true }])
  assert.deepEqual([...next.keys()], ['play:x'])
  assert.equal(attentionPathOf({ kind: 'live', sessionId: 'x' }), '/api/live/x/attention')
  assert.equal(attentionPathOf({ kind: 'play', sessionId: 'x' }), '/api/play/x/attention')
})
