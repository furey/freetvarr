import { test } from 'node:test'
import assert from 'node:assert/strict'

import { projectUpcomingRecordings, orderChannels } from '../src/epg.js'

const NOW = 1_000_000_000_000
const HOUR = 3_600_000

const guide = {
  channels: [
    { id: 'dvb-abc-hd', epgId: 101, name: 'ABC TV HD' },
    { id: 'dvb-abc-sd', epgId: 102, name: 'ABC TV' },
  ],
  programsByChannel: {
    101: [
      { program_id: 'p1', series_link: 'sl-backroads', title: 'Back Roads', start: NOW + HOUR, end: NOW + 2 * HOUR, episode_title: 'Augusta', series_no: 12, episode_no: 18 },
      { program_id: 'p2', series_link: 'sl-backroads', title: 'Back Roads', start: NOW + 24 * HOUR, end: NOW + 25 * HOUR, series_no: 12, episode_no: 19 },
      { program_id: 'p-past', series_link: 'sl-backroads', title: 'Back Roads', start: NOW - HOUR, end: NOW, series_no: 12, episode_no: 17 },
      { program_id: 'p-untagged', series_link: 'sl-other', title: 'Something Else', start: NOW + HOUR, end: NOW + 2 * HOUR },
    ],
    102: [
      { program_id: 'p-sd', series_link: 'sl-backroads', title: 'Back Roads', start: NOW + HOUR, end: NOW + 2 * HOUR, series_no: 12, episode_no: 18 },
    ],
  },
}

const seriesTags = [{ seriesLinkId: 'sl-backroads', name: 'Back Roads', channelId: 'dvb-abc-hd' }]

test('projectUpcomingRecordings: projects future episodes from a series tag on the tag channel only', () => {
  const out = projectUpcomingRecordings({ seriesTags, futureRecordings: [], guide, nowMs: NOW })
  const ids = out.map((r) => r.programId)
  assert.deepEqual(ids, ['p1', 'p2'])
  assert.equal(out[0].source, 'series')
  assert.equal(out[0].channelName, 'ABC TV HD')
  // The SD airing (p-sd) is on a different channel than the tag; not projected.
  assert.ok(!ids.includes('p-sd'))
  // A past airing and an untagged programme are excluded.
  assert.ok(!ids.includes('p-past'))
  assert.ok(!ids.includes('p-untagged'))
})

test('projectUpcomingRecordings: a real timer wins over its projection (dedupe by programId)', () => {
  const futureRecordings = [
    { programId: 'p1', name: 'Back Roads', channelId: 'dvb-abc-hd', startDate: NOW + HOUR, endDate: NOW + 2 * HOUR, seriesLinkId: 'sl-backroads', pendingDelete: false },
  ]
  const out = projectUpcomingRecordings({ seriesTags, futureRecordings, guide, nowMs: NOW })
  const p1 = out.filter((r) => r.programId === 'p1')
  assert.equal(p1.length, 1)
  assert.equal(p1[0].source, 'timer')
})

test('projectUpcomingRecordings: dedupes repeat airings of the same episode, keeping earliest', () => {
  const g = {
    channels: [{ id: 'c', epgId: 1, name: 'C' }],
    programsByChannel: {
      1: [
        { program_id: 'late', series_link: 'sl', title: 'Show', start: NOW + 5 * HOUR, end: NOW + 6 * HOUR, series_no: 2, episode_no: 3 },
        { program_id: 'early', series_link: 'sl', title: 'Show', start: NOW + HOUR, end: NOW + 2 * HOUR, series_no: 2, episode_no: 3 },
      ],
    },
  }
  const out = projectUpcomingRecordings({ seriesTags: [{ seriesLinkId: 'sl', channelId: 'c' }], futureRecordings: [], guide: g, nowMs: NOW })
  assert.equal(out.length, 1)
  assert.equal(out[0].programId, 'early')
})

test('projectUpcomingRecordings: episodes without numbers are not collapsed together', () => {
  const g = {
    channels: [{ id: 'c', epgId: 1, name: 'C' }],
    programsByChannel: {
      1: [
        { program_id: 'a', series_link: 'sl', title: 'News', start: NOW + HOUR, end: NOW + 2 * HOUR },
        { program_id: 'b', series_link: 'sl', title: 'News', start: NOW + 24 * HOUR, end: NOW + 25 * HOUR },
      ],
    },
  }
  const out = projectUpcomingRecordings({ seriesTags: [{ seriesLinkId: 'sl', channelId: 'c' }], futureRecordings: [], guide: g, nowMs: NOW })
  assert.deepEqual(out.map((r) => r.programId), ['a', 'b'])
})

test('projectUpcomingRecordings: no guide falls back to real timers only', () => {
  const futureRecordings = [
    { programId: 't1', name: 'One-off', channelId: 'c', startDate: NOW + HOUR, endDate: NOW + 2 * HOUR, pendingDelete: false },
    { programId: 't2', name: 'Deleted', channelId: 'c', startDate: NOW + HOUR, endDate: NOW + 2 * HOUR, pendingDelete: true },
  ]
  const out = projectUpcomingRecordings({ seriesTags, futureRecordings, guide: null, nowMs: NOW })
  assert.deepEqual(out.map((r) => r.programId), ['t1'])
  assert.equal(out[0].source, 'timer')
})

test('projectUpcomingRecordings: merged list is sorted by start time', () => {
  const futureRecordings = [
    { programId: 't-late', name: 'Late timer', channelId: 'dvb-abc-hd', startDate: NOW + 48 * HOUR, endDate: NOW + 49 * HOUR, pendingDelete: false },
  ]
  const out = projectUpcomingRecordings({ seriesTags, futureRecordings, guide, nowMs: NOW })
  const starts = out.map((r) => r.startDate)
  assert.deepEqual(starts, [...starts].sort((a, b) => a - b))
})

const { sdSimulcastIds } = await import('../src/epg.js')

test('sdSimulcastIds: pairs HD/SD by base name including AU aliases, leaves unpaired alone', () => {
  const ids = sdSimulcastIds([
    { id: 'abc-hd', name: 'ABC TV HD', hd: true },
    { id: 'abc-sd', name: 'ABC TV' },
    { id: 'ten-hd', name: '10 HD', hd: true },
    { id: 'ten-sd', name: '10' },
    { id: 'nine-hd', name: '9HD', hd: true },
    { id: 'nine-sd', name: 'Nine' },
    { id: 'entertains', name: 'ABC Entertains' },
    { id: 'sbs2-hd', name: 'SBS2 HD', hd: true },
  ])
  assert.deepEqual([...ids].sort(), ['abc-sd', 'nine-sd', 'ten-sd'])
})

test('orderChannels: hideSdSimulcasts hides SD twins but never pinned ones', () => {
  const channels = [
    { id: 'hd', name: '10 HD', hd: true },
    { id: 'sd', name: '10' },
    { id: 'pin-sd', name: 'Nine' },
    { id: 'pin-hd', name: '9HD', hd: true },
  ]
  const out = orderChannels({ channels, pinnedIds: ['pin-sd'], hideSdSimulcasts: true })
  const by = Object.fromEntries(out.map((c) => [c.id, c.hidden]))
  assert.equal(by['sd'], true)
  assert.equal(by['hd'], false)
  assert.equal(by['pin-sd'], false)
})
