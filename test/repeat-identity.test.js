import { test } from 'node:test'
import assert from 'node:assert/strict'

import { isSameEpisodeEntry } from '../src/repeat-match.js'
import { isRepeatToSkip, splitRepeats } from '../src/tvheadend.js'
import { withRecordedRepeatsSkipped } from '../src/epg.js'

const HOUR = 3_600_000
const AUCTION_TEXT = 'Auction day is finally here, find out who wins The Block in 2026.'

const blockAiring = (overrides) => ({
  name: 'The Block',
  episodeTitle: 'Auction',
  channelId: '8fc0fd728750dfe7402a0f914ea3b9eb',
  channelName: '9HD Sydney',
  schedStatus: 'scheduled',
  statusText: 'Scheduled for recording',
  autorecId: 'b543a42d08558d1f0d1cda71ecd74e20',
  duplicateOfStart: null,
  enabled: true,
  description: AUCTION_TEXT,
  ...overrides,
})

const sunday = blockAiring({
  uuid: 'f6e75395abecaedf1e48ec18901a196c',
  programId: 585873,
  episodeUri: 'crid://crid://nine.com.au/BLOC_22_50',
  startDate: 1793520000000,
  endDate: 1793526300000,
  season: 22,
  episode: 50,
})

const monday = blockAiring({
  uuid: '8079b9a2b348a05119051fa258a6ebdd',
  programId: 595597,
  episodeUri: 'crid://crid://nine.com.au/BLOC_22_50',
  startDate: 1793581200000,
  endDate: 1793587500000,
  season: null,
  episode: null,
})

const withoutIds = (entry) => ({ ...entry, episodeUri: null })
const finishedSunday = { ...sunday, schedStatus: 'completed', statusText: 'Completed OK' }

test('isSameEpisodeEntry: the two Auction airings share an episode id', () => {
  assert.equal(isSameEpisodeEntry({ entry: monday, other: sunday }), true)
})

test('isSameEpisodeEntry: without ids, the title, subtitle, and description still match when one side has no numbers', () => {
  assert.equal(isSameEpisodeEntry({ entry: withoutIds(monday), other: withoutIds(sunday) }), true)
})

test('isSameEpisodeEntry: a truncated description still matches', () => {
  const truncated = withoutIds({ ...monday, description: 'Auction day is finally here, find out who wins' })
  assert.equal(isSameEpisodeEntry({ entry: truncated, other: withoutIds(sunday) }), true)
})

test('isSameEpisodeEntry: no false matches', () => {
  const cases = [
    [withoutIds({ ...monday, description: 'Auction day is finally here, find out who wins The Block in 2025.' }), withoutIds(sunday)],
    [{ ...monday, episodeUri: 'crid://nine.com.au/BLOC_21_50' }, sunday],
    [withoutIds({ ...monday, season: 22, episode: 51 }), withoutIds(sunday)],
    [withoutIds({ ...monday, episodeTitle: 'Episode 3', description: null }), withoutIds({ ...sunday, episodeTitle: 'Episode 3', season: null, episode: null, description: null })],
    [withoutIds({ ...monday, episodeTitle: 'The Block' }), withoutIds({ ...sunday, episodeTitle: 'The Block' })],
    [withoutIds({ ...monday, episodeTitle: null }), withoutIds({ ...sunday, episodeTitle: null })],
    [{ ...monday, name: 'Nine News', episodeTitle: 'Sydney', episodeUri: 'crid://nine.com.au/NEWS_1' }, { ...sunday, name: 'Nine News', episodeTitle: 'Sydney', episodeUri: 'crid://nine.com.au/NEWS_2', season: null, episode: null }],
    [withoutIds({ ...monday, name: 'The Block Unlocked' }), withoutIds(sunday)],
  ]
  for (const [entry, other] of cases) {
    assert.equal(isSameEpisodeEntry({ entry, other }), false, JSON.stringify([entry, other]))
  }
})

