import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  failedRecordingsOf,
  failureBannerOf,
  movieMetaOf,
  oneOffMetaOf,
  posterMetaOf,
  scheduledShelfMetaOf,
  scheduledWhenOf,
  sectionJumpsOf,
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
  listedEpisodesOf,
  playButtonLabel,
  recordingRowOf,
  ruleStatusOf,
  seasonLabel,
  seasonYearOf,
  showsSeasonChips,
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
    posterMetaOf({ show: show({ counts: { total: 0, new: 0 }, rule: { paused: false }, nextAiring: { startDate: TUE_830PM } }), timeZone: TZ }),
    'First episode Tue 8:30pm',
  )
  assert.match(posterMetaOf({ show: show({ counts: { total: 0, new: 0 }, nextAiring: { startDate: TUE_830PM } }), timeZone: TZ }), /^Tue 20 Oct$/)
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

test('seasonYearOf: a season that is the year, or the last two digits of a year in the title, is a guide artefact', () => {
  assert.equal(seasonYearOf({ season: 26, title: 'Rugby League World Cup 2026' }), 2026)
  assert.equal(seasonYearOf({ season: 2026, title: 'AFL' }), 2026)
  assert.equal(seasonYearOf({ season: 26, title: 'Home and Away' }), null)
  assert.equal(seasonYearOf({ season: 25, title: 'Rugby League World Cup 2026' }), null)
  assert.equal(seasonYearOf({ season: 2, title: 'The Block 2002' }), 2002)
  assert.equal(seasonYearOf({ season: 22, title: 'The Block' }), null)
  assert.equal(seasonYearOf({ season: null, title: 'The Block 2026' }), null)
})

test('seasonLabel: a year-like season shows the year, never Season 26', () => {
  assert.equal(seasonLabel(26, 'Rugby League World Cup 2026'), '2026')
  assert.equal(seasonLabel(2025, 'NRL'), '2025')
  assert.equal(seasonLabel(26, 'Neighbours'), 'Season 26')
})

test('showsSeasonChips and listedEpisodesOf: one-offs and movies list their recordings with no season chips', () => {
  const rugby = show({
    key: 'rugby-league-world-cup-2026',
    title: 'Rugby League World Cup 2026',
    kind: 'oneoff',
    seasons: [
      { season: 26, episodes: [episode({ recordingId: 'a', airedAt: 1 })] },
      { season: null, episodes: [episode({ recordingId: 'b', airedAt: 2 })] },
    ],
  })
  assert.equal(showsSeasonChips(rugby), false)
  assert.deepEqual(listedEpisodesOf({ show: rugby, season: 26 }).map((e) => e.recordingId), ['b', 'a'])
  assert.equal(heroMetaOf({ show: rugby }), '2 recordings')
  assert.equal(showsSeasonChips({ ...rugby, kind: 'movie' }), false)
})

test('showsSeasonChips: a series shows chips, except one season that is only the year', () => {
  const block = show({ seasons: [{ season: 22, episodes: [episode()] }] })
  assert.equal(showsSeasonChips(block), true)
  assert.deepEqual(listedEpisodesOf({ show: block, season: 22 }).map((e) => e.recordingId), ['e45'])
  const cup = show({ title: 'NRL 2026', seasons: [{ season: 26, episodes: [episode()] }] })
  assert.equal(showsSeasonChips(cup), false)
  assert.equal(heroMetaOf({ show: cup }), '1 episode recorded')
  const years = show({ title: 'AFL', seasons: [{ season: 2026, episodes: [episode()] }, { season: 2025, episodes: [episode({ recordingId: 'x' })] }] })
  assert.equal(showsSeasonChips(years), true)
})

