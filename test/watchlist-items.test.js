import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  guideMatchesFor,
  inGuideCountOf,
  recordTargetOf,
  seenThroughFrom,
  seriesPaddingOf,
  watchKeyOf,
  watchlistItemOf,
  watchModeFrom,
  watchPaddingFrom,
  watchRowChangesFor,
  watchTitleFrom,
} from '../src/watchlist-items.js'

const NOW = 1_000_000
const channels = [
  { id: 'seven', epgId: 'seven', name: '7 Sydney' },
  { id: 'mate', epgId: 'mate', name: '7mate' },
]
const programme = (overrides) => ({
  program_id: 'p1', epg_program_id: 'p1', title: 'The Rookie', start: NOW + 60_000, end: NOW + 120_000,
  series_link: 'seven|the rookie', image: 'http://img', ...overrides,
})
const programsByChannel = {
  seven: [
    programme({ program_id: 'old', start: NOW - 120_000, end: NOW - 60_000 }),
    programme({ program_id: 'later', start: NOW + 600_000, end: NOW + 700_000 }),
    programme({ program_id: 'other', title: 'Home and Away' }),
  ],
  mate: [programme({ program_id: 'soon', title: 'THE ROOKIE', image: null, series_link: 'mate|the rookie' })],
}

test('watchKeyOf: matches titles whatever their case or punctuation', () => {
  assert.equal(watchKeyOf('The Rookie'), watchKeyOf('the rookie!'))
  assert.equal(watchKeyOf('Gruen (2008)'), 'gruen-2008')
})

test('guideMatchesFor: future programmes with the same title, soonest first, across channels', () => {
  const matches = guideMatchesFor({ titleKey: 'the-rookie', channels, programsByChannel, nowMs: NOW })
  assert.deepEqual(matches.map((m) => m.program_id), ['soon', 'later'])
  assert.equal(matches[0].channelName, '7mate')
  assert.equal(matches[0].has_image, false)
  assert.equal(matches[1].has_image, true)
  assert.equal('image' in matches[1], false)
})

test('guideMatchesFor: keeps one channel when the entry names one, and stops at the cap', () => {
  const onSeven = guideMatchesFor({ titleKey: 'the-rookie', channelId: 'seven', channels, programsByChannel, nowMs: NOW })
  assert.deepEqual(onSeven.map((m) => m.program_id), ['later'])
  const capped = guideMatchesFor({ titleKey: 'the-rookie', channels, programsByChannel, nowMs: NOW, cap: 1 })
  assert.equal(capped.length, 1)
})

test('guideMatchesFor: a programme on air now still matches', () => {
  const onAir = { seven: [programme({ start: NOW - 60_000, end: NOW + 60_000 })] }
  assert.equal(guideMatchesFor({ titleKey: 'the-rookie', channels, programsByChannel: onAir, nowMs: NOW }).length, 1)
})

test('watchlistItemOf: counts the matches after seen_through as unseen', () => {
  const matches = [{ start: 10 }, { start: 20 }, { start: 30 }]
  const row = { id: 3, title: 'The Rookie', title_key: 'the-rookie', mode: 'notify', channel_id: null, seen_through: 20 }
  const item = watchlistItemOf({ row, matches })
  assert.equal(item.unseen, 1)
  assert.equal(item.nextMatch, matches[0])
  assert.equal(item.key, 'the-rookie')
  assert.equal(watchlistItemOf({ row: { ...row, seen_through: null }, matches }).unseen, 3)
  assert.equal(watchlistItemOf({ row, matches: [] }).nextMatch, null)
})

test('recordTargetOf: only an unfulfilled record entry with a series match has a target', () => {
  const matches = [{ program_id: 'a', series_link: null }, { program_id: 'b', series_link: 'x|t' }]
  assert.equal(recordTargetOf({ row: { mode: 'record' }, matches }).program_id, 'b')
  assert.equal(recordTargetOf({ row: { mode: 'notify' }, matches }), null)
  assert.equal(recordTargetOf({ row: { mode: 'record', fulfilled_at: '2026-10-19' }, matches }), null)
  assert.equal(recordTargetOf({ row: { mode: 'record' }, matches: [] }), null)
})

