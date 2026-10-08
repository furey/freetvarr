import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  NO_LISTING_TITLE,
  isOnAir,
  nowProgramFor,
  liveRecordButton,
} from '../src/web/live-record.js'

const program = { title: 'News', start: 1_000, end: 2_000 }

test('isOnAir is true only between start and end', () => {
  assert.equal(isOnAir({ program, nowMs: 1_000 }), true)
  assert.equal(isOnAir({ program, nowMs: 2_000 }), false)
  assert.equal(isOnAir({ program, nowMs: 999 }), false)
  assert.equal(isOnAir({ program: null, nowMs: 1_500 }), false)
})

test('nowProgramFor matches the channel id across number and string', () => {
  const entries = [{ channel: { id: 'a' }, now: null }, { channel: { id: 7 }, now: program }]
  assert.equal(nowProgramFor({ entries, channelId: '7' }), program)
  assert.equal(nowProgramFor({ entries, channelId: 'a' }), null)
  assert.equal(nowProgramFor({ entries, channelId: 'zz' }), null)
  assert.equal(nowProgramFor({ channelId: 'a' }), null)
})

test('liveRecordButton disables with the no-listing title when nothing is on', () => {
  const button = liveRecordButton({ program: null, nowMs: 1_500, recording: false })
  assert.equal(button.disabled, true)
  assert.equal(button.title, NO_LISTING_TITLE)
})

test('liveRecordButton disables when the cached programme has ended', () => {
  assert.equal(liveRecordButton({ program, nowMs: 2_500, recording: false }).disabled, true)
})

test('liveRecordButton offers RECORD for a programme on air', () => {
  const button = liveRecordButton({ program, nowMs: 1_500, recording: false })
  assert.deepEqual([button.disabled, button.label], [false, 'RECORD'])
  assert.match(button.title, /already aired is not included/)
})

test('liveRecordButton shows REC while the channel records', () => {
  const button = liveRecordButton({ program, nowMs: 1_500, recording: true })
  assert.deepEqual([button.disabled, button.label], [false, 'REC'])
})