test('episodeActionsOf: offers the same delete and import actions as the recording log', () => {
  const keys = (e) => episodeActionsOf(e).map((a) => a.key)
  assert.deepEqual(keys(episode()), ['watched', 'remove-from-tvh'])
  assert.deepEqual(keys(episode({ watched: true, deletedFromTvhAt: '2026-10-01' })), ['unwatched', 'clear'])
  assert.deepEqual(keys(episode({ status: 'not_imported' })), ['watched', 'import', 'clear'])
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

test('show page lines: a show only from Plex, Sonarr, or Radarr counts episodes plainly and has no series line', () => {
  const downloaded = show({
    rule: null,
    seasons: [{ season: 22, episodes: [episode({ source: 'plex' }), episode({ recordingId: 'e44', episode: 44, source: 'plex' })] }],
  })
  assert.equal(heroMetaOf({ show: downloaded }), 'Season 22 · 2 episodes')
  assert.equal(ruleStatusOf({ show: downloaded, timeZone: TZ }), null)
  const mixed = { ...downloaded, seasons: [{ season: 22, episodes: [episode(), episode({ recordingId: 'e44', episode: 44, source: 'plex' })] }] }
  assert.equal(ruleStatusOf({ show: mixed, timeZone: TZ }).headline, 'Not recording new episodes')
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

test('scheduled episodes: pill, meta, hero line, and status card for a show that has not recorded yet', () => {
  const nowMs = Date.parse('2026-10-20T02:00:00Z')
  assert.equal(scheduledWhenOf({ ms: TUE_830PM, nowMs, timeZone: TZ }), 'Tonight 8:30pm')
  assert.equal(scheduledWhenOf({ ms: Date.parse('2026-10-20T03:00:00Z'), nowMs, timeZone: TZ }), 'Today 2:00pm')
  assert.equal(scheduledWhenOf({ ms: TUE_830PM + 86_400_000, nowMs, timeZone: TZ }), 'Tomorrow 8:30pm')
  assert.equal(scheduledWhenOf({ ms: TUE_830PM + 3 * 86_400_000, nowMs, timeZone: TZ }), 'Fri 8:30pm')
  const scheduled = { recordingId: 'scheduled-7', title: 'Love Island Australia', airedAt: TUE_830PM, durationS: 4380, channelName: '9HD Sydney', scheduled: { programId: 7 } }
  assert.equal(episodeMetaOf({ episode: scheduled, timeZone: TZ }), '1 hr 13 mins · 9HD Sydney')
  const detail = show({ kind: 'oneoff', counts: { total: 0 }, seasons: [{ season: 8, episodes: [scheduled] }] })
  assert.equal(heroMetaOf({ show: detail }), '9HD Sydney · 1 scheduled')
  assert.equal(showsSeasonChips({ ...detail, kind: 'show', seasons: [{ season: null, episodes: [scheduled] }] }), false)
  assert.deepEqual(ruleStatusOf({ show: detail, timeZone: TZ, nowMs }), {
    tone: 'scheduled',
    headline: 'Records tonight 8:30pm on 9HD Sydney',
    detail: 'This episode only. To record every episode, open it in the TV guide and choose Every episode.',
  })
  const recorded = { recordingId: 'a', title: 'Love Island Australia', airedAt: SUN_18_OCT, durationS: 3600, channelName: '9HD Sydney' }
  assert.equal(heroMetaOf({ show: { ...detail, seasons: [{ season: 8, episodes: [scheduled, recorded] }] } }), '9HD Sydney · 1 recording')
  const upcoming = (startDate, overrides) => show({ counts: { total: 0 }, nextAiring: { startDate }, ...overrides })
  assert.equal(scheduledShelfMetaOf({ show: upcoming(TUE_830PM), timeZone: TZ, nowMs }), 'Tonight 8:30pm')
  assert.equal(scheduledShelfMetaOf({ show: upcoming(TUE_830PM + 86_400_000), timeZone: TZ, nowMs }), 'Wed 8:30pm')
  assert.equal(scheduledShelfMetaOf({ show: upcoming(TUE_830PM + 2 * 86_400_000), timeZone: TZ, nowMs }), 'Thu 8:30pm')
  assert.equal(scheduledShelfMetaOf({ show: upcoming(TUE_830PM + 7 * 86_400_000), timeZone: TZ, nowMs }), 'Tue 27 Oct')
  assert.equal(oneOffMetaOf({ show: upcoming(TUE_830PM, { kind: 'oneoff' }), timeZone: TZ }), 'Tue 20 Oct')
  assert.equal(scheduledShelfMetaOf({ show: upcoming(TUE_830PM, { latest: { channelName: '9HD' } }), timeZone: TZ, nowMs }), '')
  assert.equal(scheduledShelfMetaOf({ show: upcoming(TUE_830PM, { rule: { paused: false } }), timeZone: TZ, nowMs }), '')
  assert.equal(scheduledWhenOf({ ms: TUE_830PM + 7 * 86_400_000, nowMs, timeZone: TZ }), 'Tue 27 Oct 8:30pm')
  const seriesTimer = { ...scheduled, scheduled: { programId: 7, seriesLinkId: 'auto-1' } }
  assert.equal(ruleStatusOf({ show: { ...detail, seasons: [{ season: 8, episodes: [seriesTimer] }] }, timeZone: TZ, nowMs }).detail, 'Part of a series recording in TVHeadend.')
})


test('sectionJumpsOf: lists filled sections in page order, and none when only one section has content', () => {
  const shelf = (count) => Array.from({ length: count }, (_, index) => show({ key: String(index) }))
  const keysOf = (shelves) => sectionJumpsOf(shelves).map((jump) => jump.key)
  assert.deepEqual(sectionJumpsOf({ shows: shelf(120), movies: shelf(8), oneoffs: shelf(6) }), [
    { key: 'shows', label: 'Shows' },
    { key: 'movies', label: 'Movies' },
    { key: 'oneoffs', label: 'Specials and one-offs' },
  ])
  assert.deepEqual(keysOf({ shows: shelf(3), movies: shelf(1), oneoffs: [] }), ['shows', 'movies'])
  assert.deepEqual(keysOf({ shows: [], movies: shelf(2), oneoffs: shelf(2) }), ['movies', 'oneoffs'])
  assert.deepEqual(keysOf({ shows: shelf(3), movies: [], oneoffs: shelf(1) }), ['shows', 'oneoffs'])
  assert.deepEqual(keysOf({ shows: shelf(120), movies: [], oneoffs: [] }), [])
  assert.deepEqual(keysOf({ shows: [], movies: shelf(4), oneoffs: [] }), [])
  assert.deepEqual(keysOf({ shows: [], movies: [], oneoffs: [] }), [])
})

test('sectionJumpsOf: follows the unwatched filter, so a section with nothing left drops out', () => {
  const shows = [
    show({ key: 'a', title: 'Master Cook' }),
    show({ key: 'b', title: 'Space Wars', kind: 'movie', counts: { total: 1, new: 0, unwatched: 0, failed: 0 } }),
    show({ key: 'c', title: 'The Sports Show', kind: 'oneoff' }),
  ]
  assert.deepEqual(sectionJumpsOf(shelvesOf({ shows })).map((jump) => jump.key), ['shows', 'movies', 'oneoffs'])
  assert.deepEqual(sectionJumpsOf(shelvesOf({ shows, unwatchedOnly: true })).map((jump) => jump.key), ['shows', 'oneoffs'])
})
