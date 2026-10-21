import { test } from 'node:test'
import assert from 'node:assert/strict'

import { channelAiringAt, guideIdentityFor, programmeSheetAt } from '../src/epg.js'
import { autorecMatchFieldsOf } from '../src/autorec-match.js'

const NOW = 1_000_000_000_000
const HOUR = 3_600_000

const programme = ({ id, start, end, ...rest }) => ({
  program_id: id,
  title: `Programme ${id}`,
  episode_title: null,
  synopsis: `About ${id}`,
  start,
  end,
  series_no: 2,
  episode_no: 5,
  genre: 0x20,
  rating: 'PG',
  image: `http://tvheadend.lan/imagecache/${id}`,
  ...rest,
})

const guide = {
  channels: [
    { id: 'ch-abc', epgId: 101, name: 'ABC TV HD' },
    { id: 'ch-gap', epgId: 102, name: 'Gap TV' },
    { id: 'ch-empty', epgId: 103, name: 'Empty TV' },
  ],
  programsByChannel: {
    101: [
      programme({ id: 'later', start: NOW + 2 * HOUR, end: NOW + 3 * HOUR }),
      programme({ id: 'next', start: NOW + HOUR, end: NOW + 2 * HOUR, image: null }),
      programme({ id: 'now', start: NOW - HOUR, end: NOW + HOUR }),
      programme({ id: 'before', start: NOW - 2 * HOUR, end: NOW - HOUR }),
    ],
    102: [
      programme({ id: 'after-gap', start: NOW + HOUR, end: NOW + 2 * HOUR }),
    ],
    103: [],
  },
}

test('channelAiringAt: returns the full programme on now and the one after it', () => {
  const { now, next } = channelAiringAt({ guide, channelId: 'ch-abc', atMs: NOW })
  assert.equal(now.program_id, 'now')
  assert.equal(now.synopsis, 'About now')
  assert.equal(now.genre, 0x20)
  assert.equal(now.rating, 'PG')
  assert.equal(now.series_no, 2)
  assert.equal(next.program_id, 'next')
})

test('channelAiringAt: replaces image URLs with has_image', () => {
  const { now, next } = channelAiringAt({ guide, channelId: 'ch-abc', atMs: NOW })
  assert.equal('image' in now, false)
  assert.equal(now.has_image, true)
  assert.equal(next.has_image, false)
})

test('channelAiringAt: looks up a past time for a rewound viewer', () => {
  const { now, next } = channelAiringAt({ guide, channelId: 'ch-abc', atMs: NOW - HOUR - 1 })
  assert.equal(now.program_id, 'before')
  assert.equal(next.program_id, 'now')
})

test('channelAiringAt: a programme ending at the given time is not on now', () => {
  const { now } = channelAiringAt({ guide, channelId: 'ch-abc', atMs: NOW + HOUR })
  assert.equal(now.program_id, 'next')
})

test('channelAiringAt: in a gap, next is the first programme after the given time', () => {
  const { now, next } = channelAiringAt({ guide, channelId: 'ch-gap', atMs: NOW })
  assert.equal(now, null)
  assert.equal(next.program_id, 'after-gap')
})

test('channelAiringAt: an empty or unknown channel returns nulls', () => {
  assert.deepEqual(channelAiringAt({ guide, channelId: 'ch-empty', atMs: NOW }), { now: null, next: null })
  assert.deepEqual(channelAiringAt({ guide, channelId: 'ch-missing', atMs: NOW }), { now: null, next: null })
})

test('channelAiringAt: fills an ended programme from the saved guide history', () => {
  const endedByChannel = new Map([
    ['102', [programme({ id: 'saved', start: NOW - HOUR, end: NOW + HOUR / 2 })]],
  ])
  const { now, next } = channelAiringAt({ guide, channelId: 'ch-gap', atMs: NOW, endedByChannel })
  assert.equal(now.program_id, 'saved')
  assert.equal(now.has_image, true)
  assert.equal(next.program_id, 'after-gap')
})