test('splitRepeats: the Monday airing is a repeat of the scheduled Sunday airing', () => {
  const { recordings, repeats } = splitRepeats({ upcoming: [sunday, monday] })
  assert.deepEqual(recordings.map((e) => e.uuid), [sunday.uuid])
  assert.deepEqual(repeats.map((e) => e.uuid), [monday.uuid])
  assert.deepEqual(repeats[0].repeatOf, { status: 'scheduled', startDate: sunday.startDate, channelName: '9HD Sydney', uuid: sunday.uuid })
  assert.equal(isRepeatToSkip(repeats[0]), false)
})

test('splitRepeats: input order does not change which airing is the repeat', () => {
  const { repeats } = splitRepeats({ upcoming: [monday, sunday] })
  assert.deepEqual(repeats.map((e) => e.uuid), [monday.uuid])
})

test('splitRepeats: the repeat is due a skip once the Sunday airing has recorded', () => {
  const { recordings, repeats } = splitRepeats({ upcoming: [monday], pastAirings: [finishedSunday] })
  assert.deepEqual(recordings, [])
  assert.equal(repeats[0].repeatOf.status, 'recorded')
  assert.equal(isRepeatToSkip(repeats[0]), true)
})

test('splitRepeats: a failed Sunday airing leaves the Monday airing to record', () => {
  const { recordings, repeats } = splitRepeats({ upcoming: [monday], pastAirings: [{ ...finishedSunday, failed: true }] })
  assert.deepEqual(recordings.map((e) => e.uuid), [monday.uuid])
  assert.deepEqual(repeats, [])
})

test('splitRepeats: a skipped Sunday airing leaves the Monday airing to record', () => {
  const { recordings, repeats } = splitRepeats({ upcoming: [{ ...sunday, enabled: false }, monday] })
  assert.deepEqual(recordings.map((e) => e.uuid), [monday.uuid])
  assert.deepEqual(repeats, [])
})

test('splitRepeats: a skipped Monday airing stays a repeat only after the Sunday airing recorded', () => {
  const skippedMonday = { ...monday, enabled: false }
  assert.deepEqual(splitRepeats({ upcoming: [sunday, skippedMonday] }).repeats, [])
  const { repeats } = splitRepeats({ upcoming: [skippedMonday], pastAirings: [finishedSunday] })
  assert.deepEqual(repeats.map((e) => e.uuid), [monday.uuid])
  assert.equal(isRepeatToSkip(repeats[0]), false)
})

test('splitRepeats: airings that start together are never repeats of each other', () => {
  const twin = { ...monday, uuid: 'twin', programId: 1, channelName: '9 Sydney', startDate: sunday.startDate }
  const { repeats } = splitRepeats({ upcoming: [sunday, twin] })
  assert.deepEqual(repeats, [])
})

test('splitRepeats: a different show with the same subtitle is not a repeat', () => {
  const other = withoutIds({ ...monday, name: 'House Rules', autorecId: 'other-rule' })
  const { repeats } = splitRepeats({ upcoming: [withoutIds(sunday), other] })
  assert.deepEqual(repeats, [])
})

test('withRecordedRepeatsSkipped: skips only repeats whose original recorded, then reloads', async () => {
  const due = { ...monday, repeatOf: { status: 'recorded', startDate: sunday.startDate, uuid: sunday.uuid } }
  const waiting = { ...monday, uuid: 'waiting', repeatOf: { status: 'scheduled', startDate: sunday.startDate } }
  const tvheadendDuplicate = { ...due, uuid: 'tvh-dup', duplicateOfStart: sunday.startDate }
  const skipped = []
  const reloaded = { repeatRecordings: [], reloaded: true }
  const state = await withRecordedRepeatsSkipped({
    state: { repeatRecordings: [due, waiting, tvheadendDuplicate] },
    skipEntry: async ({ uuid }) => { skipped.push(uuid) },
    reloadState: async () => reloaded,
  })
  assert.deepEqual(skipped, [monday.uuid])
  assert.equal(state, reloaded)
})

test('withRecordedRepeatsSkipped: a failed skip keeps the state and retries next load', async () => {
  const due = { ...monday, repeatOf: { status: 'recorded', startDate: sunday.startDate - 24 * HOUR } }
  const original = { repeatRecordings: [due] }
  const state = await withRecordedRepeatsSkipped({
    state: original,
    skipEntry: async () => { throw new Error('offline') },
    reloadState: async () => assert.fail('no reload after a failed skip'),
  })
  assert.equal(state, original)
})
