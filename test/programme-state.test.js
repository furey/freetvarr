import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  channelHintOf,
  guideChannelOf,
  guideDayOffsetOf,
  isSeriesScheduledOf,
  listedProgrammeOf,
  programmeOfUpcoming,
  programmeStateOf,
  recordingStateTextOf,
  scheduledByProgramIdOf,
  seriesLinkSetOf,
} from '../src/web/programme-state.js'

const timeZone = 'Australia/Sydney'
const nowMs = Date.parse('2026-10-20T10:00:00+11:00')

const lookups = ({ future = [], active = [], tags = [] } = {}) => ({
  scheduledByProgramId: scheduledByProgramIdOf(future),
  activeRecordingSet: new Set(active),
  seriesLinks: seriesLinkSetOf(tags),
})

test('scheduledByProgramIdOf and seriesLinkSetOf: key by string ids and skip blanks', () => {
  const map = scheduledByProgramIdOf([{ programId: 7 }, { programId: null }, null])
  assert.deepEqual([...map.keys()], ['7'])
  assert.deepEqual([...seriesLinkSetOf([{ seriesLinkId: 'a' }, { id: 3 }, {}])], ['a', '3'])
})

test('programmeStateOf: recording, scheduled, series, recorded, or nothing', () => {
  const both = lookups({ future: [{ programId: '1' }, { programId: '2' }], active: ['1'], tags: [{ seriesLinkId: 'crid://x' }] })
  assert.equal(programmeStateOf({ programme: { program_id: 1 }, ...both }), 'recording')
  assert.equal(programmeStateOf({ programme: { programId: 2 }, ...both }), 'scheduled')
  assert.equal(programmeStateOf({ programme: { program_id: 3, series_link: 'crid://x' }, ...both }), 'series')
  assert.equal(programmeStateOf({ programme: { program_id: 4 }, ...both }), '')
  assert.equal(programmeStateOf({ programme: { program_id: 1, past: true, recorded: true }, ...both }), 'recorded')
  assert.equal(programmeStateOf({ programme: { program_id: 1, past: true }, ...both }), '')
})

test('isSeriesScheduledOf: only when the scheduled recording belongs to a known series', () => {
  const known = lookups({ future: [{ programId: '1', seriesLinkId: 's' }, { programId: '2', seriesLinkId: 'gone' }], tags: [{ seriesLinkId: 's' }] })
  assert.equal(isSeriesScheduledOf({ programme: { program_id: 1 }, ...known }), true)
  assert.equal(isSeriesScheduledOf({ programme: { program_id: 2 }, ...known }), false)
  assert.equal(isSeriesScheduledOf({ programme: { program_id: 9 }, ...known }), false)
})

test('recordingStateTextOf: words for each state, and On watchlist only before it airs', () => {
  assert.equal(recordingStateTextOf({ state: 'recording' }), 'Recording now')
  assert.equal(recordingStateTextOf({ state: 'scheduled', seriesScheduled: true }), 'Series recording scheduled')
  assert.equal(recordingStateTextOf({ state: 'scheduled' }), 'One-off recording scheduled')
  assert.equal(recordingStateTextOf({ state: 'series' }), 'Series recording set')
  assert.equal(recordingStateTextOf({ state: 'recorded' }), 'Recorded')
  assert.equal(recordingStateTextOf({ state: '', watched: true }), 'On watchlist')
  assert.equal(recordingStateTextOf({ state: '', watched: true, past: true }), '')
})

test('programmeOfUpcoming: a scheduled recording as a guide programme', () => {
  const programme = programmeOfUpcoming({
    upcoming: { programId: 5, name: 'The Block', description: 'Renovations.', startDate: '1000', endDate: 2000, seriesLinkId: 'crid://b', hasImage: 1, channelId: 'c1' },
    msOf: Number,
  })
  assert.deepEqual(programme, {
    program_id: 5, epg_program_id: null, title: 'The Block', episode_title: null, synopsis: 'Renovations.', start: 1000, end: 2000,
    series_link: 'crid://b', series_no: null, episode_no: null, has_image: true, channelId: 'c1',
  })
})

test('guideDayOffsetOf: local guide day of the start, clamped to the seven guide days', () => {
  assert.equal(guideDayOffsetOf({ startMs: nowMs + 3_600_000, nowMs, timeZone }), 0)
  assert.equal(guideDayOffsetOf({ startMs: Date.parse('2026-10-21T00:30:00+11:00'), nowMs, timeZone }), 1)
  assert.equal(guideDayOffsetOf({ startMs: Date.parse('2026-10-19T23:30:00+11:00'), nowMs, timeZone }), 0)
  assert.equal(guideDayOffsetOf({ startMs: nowMs + 20 * 86_400_000, nowMs, timeZone }), 6)
  assert.equal(guideDayOffsetOf({ startMs: undefined, nowMs, timeZone }), 0)
})

test('guideChannelOf and listedProgrammeOf: find the channel and the listed airing by start time', () => {
  const guideDay = {
    channels: [{ id: 1, name: 'ABC' }],
    programs: { 1: [{ start: 100, title: 'News', synopsis: 'Full' }] },
  }
  assert.equal(guideChannelOf({ guideDay, channelId: '1' }).name, 'ABC')
  assert.equal(guideChannelOf({ guideDay, channelId: 2 }), null)
  assert.equal(listedProgrammeOf({ guideDay, channelId: 1, programme: { start: 100 } }).synopsis, 'Full')
  assert.equal(listedProgrammeOf({ guideDay, channelId: 1, programme: { start: 200 } }), null)
  assert.equal(listedProgrammeOf({ guideDay: null, channelId: 1, programme: { start: 100 } }), null)
})

test('channelHintOf: a channel name and logo flag from whatever channel the caller has', () => {
  assert.deepEqual(channelHintOf({ channel: { name: '9HD Sydney', hasLogo: true } }), { name: '9HD Sydney', hasLogo: true })
  assert.deepEqual(channelHintOf({ channel: { name: 'ABC', logos: ['a'] } }), { name: 'ABC', hasLogo: true })
  assert.deepEqual(channelHintOf({ channel: { id: 'c1' }, programme: { channelName: '7 Sydney' } }), { name: '7 Sydney', hasLogo: false })
  assert.deepEqual(channelHintOf({}), { name: '', hasLogo: false })
})

test('programmeStateOf: a skipped repeat reads as a repeat, not a series airing', () => {
  const programme = { program_id: 'encore', series_link: 'sl', past: false }
  const state = programmeStateOf({
    programme,
    scheduledByProgramId: new Map(),
    activeRecordingSet: new Set(),
    seriesLinks: new Set(['sl']),
    repeatByProgramId: new Map([['encore', { programId: 'encore' }]]),
  })
  assert.equal(state, 'repeat')
  assert.equal(recordingStateTextOf({ state }), 'Repeat, skipped')
})
