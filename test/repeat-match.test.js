import { test } from 'node:test'
import assert from 'node:assert/strict'

import { dvrAiringMatchOf, dvrAiringsOf, isSameEpisode } from '../src/repeat-match.js'
import { planUpcomingRecordings } from '../src/epg.js'

const HOUR = 3_600_000
const NOW = Date.UTC(2026, 9, 22, 2, 0, 0)

const programme = (extra = {}) => ({
  program_id: 'p-new',
  title: '1 Euro House',
  episode_title: null,
  episode_uri: null,
  series_no: null,
  episode_no: null,
  start: NOW + 48 * HOUR,
  end: NOW + 49 * HOUR,
  series_link: 'nine|1 euro house',
  ...extra,
})

const entry = (extra = {}) => ({
  uuid: 'u1',
  programId: 'p-old',
  name: '1 Euro House',
  episodeTitle: null,
  episodeUri: null,
  season: null,
  episode: null,
  channelName: '9HD Sydney',
  startDate: NOW + 24 * HOUR,
  enabled: true,
  schedStatus: 'scheduled',
  autorecId: 'rule-1',
  ...extra,
})

const tag = { id: 'rule-1', seriesLinkId: 'nine|1 euro house', channelId: 'nine' }

test('isSameEpisode: the same episode id matches', () => {
  assert.equal(isSameEpisode({ programme: programme({ episode_uri: 'crid://nine/ONEU01_1_4' }), entry: entry({ episodeUri: 'crid://nine/ONEU01_1_4' }) }), true)
})

test('isSameEpisode: the same season and episode numbers match', () => {
  assert.equal(isSameEpisode({ programme: programme({ series_no: 16, episode_no: 9 }), entry: entry({ season: 16, episode: 9 }) }), true)
})

test('isSameEpisode: the same title and real subtitle match when numbers are missing', () => {
  const subtitle = 'Darren, What Have You Done?'
  assert.equal(isSameEpisode({ programme: programme({ episode_title: subtitle }), entry: entry({ episodeTitle: subtitle }) }), true)
})

test('isSameEpisode: no false matches', () => {
  const cases = [
    [programme({ episode_uri: 'crid://a' }), entry({ episodeUri: 'crid://b' })],
    [programme({ series_no: 16, episode_no: 9 }), entry({ season: 16, episode: 10 })],
    [programme({ series_no: 16, episode_no: 9, episode_title: 'Same' }), entry({ season: 16, episode: 10, episodeTitle: 'Same' })],
    [programme({ episode_title: 'Episode 46' }), entry({ episodeTitle: 'Episode 46' })],
    [programme({ episode_title: 'Episode 9 of Season 16' }), entry({ episodeTitle: 'Episode 9 of Season 16' })],
    [programme({ episode_title: 'Darren' }), entry({ episodeTitle: 'Shaynna' })],
    [programme({ episode_title: 'Darren' }), entry({ name: 'The Block', episodeTitle: 'Darren' })],
    [programme(), entry()],
  ]
  for (const [p, e] of cases) assert.equal(isSameEpisode({ programme: p, entry: e }), false, JSON.stringify([p, e]))
})

test('dvrAiringsOf: classifies upcoming, finished, and removed airings', () => {
  const airings = dvrAiringsOf({
    upcoming: [entry({ uuid: 'on' }), entry({ uuid: 'off', enabled: false }), entry({ uuid: 'now', schedStatus: 'recording' })],
    pastAirings: [
      entry({ uuid: 'done', schedStatus: 'completed' }),
      entry({ uuid: 'bad', failed: true }),
      entry({ uuid: 'gone-ok', removed: true, statusText: 'Completed OK' }),
      entry({ uuid: 'gone', removed: true, statusText: 'Time missed' }),
    ],
  })
  assert.deepEqual(airings.map(({ entry: e, status }) => [e.uuid, status]), [
    ['on', 'scheduled'], ['off', 'skipped'], ['now', 'recording'], ['done', 'recorded'], ['gone-ok', 'recorded'], ['gone', 'skipped'],
  ])
})

test('dvrAiringsOf: a removed airing counts as recorded when a finished copy exists', () => {
  const airings = dvrAiringsOf({
    pastAirings: [
      entry({ uuid: 'copy', season: 1, episode: 4 }),
      entry({ uuid: 'gone', removed: true, statusText: 'Aborted by user', season: 1, episode: 4 }),
    ],
  })
  assert.equal(airings.find(({ entry: e }) => e.uuid === 'gone').status, 'recorded')
})

test('dvrAiringMatchOf: prefers a scheduled airing and ignores other rules and the programme itself', () => {
  const subtitle = 'Darren, What Have You Done?'
  const p = programme({ episode_title: subtitle })
  const airings = dvrAiringsOf({
    upcoming: [
      entry({ uuid: 'self', programId: 'p-new', episodeTitle: subtitle }),
      entry({ uuid: 'other-rule', name: 'Other Show', autorecId: 'rule-2', episodeTitle: subtitle }),
      entry({ uuid: 'scheduled', episodeTitle: subtitle }),
    ],
    pastAirings: [entry({ uuid: 'old', episodeTitle: subtitle, startDate: NOW - 48 * HOUR })],
  })
  assert.deepEqual(dvrAiringMatchOf({ programme: p, tag, airings }), {
    status: 'scheduled', startDate: NOW + 24 * HOUR, channelName: '9HD Sydney',
  })
  assert.equal(dvrAiringMatchOf({ programme: programme({ episode_title: 'Unseen' }), tag, airings }), null)
})

test('planUpcomingRecordings: an expected episode TVHeadend already has becomes a repeat', () => {
  const guide = {
    channels: [{ id: 'nine', epgId: 9, name: '9HD Sydney' }],
    programsByChannel: {
      9: [
        programme({ program_id: 'p-dup', series_no: 16, episode_no: 9 }),
        programme({ program_id: 'p-new', series_no: 16, episode_no: 11, start: NOW + 72 * HOUR, end: NOW + 73 * HOUR }),
      ],
    },
  }
  const dvrAirings = dvrAiringsOf({
    pastAirings: [entry({ removed: true, statusText: 'Completed OK', season: 16, episode: 9, startDate: NOW - 48 * HOUR })],
  })
  const plan = planUpcomingRecordings({ seriesTags: [tag], dvrAirings, guide, nowMs: NOW })
  assert.deepEqual(plan.upcoming.map((e) => e.programId), ['p-new'])
  assert.deepEqual(plan.repeats.map((e) => [e.programId, e.repeatOf.status]), [['p-dup', 'recorded']])
})
