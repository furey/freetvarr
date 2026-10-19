import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  EMPTY_PROGRESS,
  HISTORY_RETENTION_MS,
  backfillEventsOf,
  eventRowOf,
  feedbackEventsFrom,
  liveWatchEndsOf,
  msOf,
  positionPingOf,
  positionProgressOf,
  pruneCutoffOf,
  routeEventsOf,
  seriesBackfillEventsOf,
  seriesKeyOf,
  seriesLinkParts,
  viewingHistoryEnabledFrom,
  watchedSecondsOf,
} from '../src/user-events.js'

const MIN = 60_000
const programme = (title, startMin, endMin, extra = {}) => ({
  title, start: startMin * MIN, end: endMin * MIN, program_id: `${title}-${startMin}`, channel_id: 'ch1', ...extra,
})

test('seriesKeyOf reuses the show key and ignores empty titles', () => {
  assert.equal(seriesKeyOf('Gardening Australia'), 'gardening-australia')
  assert.equal(seriesKeyOf('  '), null)
  assert.equal(seriesKeyOf(null), null)
})

test('eventRowOf shapes a row with rounded seconds, a series key and meta JSON', () => {
  const row = eventRowOf({
    event: { kind: 'watch_end', title: ' Hard Quiz ', duration_s: 61.6, position_s: -3, meta: { backfill: true } },
    nowMs: 1000,
  })
  assert.deepEqual(row, {
    ts: 1000,
    kind: 'watch_end',
    series_key: 'hard-quiz',
    title: 'Hard Quiz',
    programme_start: null,
    channel_id: null,
    recording_id: null,
    duration_s: 62,
    position_s: 0,
    programme_len_s: null,
    source: null,
    meta_json: '{"backfill":true}',
  })
  assert.equal(eventRowOf({ event: { kind: 'thumb_up', series_key: 'abc', meta: {} } }).meta_json, null)
})

test('liveWatchEndsOf splits a session at programme boundaries and drops short overlaps', () => {
  const programmes = [programme('News', 0, 30), programme('Quiz', 30, 60), programme('Film', 60, 180)]
  const events = liveWatchEndsOf({ channelId: 'ch1', startedAt: 29.5 * MIN, endedAt: 75 * MIN, programmes })
  assert.deepEqual(events.map((e) => [e.title, e.duration_s, e.ts, e.position_s, e.programme_len_s]), [
    ['Quiz', 1800, 60 * MIN, 1800, 1800],
    ['Film', 900, 75 * MIN, 900, 7200],
  ])
  assert.equal(events[0].kind, 'watch_end')
  assert.equal(events[0].source, 'live')
  assert.equal(events[0].programme_start, 30 * MIN)
  assert.equal(events[0].meta.program_id, 'Quiz-30')
})

test('liveWatchEndsOf keeps exactly one minute and falls back to an untitled watch with no guide', () => {
  const programmes = [programme('News', 0, 30)]
  assert.equal(liveWatchEndsOf({ channelId: 'c', startedAt: 29 * MIN, endedAt: 30 * MIN, programmes }).length, 1)
  assert.equal(liveWatchEndsOf({ channelId: 'c', startedAt: 29.5 * MIN, endedAt: 30 * MIN, programmes }).length, 0)
  const [untitled] = liveWatchEndsOf({ channelId: 'c', startedAt: 0, endedAt: 5 * MIN, programmes: [] })
  assert.equal(untitled.duration_s, 300)
  assert.equal(untitled.title, undefined)
  assert.deepEqual(liveWatchEndsOf({ channelId: 'c', startedAt: 0, endedAt: 30_000, programmes: [] }), [])
  assert.deepEqual(liveWatchEndsOf({ channelId: 'c', startedAt: 10, endedAt: 5, programmes }), [])
})

test('positionProgressOf counts forward playback and ignores seeks and the first ping', () => {
  let progress = positionProgressOf({ progress: EMPTY_PROGRESS, seconds: 100, atMs: 0 })
  assert.equal(progress.watchedSeconds, 0)
  progress = positionProgressOf({ progress, seconds: 130, atMs: 30_000 })
  assert.equal(progress.watchedSeconds, 30)
  progress = positionProgressOf({ progress, seconds: 900, atMs: 40_000 })
  assert.equal(progress.watchedSeconds, 30)
  progress = positionProgressOf({ progress, seconds: 800, atMs: 50_000 })
  assert.equal(progress.watchedSeconds, 30)
  progress = positionProgressOf({ progress, seconds: 815, atMs: 65_000 })
  assert.equal(progress.watchedSeconds, 45)
})

