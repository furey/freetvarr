import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  NO_LISTING_TITLE,
  isOnAir,
  liveRecordButton,
  recordingProgramIdsOf,
  liveSeriesButton,
  otherSeriesChannelId,
} from '../src/web/live-record.js'

const program = { program_id: 42, title: 'News', start: 1_000, end: 2_000 }

test('isOnAir is true only between start and end', () => {
  assert.equal(isOnAir({ program, nowMs: 1_000 }), true)
  assert.equal(isOnAir({ program, nowMs: 2_000 }), false)
  assert.equal(isOnAir({ program, nowMs: 999 }), false)
  assert.equal(isOnAir({ program: null, nowMs: 1_500 }), false)
})

test('liveRecordButton disables with the no-listing title when nothing is on', () => {
  const button = liveRecordButton({ program: null, nowMs: 1_500 })
  assert.equal(button.disabled, true)
  assert.equal(button.title, NO_LISTING_TITLE)
})

test('liveRecordButton disables when the cached programme has ended', () => {
  assert.equal(liveRecordButton({ program, nowMs: 2_500 }).disabled, true)
})

test('liveRecordButton offers RECORD for a programme on air', () => {
  const button = liveRecordButton({ program, nowMs: 1_500, recordingProgramIds: new Set(['7']) })
  assert.deepEqual([button.disabled, button.label], [false, 'RECORD'])
  assert.match(button.title, /already aired is not included/)
})

test('liveRecordButton offers STOP REC while this programme records', () => {
  const button = liveRecordButton({ program, nowMs: 1_500, recordingProgramIds: new Set(['42']) })
  assert.deepEqual([button.disabled, button.recording, button.label], [false, true, 'STOP REC'])
  assert.match(button.ariaLabel, /Stop recording/)
})

test('recordingProgramIdsOf keeps working recordings with a programme id', () => {
  const active = [{ programId: 42 }, { programId: 7, failed: true }, { programId: null }, { programId: '9' }]
  assert.deepEqual([...recordingProgramIdsOf(active)], ['42', '9'])
  assert.deepEqual([...recordingProgramIdsOf()], [])
})

const episode = { title: 'Gruen', start: 1_000, end: 2_000, series_link: 'abc|gruen' }
const names = (id) => ({ xyz: 'ABC TV Plus' })[id] || ''

test('liveSeriesButton disables when nothing is on air', () => {
  const button = liveSeriesButton({ program: null, nowMs: 1_500, seriesTags: [] })
  assert.deepEqual([button.hidden, button.disabled, button.set], [false, true, false])
  assert.match(button.title, /no series to record/)
})

test('liveSeriesButton hides for a programme without a series link', () => {
  const button = liveSeriesButton({ program, nowMs: 1_500, seriesTags: [] })
  assert.equal(button.hidden, true)
})

test('liveSeriesButton waits for the series list before it offers a choice', () => {
  const button = liveSeriesButton({ program: episode, nowMs: 1_500, seriesTags: null })
  assert.deepEqual([button.hidden, button.disabled, button.set], [false, true, false])
  assert.match(button.title, /Checking TVHeadend/)
})

test('liveSeriesButton offers a series recording on this channel', () => {
  const button = liveSeriesButton({ program: episode, nowMs: 1_500, seriesTags: [] })
  assert.deepEqual([button.disabled, button.set], [false, false])
  assert.equal(button.ariaLabel, 'Record series: "Gruen"')
  assert.match(button.title, /on this channel/)
})

test('liveSeriesButton shows a set series for this channel or any channel', () => {
  for (const seriesLinkId of ['abc|gruen', '|gruen']) {
    const button = liveSeriesButton({ program: episode, nowMs: 1_500, seriesTags: [{ seriesLinkId }] })
    assert.deepEqual([button.disabled, button.set], [false, true])
    assert.equal(button.ariaLabel, 'Series recording set for "Gruen"')
  }
})

test('liveSeriesButton names the other channel when the series is set elsewhere', () => {
  const seriesTags = [{ seriesLinkId: 'xyz|gruen', channelId: 'xyz' }]
  const button = liveSeriesButton({ program: episode, nowMs: 1_500, seriesTags, channelName: names })
  assert.deepEqual([button.disabled, button.set], [false, false])
  assert.match(button.title, /on ABC TV Plus\. Press to add this channel\./)
})

test('otherSeriesChannelId ignores this channel, any channel, and other titles', () => {
  const seriesLink = 'abc|gruen'
  assert.equal(otherSeriesChannelId({ seriesTags: [{ seriesLinkId: 'abc|gruen' }], seriesLink }), null)
  assert.equal(otherSeriesChannelId({ seriesTags: [{ seriesLinkId: '|gruen' }], seriesLink }), null)
  assert.equal(otherSeriesChannelId({ seriesTags: [{ seriesLinkId: 'xyz|news' }], seriesLink }), null)
  assert.equal(otherSeriesChannelId({ seriesTags: [{ seriesLinkId: 'xyz|gruen' }], seriesLink }), 'xyz')
  assert.equal(otherSeriesChannelId({ seriesTags: [], seriesLink: 'nolink' }), null)
})
