import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  minutesAgoText,
  startOverOptionsOf,
  startOverNoteOf,
  startOverActionOf,
  behindLiveText,
  fromStartRecordingOf,
  NOTHING_BUFFERED_TEXT,
} from '../src/web/start-over.js'

const clockText = (ms) => `@${new Date(ms).toISOString().slice(11, 16)}`
const NOW = Date.UTC(2026, 9, 19, 9, 53)
const MIN = 60_000

test('both options show while the programme is being recorded', () => {
  const options = startOverOptionsOf({
    recording: { title: 'The Block', start: NOW - 22 * MIN, canPlayFromStart: true },
    bufferStartMs: NOW - 11 * MIN,
    nowMs: NOW,
    clockText,
  })
  assert.deepEqual(options.map((o) => o.key), ['from-start', 'tuned-in'])
  assert.equal(options[0].title, 'From the start')
  assert.equal(options[0].detail, 'Watch The Block from @09:31 while it keeps recording')
  assert.equal(options[1].title, 'Back to when you tuned in')
  assert.equal(options[1].detail, '@09:42 · 11 minutes ago')
  assert.equal(startOverNoteOf(options), '')
})

test('only the buffer option shows when nothing is recording', () => {
  const options = startOverOptionsOf({ recording: null, bufferStartMs: NOW - MIN, nowMs: NOW, clockText })
  assert.deepEqual(options.map((o) => o.key), ['tuned-in'])
  assert.equal(options[0].detail, '@09:52 · 1 minute ago')
  assert.match(startOverNoteOf(options), /shows only when Freetvarr is recording/)
})

test('the buffer option is ready seconds after tuning in', () => {
  const [option] = startOverOptionsOf({ recording: null, bufferStartMs: NOW - 20_000, nowMs: NOW, clockText })
  assert.equal(option.disabled, false)
  assert.equal(option.detail, '@09:52 · just now')
  assert.equal(minutesAgoText(0), 'just now')
})

test('the buffer option explains itself before anything is buffered', () => {
  const options = startOverOptionsOf({ recording: null, hasBuffer: true, bufferStartMs: null, nowMs: NOW, clockText })
  assert.deepEqual(options.map((o) => [o.key, o.disabled, o.detail]), [['tuned-in', true, NOTHING_BUFFERED_TEXT]])
  assert.match(startOverNoteOf(options), /shows only when Freetvarr is recording/)
})

test('from the start is offered at once while recording, even with nothing buffered', () => {
  const options = startOverOptionsOf({
    recording: { title: 'The Block', start: NOW - 22 * MIN, canPlayFromStart: true },
    hasBuffer: true,
    bufferStartMs: null,
    nowMs: NOW,
    clockText,
  })
  assert.deepEqual(options.map((o) => [o.key, Boolean(o.disabled)]), [['from-start', false], ['tuned-in', true]])
})

test('no options without a buffer or a recording', () => {
  assert.deepEqual(startOverOptionsOf({ recording: null, hasBuffer: false, bufferStartMs: null, nowMs: NOW, clockText }), [])
})

test('behindLiveText rounds to whole minutes, at least one', () => {
  assert.equal(behindLiveText(30), '1 min behind live')
  assert.equal(behindLiveText(22 * 60 + 10), '22 min behind live')
})

test('fromStartRecordingOf matches the channel and the current airing only', () => {
  const rec = { channelId: 9, dvrUuid: 'd1', canPlayFromStart: true, start: NOW - 10 * MIN, stopPadded: NOW + 30 * MIN }
  assert.equal(fromStartRecordingOf({ active: [rec], channelId: '9', nowMs: NOW }), rec)
  assert.equal(fromStartRecordingOf({ active: [rec], channelId: '7', nowMs: NOW }), null)
  assert.equal(fromStartRecordingOf({ active: [{ ...rec, failed: true }], channelId: 9, nowMs: NOW }), null)
  assert.equal(fromStartRecordingOf({ active: [{ ...rec, canPlayFromStart: false }], channelId: 9, nowMs: NOW }), null)
  assert.equal(fromStartRecordingOf({ active: [rec], channelId: 9, nowMs: NOW + 40 * MIN }), null)
})

test('startOverActionOf acts directly when only one choice is available', () => {
  const tunedIn = { key: 'tuned-in', title: 'Back to when you tuned in', detail: '@07:30 · 5 minutes ago', disabled: false }
  assert.deepEqual(startOverActionOf([tunedIn]), {
    kind: 'direct',
    key: 'tuned-in',
    title: 'Back to when you tuned in: @07:30 · 5 minutes ago',
  })
})

test('startOverActionOf skips disabled choices', () => {
  const fromStart = { key: 'from-start', title: 'From the start', detail: 'Watch X from @07:00 while it keeps recording' }
  const tunedIn = { key: 'tuned-in', title: 'Back to when you tuned in', detail: NOTHING_BUFFERED_TEXT, disabled: true }
  assert.equal(startOverActionOf([fromStart, tunedIn]).key, 'from-start')
  assert.deepEqual(startOverActionOf([tunedIn]), { kind: 'none' })
})

test('startOverActionOf opens the sheet when both choices are available', () => {
  const fromStart = { key: 'from-start', title: 'From the start', detail: 'x' }
  const tunedIn = { key: 'tuned-in', title: 'Back to when you tuned in', detail: 'y', disabled: false }
  assert.deepEqual(startOverActionOf([fromStart, tunedIn]), { kind: 'sheet' })
})
