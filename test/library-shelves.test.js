import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  failedRecordingsOf,
  failureBannerOf,
  movieMetaOf,
  oneOffMetaOf,
  posterMetaOf,
  shelvesOf,
  showsCountText,
} from '../src/web/library-shelves.js'
import {
  canStep,
  channelChipsOf,
  episodeActionsOf,
  episodeHeading,
  episodeMetaOf,
  guideMatchesFor,
  heroMetaOf,
  keepLabel,
  playButtonLabel,
  recordingRowOf,
  ruleStatusOf,
  seasonLabel,
  stepOption,
  LEAD_OPTIONS,
} from '../src/web/show-page.js'

const TZ = 'Australia/Sydney'
const TUE_830PM = Date.parse('2026-10-20T09:30:00Z')
const SUN_18_OCT = Date.parse('2026-10-18T09:30:00Z')

const show = (overrides) => ({
  key: 'the-block',
  title: 'The Block',
  kind: 'show',
  counts: { total: 6, new: 2, unwatched: 3, failed: 0 },
  latestAt: 100,
  nextAiring: null,
  rule: null,
  latest: null,
  ...overrides,
})

test('shelvesOf: splits by kind, sorts recent or A–Z, and filters unwatched', () => {
  const shows = [
    show({ key: 'a', title: 'The Zoo', latestAt: 300 }),
    show({ key: 'b', title: 'Apple', latestAt: 100, counts: { total: 2, new: 0, unwatched: 0, failed: 0 } }),
    show({ key: 'c', title: 'Heat', kind: 'movie', latestAt: 200 }),
    show({ key: 'd', title: 'Cup', kind: 'oneoff', latestAt: 50 }),
  ]
  assert.deepEqual(shelvesOf({ shows }).shows.map((s) => s.key), ['a', 'b'])
  assert.deepEqual(shelvesOf({ shows, sort: 'az' }).shows.map((s) => s.key), ['b', 'a'])
  assert.deepEqual(shelvesOf({ shows, unwatchedOnly: true }).shows.map((s) => s.key), ['a'])
  assert.deepEqual(shelvesOf({ shows }).movies.map((s) => s.key), ['c'])
  assert.deepEqual(shelvesOf({ shows }).oneoffs.map((s) => s.key), ['d'])
})

test('posterMetaOf: counts episodes and new ones, or names the first airing', () => {
  assert.equal(posterMetaOf({ show: show(), timeZone: TZ }), '6 episodes · 2 new')
  assert.equal(posterMetaOf({ show: show({ counts: { total: 1, new: 0 } }), timeZone: TZ }), '1 episode')
  assert.equal(
    posterMetaOf({ show: show({ counts: { total: 0, new: 0 }, nextAiring: { startDate: TUE_830PM } }), timeZone: TZ }),
    'First episode Tue 8:30pm',
  )
})

test('movie and one-off meta use the channel with the length or the day', () => {
  const latest = { channelName: 'SBS', durationS: 7440, airedAt: SUN_18_OCT }
  assert.equal(movieMetaOf({ show: show({ latest }) }), 'SBS · 2 hrs 4 mins')
  assert.equal(oneOffMetaOf({ show: show({ latest }), timeZone: TZ }), 'SBS · 18 Oct')
  assert.equal(showsCountText([show(), show({ counts: { total: 0 } })]), '2 shows · 6 episodes')
})

test('failure banner: counts recent failures and journeys, newest journey first', () => {
  const nowMs = SUN_18_OCT + 60_000
  const failed = failedRecordingsOf({
    rows: [
      { recording_id: 'r1', title: 'Chefs Ahoy', aired_at: SUN_18_OCT, error: 'weak signal' },
      { recording_id: 'old', title: 'Old', aired_at: SUN_18_OCT - 30 * 86_400_000 },
    ],
    journeys: [{ uuid: 'r1', failed: true }, { uuid: 'ok', failed: false }],
    nowMs,
  })
  assert.deepEqual(failed.map((f) => f.recording_id), ['r1'])
  assert.deepEqual(failureBannerOf({ failed, timeZone: TZ, reasonOf: (e) => e }), {
    headline: '1 recording failed',
    detail: 'Chefs Ahoy, Sun 8:30pm · weak signal',
  })
  assert.equal(failureBannerOf({ failed: [], timeZone: TZ }), null)
})

const episode = (overrides) => ({
  recordingId: 'e45',
  title: 'The Block',
  episodeTitle: 'Backyard Reveal',
  season: 22,
  episode: 45,
  airedAt: SUN_18_OCT,
  durationS: 5100,
  status: 'done',
  libraryState: null,
  deletedFromTvhAt: null,
  failed: false,
  watched: false,
  positionS: null,
  ...overrides,
})

test('episode lines: heading, meta with time left or watched', () => {
  assert.equal(episodeHeading(episode()), 'E45 · Backyard Reveal')
  assert.equal(episodeHeading(episode({ episode: null, episodeTitle: null })), 'The Block')
  assert.equal(episodeMetaOf({ episode: episode({ positionS: 3420 }), timeZone: TZ }), 'Sun 18 Oct · 1 hr 25 mins · 28 mins left')
  assert.equal(episodeMetaOf({ episode: episode({ watched: true }), timeZone: TZ }), 'Sun 18 Oct · 1 hr 25 mins · Watched')
  assert.equal(seasonLabel(null), 'Other')
  assert.equal(seasonLabel(22), 'Season 22')
})