test('watchedSecondsOf prefers position progress, falls back to wall time, and caps at the length', () => {
  assert.equal(watchedSecondsOf({ progress: { ...EMPTY_PROGRESS, seen: true, watchedSeconds: 40 }, wallMs: 90_000 }), 40)
  assert.equal(watchedSecondsOf({ wallMs: 90_000 }), 90)
  assert.equal(watchedSecondsOf({ wallMs: 90_000, lengthSeconds: 60 }), 60)
})

test('seriesLinkParts reads the channel and title from a series link id', () => {
  assert.deepEqual(seriesLinkParts('chan-1|hard quiz'), { channelId: 'chan-1', title: 'hard quiz' })
  assert.deepEqual(seriesLinkParts('loose'), { channelId: null, title: 'loose' })
})

test('routeEventsOf maps record and cancel endpoints to events', () => {
  const guideProgramme = programme('Hard Quiz', 10, 40)
  const [record] = routeEventsOf({
    method: 'POST',
    path: '/api/epg/record',
    body: { channel_id: 'ch1', program_id: 77 },
    response: { ok: true, uuid: 'dvr1' },
    context: { programme: guideProgramme },
  })
  assert.equal(record.kind, 'record_request')
  assert.equal(record.title, 'Hard Quiz')
  assert.equal(record.programme_len_s, 1800)
  assert.deepEqual(record.meta, { type: 'episode', dvr_uuid: 'dvr1', program_id: 77 })

  const [series] = routeEventsOf({
    method: 'POST', path: '/api/epg/record-series', body: { channel_id: 'ch1', program_id: 77, any_channel: true }, response: { title: 'Hard Quiz' },
  })
  assert.equal(series.meta.type, 'series')
  assert.equal(series.meta.any_channel, true)
  assert.equal(series.title, 'Hard Quiz')

  const stops = routeEventsOf({
    method: 'POST', path: '/api/epg/cancel-series', response: { cancelled: [{ seriesLinkId: 'ch1|hard quiz', title: 'Hard Quiz' }] },
  })
  assert.deepEqual(stops.map((e) => [e.kind, e.title, e.channel_id]), [['series_stop', 'Hard Quiz', 'ch1']])

  const pauses = routeEventsOf({ method: 'POST', path: '/api/epg/pause-series', body: { series_link_ids: ['ch1|a', 'ch2|b'], paused: true } })
  assert.deepEqual(pauses.map((e) => [e.kind, e.title]), [['series_pause', 'a'], ['series_pause', 'b']])
  const [resume] = routeEventsOf({ method: 'POST', path: '/api/epg/pause-series', body: { series_link_ids: ['ch1|a'], paused: false } })
  assert.equal(resume.kind, 'series_resume')

  const [cancel] = routeEventsOf({ method: 'POST', path: '/api/epg/cancel', body: { program_id: 77 }, context: { programme: guideProgramme } })
  assert.equal(cancel.kind, 'record_cancel')
  assert.equal(cancel.channel_id, 'ch1')
})

test('routeEventsOf maps watchlist changes and deletions', () => {
  const [added] = routeEventsOf({ method: 'POST', path: '/api/watchlist', body: { title: 'Bluey' }, response: { item: { title: 'Bluey', mode: 'notify' } } })
  assert.deepEqual([added.kind, added.title, added.meta.type, added.source], ['record_request', 'Bluey', 'notify', 'watchlist'])
  const watchlist = { title: 'Bluey', mode: 'record', channel_id: null }
  assert.equal(routeEventsOf({ method: 'PATCH', path: '/api/watchlist/3', body: { seen_through: 1 }, context: { watchlist } }).length, 0)
  const [changed] = routeEventsOf({ method: 'PATCH', path: '/api/watchlist/3', body: { mode: 'record' }, context: { watchlist } })
  assert.equal(changed.meta.type, 'record')
  const [removed] = routeEventsOf({ method: 'DELETE', path: '/api/watchlist/3', context: { watchlist } })
  assert.equal(removed.kind, 'record_cancel')

  const recordings = new Map([['r1', { recording_id: 'r1', title: 'Bluey', watched_at: '2026-01-01', duration_s: 420 }]])
  const deleted = routeEventsOf({
    method: 'POST',
    path: '/api/library/delete',
    response: { results: [{ recordingId: 'r1', ok: true }, { recordingId: 'r2', ok: false }] },
    context: { recordings },
  })
  assert.deepEqual(deleted.map((e) => [e.kind, e.recording_id, e.meta.watched, e.source]), [['recording_deleted', 'r1', true, 'library']])
  const [fromTvh] = routeEventsOf({ method: 'POST', path: '/api/recordings/r1/delete-from-tvh', context: { recordings } })
  assert.equal(fromTvh.source, 'tvheadend')
  assert.deepEqual(routeEventsOf({ method: 'GET', path: '/api/watchlist' }), [])
})

