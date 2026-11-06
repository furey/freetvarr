import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scheduledIdsOf } from '../src/epg.js'
import { buildGuideSearch, createGuideSearchCache, searchGuideListings } from '../src/guide-search.js'

const HOUR = 60 * 60 * 1000
const NOW = 10 * HOUR

const airing = ({ title, start, episodeTitle = null }) => ({ title, episode_title: episodeTitle, start, end: start + HOUR })

const guideOf = (programsByChannel) => ({ programsByChannel })

const channels = [{ id: 'c1', epgId: 1, name: 'ABC TV' }, { id: 'c2', epgId: 2, name: '10' }]

const search = ({ guide, query, cap, aliases = {}, scheduledIds }) => searchGuideListings({
  built: buildGuideSearch({ guide, ...aliases }),
  channels,
  query,
  nowMs: NOW,
  cap,
  scheduledIds,
})

test('guide results rank by score before time, not by channel order', () => {
  const guide = guideOf({
    1: [airing({ title: 'Rainbow Ruby', start: NOW + HOUR })],
    2: [airing({ title: 'Bowls Australia', start: NOW + 5 * HOUR })],
  })
  assert.deepEqual(search({ guide, query: 'bow' }).map((r) => [r.title, r.reason, r.score]), [
    ['Bowls Australia', 'title', 100],
    ['Rainbow Ruby', 'contains', 90],
  ])
})

test('the cap applies after ranking', () => {
  const news = Array.from({ length: 20 }, (_, i) => airing({ title: 'Newsround', start: NOW + i * HOUR }))
  const guide = guideOf({ 1: news, 2: [airing({ title: 'The News Quiz', start: NOW + 30 * HOUR })] })
  const results = search({ guide, query: 'news', cap: 5 })
  assert.equal(results.length, 5)
  assert.ok(results.every((r) => r.score === 100))
  assert.deepEqual(results.map((r) => r.start), [0, 1, 2, 3, 4].map((i) => NOW + i * HOUR))
})

test('hidden channels and ended programmes stay out; channel names come with each result', () => {
  const guide = guideOf({
    1: [airing({ title: 'Gardening Australia', start: NOW - 2 * HOUR }), airing({ title: 'Gardening Australia', start: NOW + HOUR })],
    3: [airing({ title: 'Gardening Australia', start: NOW + 2 * HOUR })],
  })
  assert.deepEqual(search({ guide, query: 'garden' }).map((r) => [r.channelId, r.channelName, r.start]), [['c1', 'ABC TV', NOW + HOUR]])
})

test('episode titles match below show titles and hold back fuzzy guesses', () => {
  const guide = guideOf({
    1: [airing({ title: 'Landline', start: NOW + HOUR, episodeTitle: 'Gogglebox farmers' })],
    2: [airing({ title: 'Gogglebox Australia', start: NOW + 2 * HOUR })],
  })
  assert.deepEqual(search({ guide, query: 'gogglebox' }).map((r) => [r.title, r.reason]), [
    ['Gogglebox Australia', 'title'],
    ['Landline', 'episode'],
  ])
  assert.deepEqual(search({ guide, query: 'gogglbox' }).map((r) => [r.title, r.reason]), [['Gogglebox Australia', 'fuzzy']])
})

test('alias matches carry the matched name', () => {
  const guide = guideOf({ 1: [airing({ title: 'My Kitchen Rules', start: NOW + HOUR })] })
  const aliases = { curated: [{ title: 'My Kitchen Rules', aliases: ['MKR'] }] }
  const [result] = search({ guide, query: 'MKR', aliases })
  assert.deepEqual([result.title, result.reason, result.matchedName], ['My Kitchen Rules', 'alias', 'MKR'])
})

test('the cache rebuilds only when the guide or the aliases change', () => {
  let builds = 0
  const searchFor = createGuideSearchCache({ build: () => { builds += 1; return {} } })
  const guide = guideOf({})
  const aliases = { curated: [], aliases: [] }
  searchFor({ guide, aliases })
  searchFor({ guide, aliases })
  assert.equal(builds, 1)
  searchFor({ guide: guideOf({}), aliases })
  searchFor({ guide, aliases: { ...aliases } })
  assert.equal(builds, 3)
})