test('inGuideCountOf: counts notify entries that have a match', () => {
  const items = [
    { mode: 'notify', matches: [{}] },
    { mode: 'notify', matches: [] },
    { mode: 'record', matches: [{}] },
    { mode: 'notify', matches: [{}], fulfilledAt: 'x' },
  ]
  assert.equal(inGuideCountOf(items), 1)
})

test('watchModeFrom, watchTitleFrom, seenThroughFrom: validate the request body', () => {
  assert.equal(watchModeFrom(undefined), 'notify')
  assert.equal(watchModeFrom('record'), 'record')
  assert.equal(watchModeFrom('loud'), null)
  assert.equal(watchModeFrom(undefined, null), null)
  assert.equal(watchTitleFrom('  The Rookie '), 'The Rookie')
  assert.equal(watchTitleFrom(''), null)
  assert.equal(watchTitleFrom(42), null)
  assert.equal(watchTitleFrom('x'.repeat(201)), null)
  assert.equal(seenThroughFrom(1234.4), 1234)
  assert.equal(seenThroughFrom(-1), null)
  assert.equal(seenThroughFrom('soon'), null)
  assert.equal(seenThroughFrom(null), null)
})

test('watchRowChangesFor: switching to notify clears a fulfilled record entry', () => {
  const existing = { mode: 'record', fulfilled_at: 'x', series_link_id: '|the rookie' }
  assert.deepEqual(watchRowChangesFor({ existing, mode: 'notify' }), { mode: 'notify', fulfilled_at: null, series_link_id: null })
  assert.deepEqual(watchRowChangesFor({ existing, mode: 'record' }), { mode: 'record' })
  assert.deepEqual(
    watchRowChangesFor({ existing: { mode: 'notify' }, mode: 'record', channelId: null }),
    { mode: 'record', channel_id: null, fulfilled_at: null },
  )
})

test('watchPaddingFrom: keeps whole minutes up to 240 for record and clears them for notify', () => {
  assert.deepEqual(watchPaddingFrom({ mode: 'record', leadTime: 2, lagTime: '10' }), { lead_time: 2, lag_time: 10 })
  assert.deepEqual(watchPaddingFrom({ mode: 'record' }), { lead_time: null, lag_time: null })
  assert.deepEqual(watchPaddingFrom({ mode: 'notify', leadTime: 5, lagTime: 5 }), { lead_time: null, lag_time: null })
  assert.ok(watchPaddingFrom({ mode: 'record', leadTime: -1 }).error)
  assert.ok(watchPaddingFrom({ mode: 'record', lagTime: 241 }).error)
  assert.ok(watchPaddingFrom({ mode: 'notify', lagTime: 'soon' }).error)
})

test('seriesPaddingOf: passes stored padding and leaves the defaults when none is stored', () => {
  assert.deepEqual(seriesPaddingOf({ lead_time: 0, lag_time: 30 }), { leadTime: 0, lagTime: 30 })
  assert.deepEqual(seriesPaddingOf({ lead_time: null, lag_time: undefined }), {})
})

test('watchTitleFrom: rejects titles with no letters or digits', () => {
  assert.equal(watchTitleFrom('??'), null)
  assert.equal(watchTitleFrom('Untitled'), 'Untitled')
  assert.equal(watchTitleFrom(' 60 Minutes '), '60 Minutes')
})

test('watchlistItemOf: carries the padding', () => {
  const item = watchlistItemOf({ row: { id: 1, title: 'Utopia', title_key: 'utopia', mode: 'record', lead_time: 5, lag_time: 15 } })
  assert.equal(item.leadTime, 5)
  assert.equal(item.lagTime, 15)
})