test('positionPingOf recognises position saves', () => {
  assert.deepEqual(positionPingOf({ method: 'POST', path: '/api/recordings/a%20b/position', body: { seconds: 12 } }), { recordingId: 'a b', seconds: 12 })
  assert.equal(positionPingOf({ method: 'POST', path: '/api/recordings/a/play', body: { seconds: 12 } }), null)
  assert.equal(positionPingOf({ method: 'POST', path: '/api/recordings/a/position', body: {} }), null)
})

test('feedbackEventsFrom validates kinds, keys, and sizes', () => {
  assert.deepEqual(feedbackEventsFrom({ kind: 'thumb_up', title: 'Bluey' }).events[0], {
    kind: 'thumb_up', title: 'Bluey', series_key: null, programme_start: null, channel_id: null, recording_id: null, source: 'ui', meta: null,
  })
  assert.equal(feedbackEventsFrom({ events: [{ kind: 'suggestion_shown', series_key: 'bluey', source: 'for_you' }] }).events.length, 1)
  assert.match(feedbackEventsFrom({ kind: 'watch_end', title: 'x' }).error, /kind must be/)
  assert.match(feedbackEventsFrom({ kind: 'thumb_up' }).error, /title or series_key/)
  assert.match(feedbackEventsFrom({ kind: 'thumb_up', series_key: 'Not A Key' }).error, /series_key/)
  assert.match(feedbackEventsFrom({ kind: 'thumb_up', title: 'x'.repeat(201) }).error, /title/)
  assert.match(feedbackEventsFrom({ kind: 'thumb_up', title: 'x', programme_start: -1 }).error, /programme_start/)
  assert.match(feedbackEventsFrom({ kind: 'thumb_up', title: 'x', source: 'Bad Source' }).error, /source/)
  assert.match(feedbackEventsFrom({ kind: 'thumb_up', title: 'x', meta: [] }).error, /meta/)
  assert.match(feedbackEventsFrom({ kind: 'thumb_up', title: 'x', meta: { a: 'y'.repeat(2001) } }).error, /meta/)
  assert.match(feedbackEventsFrom({ events: [] }).error, /between 1 and 50/)
  assert.match(feedbackEventsFrom({ events: Array.from({ length: 51 }, () => ({ kind: 'thumb_up', title: 'x' })) }).error, /between/)
  assert.match(feedbackEventsFrom(null).error, /object/)
})

test('backfillEventsOf seeds watched, partial, and watchlist events', () => {
  const events = backfillEventsOf({
    nowMs: 5,
    recordings: [
      { recording_id: 'a', title: 'Bluey', watched_at: '2026-01-02T00:00:00.000Z', duration_s: 420, playback_position_s: 410, aired_at: 9 },
      { recording_id: 'b', title: 'Quiz', watched_at: null, playback_position_s: 600, played_at: '2026-01-03T00:00:00.000Z', duration_s: 1800 },
      { recording_id: 'c', title: 'Never', watched_at: null, playback_position_s: 0 },
    ],
    watchlist: [{ title: 'Spicks', mode: 'record', created_at: '2026-01-04 00:00:00' }],
  })
  assert.deepEqual(events.map((e) => [e.kind, e.recording_id ?? e.title, e.duration_s, e.meta.backfill]), [
    ['watch_end', 'a', 420, true],
    ['watch_end', 'b', 600, true],
    ['record_request', 'Spicks', undefined, true],
  ])
  assert.equal(events[0].ts, Date.parse('2026-01-02T00:00:00.000Z'))
  assert.equal(events[1].meta.watched, false)
  assert.equal(events[2].ts, Date.parse('2026-01-04T00:00:00Z'))
  assert.equal(events[2].meta.type, 'record')
})

test('seriesBackfillEventsOf turns autorecs into series requests', () => {
  const [event] = seriesBackfillEventsOf({ nowMs: 7, autorecs: [{ name: 'Hard Quiz', channelId: 'ch1', enabled: false }, { name: '' }] })
  assert.deepEqual(event, {
    kind: 'record_request', ts: 7, title: 'Hard Quiz', channel_id: 'ch1', source: 'series', meta: { backfill: true, type: 'series', enabled: false },
  })
})

test('msOf reads numbers, ISO strings, and SQLite UTC timestamps', () => {
  assert.equal(msOf(12), 12)
  assert.equal(msOf('2026-01-04 00:00:00'), Date.parse('2026-01-04T00:00:00Z'))
  assert.equal(msOf('nonsense'), null)
  assert.equal(msOf(null), null)
})

test('viewing history defaults on and prunes after two years', () => {
  assert.equal(viewingHistoryEnabledFrom(null), true)
  assert.equal(viewingHistoryEnabledFrom('false'), false)
  assert.equal(pruneCutoffOf(HISTORY_RETENTION_MS + 1), 1)
})
