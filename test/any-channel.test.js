import { test } from 'node:test'
import assert from 'node:assert/strict'

import { anyChannelLinkFor, isAnyChannelLink, findSeriesLink } from '../src/web/series-link.js'
import { adBreakAt } from '../src/web/playback.js'
import { seriesKey } from '../src/tvheadend.js'
import { projectUpcomingRecordings } from '../src/epg.js'
import { joinSeries } from '../src/series.js'

const NOW = 1_000_000_000_000
const HOUR = 3_600_000

test('anyChannelLinkFor: keeps the title and drops the channel', () => {
  assert.equal(anyChannelLinkFor('abc123|hard quiz'), '|hard quiz')
  assert.equal(anyChannelLinkFor('no-separator'), null)
  assert.equal(anyChannelLinkFor(null), null)
})

test('anyChannelLinkFor: matches the key of a TVHeadend autorec with no channel', () => {
  assert.equal(anyChannelLinkFor(seriesKey({ channelId: '7', title: 'Home and Away' })),
    seriesKey({ channelId: '', title: 'Home and Away' }))
})

test('isAnyChannelLink: true only for a key with an empty channel', () => {
  assert.equal(isAnyChannelLink('|hard quiz'), true)
  assert.equal(isAnyChannelLink('abc|hard quiz'), false)
})

test('findSeriesLink: prefers the exact key, then the any-channel key', () => {
  const links = new Set(['|hard quiz', 'abc|other'])
  assert.equal(findSeriesLink({ links, seriesLink: 'abc|other' }), 'abc|other')
  assert.equal(findSeriesLink({ links, seriesLink: 'xyz|hard quiz' }), '|hard quiz')
  assert.equal(findSeriesLink({ links, seriesLink: 'xyz|unknown' }), null)
  assert.equal(findSeriesLink({ links, seriesLink: null }), null)
})

test('projectUpcomingRecordings: an any-channel series projects airings from every channel', () => {
  const guide = {
    channels: [
      { id: 'ch7', epgId: 1, name: '7' },
      { id: 'ch7mate', epgId: 2, name: '7mate' },
    ],
    programsByChannel: {
      1: [{ program_id: 'a', series_link: 'ch7|home', title: 'Home', start: NOW + HOUR, end: NOW + 2 * HOUR, series_no: 1, episode_no: 1 }],
      2: [
        { program_id: 'b', series_link: 'ch7mate|home', title: 'Home', start: NOW + 3 * HOUR, end: NOW + 4 * HOUR, series_no: 1, episode_no: 2 },
        { program_id: 'c', series_link: 'ch7mate|home', title: 'Home', start: NOW + 5 * HOUR, end: NOW + 6 * HOUR, series_no: 1, episode_no: 1 },
      ],
    },
  }
  const seriesTags = [{ seriesLinkId: '|home', name: 'Home', channelId: '' }]
  const out = projectUpcomingRecordings({ seriesTags, futureRecordings: [], guide, nowMs: NOW })
  assert.deepEqual(out.map((r) => r.programId), ['a', 'b'])
})

test('joinSeries: flags an autorec with no channel as any channel', () => {
  const seriesTags = [
    { id: 'u1', seriesLinkId: '|home', name: 'Home', channelId: '', enabled: true, episodesToKeep: 0 },
  ]
  const { series } = joinSeries({ seriesTags, channels: [{ id: 'ch7', name: '7' }] })
  assert.equal(series[0].autorecs[0].anyChannel, true)
  assert.equal(series[0].autorecs[0].channelName, null)
})

test('joinSeries: a channel autorec is not any channel', () => {
  const seriesTags = [
    { id: 'u1', seriesLinkId: 'ch7|home', name: 'Home', channelId: 'ch7', enabled: true, episodesToKeep: 0 },
  ]
  const { series } = joinSeries({ seriesTags, channels: [{ id: 'ch7', name: '7' }] })
  assert.equal(series[0].autorecs[0].anyChannel, false)
  assert.equal(series[0].autorecs[0].channelName, '7')
})

const breaks = [{ start: 100, end: 190 }, { start: 600, end: 700 }]

test('adBreakAt: finds the break that contains the time', () => {
  assert.deepEqual(adBreakAt({ breaks, time: 150 }), breaks[0])
  assert.deepEqual(adBreakAt({ breaks, time: 650 }), breaks[1])
})

test('adBreakAt: returns null outside every break', () => {
  assert.equal(adBreakAt({ breaks, time: 50 }), null)
  assert.equal(adBreakAt({ breaks, time: 300 }), null)
  assert.equal(adBreakAt({ breaks, time: 800 }), null)
})

test('adBreakAt: shows the button slightly before the start', () => {
  assert.deepEqual(adBreakAt({ breaks, time: 99.6 }), breaks[0])
  assert.equal(adBreakAt({ breaks, time: 99 }), null)
})

test('adBreakAt: hides the button at the end so a skip does not retrigger it', () => {
  assert.equal(adBreakAt({ breaks, time: 190 }), null)
  assert.equal(adBreakAt({ breaks, time: 189.6 }), null)
  assert.deepEqual(adBreakAt({ breaks, time: 189 }), breaks[0])
})

test('adBreakAt: tolerates a missing break list', () => {
  assert.equal(adBreakAt({ breaks: undefined, time: 10 }), null)
  assert.equal(adBreakAt({ breaks: [], time: 10 }), null)
})
