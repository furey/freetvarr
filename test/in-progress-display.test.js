import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  canWatchFromStart,
  episodeBadgeOf,
  inProgressCardMetaOf,
  inProgressEpisodeLineOf,
  inProgressEpisodeMetaOf,
  inProgressHeroMetaOf,
  lateStartMinutesOf,
  liveInProgressOf,
  recordedPercentOf,
  recordingCardOf,
  recordingSetKeyOf,
} from '../src/web/in-progress-display.js'
import { fromStartOption, playsFromMsOf } from '../src/web/start-over.js'
import { episodeMenuOf, isRecordingNow, showMenuOf, watchedChangeTargets } from '../src/web/library-menus.js'

const MIN = 60_000
const TZ = 'Australia/Sydney'
const START = Date.parse('2026-10-23T08:30:00Z')

const item = (overrides) => ({
  phase: 'recording',
  dvrUuid: 'c53af306',
  programId: 358017,
  channelId: 'seven',
  channelName: '7 Sydney',
  start: START,
  stop: START + 150 * MIN,
  stopPadded: START + 160 * MIN,
  recordingStartedAt: START + 30 * MIN,
  canPlayFromStart: true,
  libraryHold: null,
  seriesRecording: false,
  ...overrides,
})

const episode = (overrides) => ({
  recordingId: 'c53af306',
  title: 'Rugby League World Cup 2026',
  episodeTitle: 'Tonga v Lebanon',
  season: 26,
  episode: 6,
  channelName: '7 Sydney',
  durationS: 9000,
  playable: false,
  watched: false,
  failed: false,
  positionS: null,
  new: false,
  inProgress: item(),
  ...overrides,
})

test('recordingCardOf: a late start says when the recording began and that it joins the library', () => {
  const card = recordingCardOf({ item: item(), nowMs: START + 60 * MIN, timeZone: TZ })
  assert.equal(card.tone, 'live')
  assert.equal(card.headline, 'Recording now until 10:10pm')
  assert.equal(card.detail, 'Recording started at 8:00pm, 30 mins after the programme began. It joins your library when it finishes.')
})

test('recordingCardOf: on time, past the programme end, held back, and finishing', () => {
  const onTime = recordingCardOf({ item: item({ recordingStartedAt: START - 2 * MIN }), nowMs: START + MIN, timeZone: TZ })
  assert.equal(onTime.detail, 'It joins your library when it finishes.')
  const overrun = recordingCardOf({ item: item({ recordingStartedAt: START }), nowMs: START + 155 * MIN, timeZone: TZ })
  assert.match(overrun.detail, /^The programme ended at 10:00pm\. Recording continues in case it runs late\./)
  const held = recordingCardOf({
    item: item({ recordingStartedAt: START, libraryHold: 'No series folder for this title, and Import every recording is off' }),
    nowMs: START + MIN,
    timeZone: TZ,
  })
  assert.equal(held.detail, 'When it finishes it stays in TVHeadend, because Import every recording is off and no series folder matches it.')
  const finishing = recordingCardOf({ item: item({ phase: 'finishing' }), nowMs: START + 200 * MIN, timeZone: TZ })
  assert.deepEqual(finishing, { tone: 'idle', headline: 'Recorded until 10:10pm', detail: 'It joins your library at the next sync.' })
})

test('lateStartMinutesOf and playsFromMsOf: a minute of grace, then the real start', () => {
  assert.equal(lateStartMinutesOf(item({ recordingStartedAt: START + 50_000 })), 0)
  assert.equal(lateStartMinutesOf(item()), 30)
  assert.equal(playsFromMsOf(item()), START + 30 * MIN)
  assert.equal(playsFromMsOf(item({ recordingStartedAt: START - 2 * MIN })), START)
  const option = fromStartOption({ recording: { ...item(), title: 'Rugby' }, clockText: (ms) => (ms === START + 30 * MIN ? '8:00pm' : 'wrong') })
  assert.equal(option.detail, 'Watch Rugby from 8:00pm while it keeps recording')
})

test('recordedPercentOf: clamps to the programme', () => {
  assert.equal(recordedPercentOf({ start: START, stop: START + 100 * MIN, nowMs: START + 25 * MIN }), 25)
  assert.equal(recordedPercentOf({ start: START, stop: START + 100 * MIN, nowMs: START + 300 * MIN }), 100)
  assert.equal(recordedPercentOf({ start: START, stop: START, nowMs: START }), 0)
})