test('episodeActionsOf: offers the same delete and import actions as the recording log', () => {
  const keys = (e) => episodeActionsOf(e).map((a) => a.key)
  assert.deepEqual(keys(episode()), ['watched', 'remove-from-tvh'])
  assert.deepEqual(keys(episode({ watched: true, deletedFromTvhAt: '2026-10-01' })), ['unwatched', 'clear'])
  assert.deepEqual(keys(episode({ status: 'not_imported' })), ['watched', 'import', 'clear'])
  assert.equal(episodeActionsOf(episode({ libraryState: 'not_in_library' }))[1].label, 'Import again')
  assert.deepEqual(keys(episode({ status: 'partial' })), ['watched'])
})

test('episodeActionsOf: failed and skipped episodes offer Retry', () => {
  const retry = (e) => episodeActionsOf(e).find((a) => a.key === 'import')
  assert.equal(retry(episode({ status: 'failed' })).label, 'Retry')
  assert.equal(retry(episode({ status: 'skipped' })).label, 'Retry')
  assert.equal(retry(episode({ status: 'failed', deletedFromTvhAt: '2026-10-01' })), undefined)
})

test('show page lines: hero meta, play label and rule status', () => {
  const detail = show({
    rule: { paused: false, channels: ['9HD'], anyChannel: false, summary: 'Records every new episode on 9HD' },
    nextAiring: { startDate: TUE_830PM, channelName: '9HD' },
    seasons: [{ season: 22, episodes: [episode(), episode({ recordingId: 'e44', episode: 44 })] }],
    resumeNext: { recordingId: 'e45', positionS: 600 },
  })
  assert.equal(heroMetaOf({ show: detail }), '9HD · Season 22 · 2 episodes recorded')
  assert.equal(playButtonLabel({ show: detail }), 'Resume E45')
  assert.equal(playButtonLabel({ show: { ...detail, resumeNext: { recordingId: 'e44', positionS: 0 } } }), 'Play E44')
  assert.equal(playButtonLabel({ show: { ...detail, resumeNext: null } }), '')
  assert.deepEqual(ruleStatusOf({ show: detail, timeZone: TZ }), {
    tone: 'scheduled',
    headline: 'Next: Tue 8:30pm on 9HD',
    detail: 'Records every new episode on 9HD',
  })
  assert.equal(ruleStatusOf({ show: detail, activeRecording: { episode: 46 }, timeZone: TZ }).headline, 'Recording now · Episode 46')
  assert.equal(ruleStatusOf({ show: { ...detail, seasons: [] }, timeZone: TZ }).headline, 'First episode records Tue 8:30pm')
  assert.equal(ruleStatusOf({ show: { ...detail, rule: null }, timeZone: TZ }).tone, 'idle')
})

test('steppers walk the option lists and stop at the ends', () => {
  assert.equal(stepOption({ options: LEAD_OPTIONS, value: 2, direction: 1 }), 3)
  assert.equal(stepOption({ options: LEAD_OPTIONS, value: 4, direction: -1 }), 3)
  assert.equal(stepOption({ options: LEAD_OPTIONS, value: 15, direction: 1 }), 15)
  assert.equal(canStep({ options: LEAD_OPTIONS, value: 0, direction: -1 }), false)
  assert.equal(keepLabel(0), 'All')
  assert.equal(keepLabel(10), '10')
})

test('channelChipsOf: rule channels first, guide channels to add, then Any channel', () => {
  const autorecs = [{ id: 'a1', channelId: 'nine', channelName: '9HD', anyChannel: false, seriesLinkId: 'nine|the block' }]
  const guideMatches = guideMatchesFor({
    key: 'the-block',
    results: [
      { title: 'The Block', channelId: 'gem', channelName: '9Gem', program_id: 2 },
      { title: 'The Block', channelId: 'nine', channelName: '9HD', program_id: 1 },
      { title: 'Blocked', channelId: 'seven', channelName: '7', program_id: 3 },
    ],
  })
  const chips = channelChipsOf({ autorecs, guideMatches })
  assert.deepEqual(chips.map((c) => [c.label, c.on]), [['9HD', true], ['9Gem', false], ['Any channel', false]])
  assert.equal(chips[0].match.program_id, 1)
  const anyChips = channelChipsOf({ autorecs: [{ id: 'a2', channelId: '', anyChannel: true }], guideMatches })
  assert.deepEqual(anyChips.map((c) => [c.label, c.on]), [['9Gem', false], ['9HD', false], ['Any channel', true]])
})

test('recordingRowOf: gives the player and confirm copy the row fields they read', () => {
  const row = recordingRowOf(episode({ image: '/api/recordings/e45/image', filePath: '/media/a.ts', positionS: 10 }))
  assert.equal(row.recording_id, 'e45')
  assert.equal(row.playback_position_s, 10)
  assert.equal(row.image_path, 'saved')
  assert.equal(row.library_file_present, true)
  assert.equal(row.file_path, '/media/a.ts')
})

test('posterMetaOf: a paused rule with no episodes says so', () => {
  assert.equal(posterMetaOf({ show: show({ counts: { total: 0, new: 0 }, rule: { paused: true } }), timeZone: TZ }), 'Paused')
  assert.equal(posterMetaOf({ show: show({ counts: { total: 0, new: 0 }, rule: { paused: false } }), timeZone: TZ }), 'Not in the guide yet')
})