test('channelAiringAt: the live guide wins over an overlapping saved programme', () => {
  const endedByChannel = new Map([
    ['101', [programme({ id: 'stale', start: NOW - HOUR, end: NOW + HOUR })]],
  ])
  const { now } = channelAiringAt({ guide, channelId: 'ch-abc', atMs: NOW, endedByChannel })
  assert.equal(now.program_id, 'now')
})

test('channelAiringAt: matches a numeric channel id to its string form', () => {
  const numericGuide = { channels: [{ id: 7, epgId: 101 }], programsByChannel: guide.programsByChannel }
  assert.equal(channelAiringAt({ guide: numericGuide, channelId: '7', atMs: NOW }).now.program_id, 'now')
})

const sheetGuide = {
  channels: [
    { id: 'sd', epgId: 1, name: '7 Sydney' },
    { id: 'hd', epgId: 2, name: '7HD Sydney' },
    { id: 'other', epgId: 3, name: 'ABC TV HD' },
  ],
  programsByChannel: {
    1: [programme({ id: 'sd-show', start: NOW, end: NOW + HOUR, title: 'The Chase', series_link: 'crid://chase' })],
    2: [
      programme({ id: 'hd-show', start: NOW + 60_000, end: NOW + HOUR, title: 'The Chase' }),
      programme({ id: 'hd-later', start: NOW + HOUR, end: NOW + 2 * HOUR, title: 'The Chase' }),
    ],
    3: [programme({ id: 'abc', start: NOW, end: NOW + HOUR, title: 'News' })],
  },
}

test('programmeSheetAt: the listed programme, its channel, and the HD twin for one airing', () => {
  const sheet = programmeSheetAt({ guide: sheetGuide, channelId: 'sd', startMs: NOW, nowMs: NOW - HOUR })
  assert.equal(sheet.channel.name, '7 Sydney')
  assert.equal(sheet.programme.program_id, 'sd-show')
  assert.equal(sheet.programme.synopsis, 'About sd-show')
  assert.equal(sheet.programme.has_image, true)
  assert.equal(sheet.programme.past, false)
  assert.equal(sheet.hdEpisode.channel.id, 'hd')
  assert.equal(sheet.hdEpisode.program.program_id, 'hd-show')
  assert.equal(sheet.hdSeries, null)
})

test('programmeSheetAt: finds the airing at a time inside it, and nothing for an unknown channel', () => {
  assert.equal(programmeSheetAt({ guide: sheetGuide, channelId: 'hd', startMs: NOW + HOUR + 60_000, nowMs: NOW }).programme.program_id, 'hd-later')
  assert.equal(programmeSheetAt({ guide: sheetGuide, channelId: 'hd', startMs: NOW + HOUR + 60_000, nowMs: NOW }).hdEpisode, null)
  assert.deepEqual(programmeSheetAt({ guide: sheetGuide, channelId: 'gone', startMs: NOW }), { channel: null, programme: null, hdEpisode: null, hdSeries: null })
})

test('programmeSheetAt: names the twin airing and a rule that matches it', () => {
  const twinContext = {
    identity: guideIdentityFor({ guide: sheetGuide, prefs: {} }),
    autorecs: [{ seriesLinkId: 'hd|the chase', channelId: 'hd', enabled: true, match: autorecMatchFieldsOf({ title: 'chase' }) }],
  }
  const sheet = programmeSheetAt({ guide: sheetGuide, channelId: 'sd', startMs: NOW, nowMs: NOW - HOUR, twinContext })
  assert.deepEqual(sheet.programme.twins.map((twin) => [twin.program_id, twin.channel_name]), [['hd-show', '7HD Sydney']])
  assert.equal(sheet.programme.rule_link, 'hd|the chase')
  const other = programmeSheetAt({ guide: sheetGuide, channelId: 'other', startMs: NOW, nowMs: NOW - HOUR, twinContext })
  assert.equal(other.programme.twins, undefined)
  assert.equal(other.programme.rule_link, undefined)
})
