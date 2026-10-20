import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildGuideSearch, createGuideSearchCache, searchGuideListings } from '../src/guide-search.js'

const HOUR = 60 * 60 * 1000
const NOW = 10 * HOUR

const airing = ({ title, start, episodeTitle = null }) => ({ title, episode_title: episodeTitle, start, end: start + HOUR })

const guideOf = (programsByChannel) => ({ programsByChannel })

const channels = [{ id: 'c1', epgId: 1, name: 'ABC TV' }, { id: 'c2', epgId: 2, name: '10' }]

const search = ({ guide, query, cap, aliases = {} }) => searchGuideListings({
  built: buildGuideSearch({ guide, ...aliases }),
  channels,
  query,
  nowMs: NOW,
  cap,
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