test('hero, row, and card text for a show with only a recording in progress', () => {
  assert.equal(inProgressHeroMetaOf({ show: { kind: 'oneoff', rule: null }, item: item() }), 'One-off recording · 7 Sydney · Not in your library yet')
  assert.equal(inProgressHeroMetaOf({ show: { kind: 'show', rule: {} }, item: item({ libraryHold: 'Kept out of the library' }) }), 'Series recording · 7 Sydney · Stays in TVHeadend')
  assert.equal(inProgressHeroMetaOf({ show: { kind: 'show', rule: null }, item: item({ seriesRecording: false }) }), 'Series recording · 7 Sydney · Not in your library yet')
  assert.equal(inProgressHeroMetaOf({ show: { kind: 'oneoff', rule: null }, item: item({ seriesRecording: true }) }), 'One-off recording · 7 Sydney · Not in your library yet')
  assert.equal(inProgressHeroMetaOf({ show: { kind: 'movie', rule: null }, item: item() }), 'Movie recording · 7 Sydney · Not in your library yet')
  const meta = inProgressEpisodeMetaOf({ episode: episode(), item: item(), nowMs: START + 113 * MIN, timeZone: TZ })
  assert.equal(meta, 'Fri 23 Oct · 7 Sydney · 1 hr 23 mins recorded · 47 mins left')
  assert.equal(inProgressEpisodeMetaOf({ episode: episode(), item: item({ phase: 'finishing' }), nowMs: START, timeZone: TZ }), 'Fri 23 Oct · 7 Sydney · 2 hrs 30 mins · Waiting to import')
  assert.equal(inProgressEpisodeLineOf({ item: item(), timeZone: TZ }), 'Plays from 8:00pm while it keeps recording. Seek anywhere in the recorded part, or go to live.')
  assert.equal(inProgressEpisodeLineOf({ item: item({ phase: 'finishing' }), timeZone: TZ }), '')
  const show = { counts: { total: 1, inProgress: 1 }, inProgress: item() }
  assert.equal(inProgressCardMetaOf({ show, timeZone: TZ }), '7 Sydney · until 10:10pm')
  assert.equal(inProgressCardMetaOf({ show: { ...show, counts: { total: 3, inProgress: 1 } }, timeZone: TZ }), '')
})

test('liveInProgressOf: fresher stop times from the poll win, and a finished one stops offering from the start', () => {
  const extended = liveInProgressOf({ episode: episode(), active: [{ dvrUuid: 'c53af306', canPlayFromStart: true, stop: START + 170 * MIN, stopPadded: START + 180 * MIN }] })
  assert.equal(extended.stopPadded, START + 180 * MIN)
  assert.equal(canWatchFromStart(extended), true)
  assert.equal(canWatchFromStart({ ...item(), phase: 'finishing' }), false)
  assert.equal(liveInProgressOf({ episode: episode({ inProgress: null }) }), null)
})

test('episodeBadgeOf: REC only while it records, then nothing until it imports', () => {
  assert.equal(episodeBadgeOf({ episode: episode() }), 'rec')
  assert.equal(episodeBadgeOf({ episode: episode({ inProgress: item({ phase: 'finishing' }) }) }), '')
  assert.equal(episodeBadgeOf({ episode: episode({ inProgress: null, new: true }) }), 'new')
})

test('recordingSetKeyOf: changes when a recording starts, finishes, or imports', () => {
  const recording = recordingSetKeyOf({ active: [{ dvrUuid: 'a' }, { dvrUuid: 'bad', failed: true }], finishing: [] })
  const finishing = recordingSetKeyOf({ active: [], finishing: [{ uuid: 'a' }] })
  assert.equal(recording, 'r:a')
  assert.equal(finishing, 'f:a')
  assert.equal(recordingSetKeyOf({}), '')
})

test('library menus: an in-progress row offers watching and stopping, never delete, mark, or move', () => {
  const running = episode()
  const imported = episode({ recordingId: 'old', inProgress: null, playable: true, filePath: '/tv/old.ts' })
  const keys = (groups) => groups.flat().map((entry) => entry.key)
  assert.deepEqual(keys(episodeMenuOf({ episode: running, canMove: true })), ['from-start', 'watch-live', 'episode-info', 'stop-recording'])
  assert.deepEqual(keys(episodeMenuOf({ episode: episode({ inProgress: item({ phase: 'finishing' }) }) })), ['episode-info'])
  assert.equal(isRecordingNow({ episode: episode({ inProgress: item({ phase: 'finishing' }) }), activeIds: new Set() }), true)
  const show = { seasons: [{ season: 26, episodes: [running, imported] }], resumeNext: null, rule: null }
  const showKeys = keys(showMenuOf({ show, canMove: true }))
  assert.ok(showKeys.includes('from-start'))
  assert.ok(showKeys.includes('stop-recording'))
  assert.deepEqual(showMenuOf({ show, canMove: true }).at(-1).find((entry) => entry.key === 'delete-all').detail, '1')
  const onlyRunning = keys(showMenuOf({ show: { ...show, seasons: [{ season: 26, episodes: [running] }] }, canMove: true }))
  assert.ok(!onlyRunning.includes('mark-all-watched'))
  assert.ok(!onlyRunning.includes('move'))
  assert.deepEqual(watchedChangeTargets({ episodes: [running, imported], watched: true }).map((e) => e.recordingId), ['old'])
})