test('results sort by group, then score, then start: scheduled, series, For you, guide', () => {
  const guide = guideOf({
    1: [
      airing({ title: 'Big Guide', start: NOW + HOUR }),
      { ...airing({ title: 'Big Pick', start: NOW + 2 * HOUR }), program_id: 77 },
      { ...airing({ title: 'Big Series', start: NOW + 3 * HOUR }), series_link: 'c1|big' },
      { ...airing({ title: 'Bigger Booked', start: NOW + 4 * HOUR }), program_id: 88 },
    ],
  })
  const results = searchGuideListings({
    built: buildGuideSearch({ guide }),
    channels,
    query: 'big',
    nowMs: NOW,
    scheduledIds: new Set(['88']),
    seriesLinks: new Set(['c1|big']),
    forYouIds: new Set(['77']),
  })
  assert.deepEqual(results.map((r) => [r.title, r.group]), [
    ['Bigger Booked', 'scheduled'],
    ['Big Series', 'series'],
    ['Big Pick', 'for-you'],
    ['Big Guide', 'guide'],
  ])
})

test('inside one group, a higher score beats an earlier start', () => {
  const guide = guideOf({
    1: [
      { ...airing({ title: 'Rainbow Ruby', start: NOW + HOUR }), program_id: 1 },
      { ...airing({ title: 'Bowls Australia', start: NOW + 5 * HOUR }), program_id: 2 },
    ],
  })
  assert.deepEqual(search({ guide, query: 'bow', scheduledIds: new Set(['1', '2']) }).map((r) => [r.title, r.group]), [
    ['Bowls Australia', 'scheduled'],
    ['Rainbow Ruby', 'scheduled'],
  ])
})

test('a scheduled low score survives the cap ahead of better guide matches', () => {
  const guide = guideOf({
    1: [
      ...Array.from({ length: 5 }, (_, i) => airing({ title: 'Newsround', start: NOW + i * HOUR })),
      { ...airing({ title: 'The News Quiz', start: NOW + 30 * HOUR }), program_id: 9 },
    ],
  })
  assert.equal(search({ guide, query: 'news', cap: 2, scheduledIds: new Set(['9']) })[0].group, 'scheduled')
})

test('a leading "the" still searches alone, and a full-title hit outranks a hit on the rest', () => {
  const guide = guideOf({ 1: [airing({ title: 'Chase Me', start: NOW + HOUR }), airing({ title: 'The Chase', start: NOW + 2 * HOUR })] })
  assert.deepEqual(search({ guide, query: 'the chase' }).map((r) => r.title), ['The Chase', 'Chase Me'])
  assert.deepEqual(search({ guide, query: 'the cha' }).map((r) => r.title), ['The Chase', 'Chase Me'])
  assert.deepEqual(search({ guide, query: 'the' }).map((r) => r.title), ['The Chase'])
})

test('"the block" ranks The Block above Blockbusters even when Blockbusters airs first', () => {
  const guide = guideOf({ 1: [airing({ title: 'Blockbusters', start: NOW + HOUR }), airing({ title: 'The Block', start: NOW + 2 * HOUR })] })
  const results = search({ guide, query: 'the block' })
  assert.deepEqual(results.map((r) => [r.title, r.score]), [['The Block', 100], ['Blockbusters', 80]])
})

test('a title found only fuzzily by the full query still shows when the rest finds it directly', () => {
  const guide = guideOf({ 1: [airing({ title: 'Thea', start: NOW + HOUR })] })
  assert.deepEqual(search({ guide, query: 'the thea' }).map((r) => r.title), ['Thea'])
})

test('a recording made or cancelled after the guide loaded moves the airing between Scheduled and TV guide', () => {
  const guide = guideOf({ 1: [{ ...airing({ title: 'Big Brother', start: NOW + HOUR }), program_id: 5 }] })
  const groupWith = (scheduledIds) => search({ guide, query: 'big', scheduledIds })[0].group
  assert.equal(groupWith(new Set()), 'guide')
  assert.equal(groupWith(new Set(['5'])), 'scheduled')
  assert.equal(groupWith(new Set()), 'guide')
})

test('a stale dvr_uuid on the guide airing no longer makes it Scheduled', () => {
  const guide = guideOf({ 1: [{ ...airing({ title: 'Big Brother', start: NOW + HOUR }), program_id: 5, dvr_uuid: 'old' }] })
  assert.equal(search({ guide, query: 'big', scheduledIds: new Set() })[0].group, 'guide')
})

test('scheduledIdsOf: reads scheduled and running recordings from the live state, and an unavailable state gives none', () => {
  const state = { futureRecordings: [{ programId: 5 }, { programId: '6' }], activeRecordingIds: [7] }
  assert.deepEqual([...scheduledIdsOf(state)].sort(), ['5', '6', '7'])
  assert.equal(scheduledIdsOf(null).size, 0)
})
