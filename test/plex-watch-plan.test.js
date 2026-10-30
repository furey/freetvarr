import assert from 'node:assert/strict'
import test from 'node:test'

import { matchRows, planRow, planWatchSync, snapshotAfterFailedPush } from '../src/plex-watch-plan.js'

const NOW = Date.parse('2026-10-30T10:00:00Z')
const PLEX_VIEWED_S = Date.parse('2026-10-29T20:00:00Z') / 1000

const row = (patch = {}) => ({
  recording_id: 'r1',
  title: 'Big Brother',
  file_path: '/media/TV/Big Brother/Season 17/Big Brother - S17E04 - Episode 4.ts',
  duration_s: 3600,
  watched_at: null,
  played_at: null,
  playback_position_s: null,
  ...patch,
})

const item = (patch = {}) => ({
  ratingKey: '101',
  viewCount: 0,
  viewOffset: 0,
  lastViewedAt: null,
  duration: 3_600_000,
  Media: [{ Part: [{ file: '/data/tv/Big Brother/Season 17/Big Brother - S17E04 - Episode 4.ts' }] }],
  ...patch,
})

const snapshot = (patch = {}) => ({
  recording_id: 'r1',
  rating_key: '101',
  plex_watched: false,
  plex_offset_s: 0,
  ft_watched: false,
  ft_position_s: 0,
  ...patch,
})

const plan = (args) => planRow({ nowMs: NOW, row: row(args.row), item: item(args.item), snapshot: args.snapshot === null ? null : snapshot(args.snapshot), fromPlex: args.fromPlex, toPlex: args.toPlex })

test('first run: watched in Plex marks it watched in Freetvarr at the Plex time', () => {
  const result = plan({ item: { viewCount: 1, lastViewedAt: PLEX_VIEWED_S }, snapshot: null })
  assert.equal(result.baseline, true)
  assert.deepEqual(result.pull, { watched_at: '2026-10-29T20:00:00.000Z', played_at: '2026-10-29T20:00:00.000Z' })
  assert.equal(result.push, null)
  assert.equal(result.snapshot.ft_watched, true)
  assert.equal(result.snapshot.plex_watched, true)
})

test('first run: watched in Freetvarr only is sent to Plex once', () => {
  const result = plan({ row: { watched_at: '2026-10-28T10:00:00Z' }, snapshot: null })
  assert.deepEqual(result.push, { action: 'scrobble' })
  assert.equal(result.pull, null)
  assert.equal(result.snapshot.plex_watched, true)
})

test('first run never unmarks either side', () => {
  const plexOnly = plan({ item: { viewCount: 1 }, snapshot: null, fromPlex: false })
  assert.equal(plexOnly.pull, null)
  assert.equal(plexOnly.push, null)
  const freetvarrOnly = plan({ row: { watched_at: '2026-10-28T10:00:00Z' }, snapshot: null, toPlex: false })
  assert.equal(freetvarrOnly.push, null)
  assert.equal(freetvarrOnly.pull, null)
})

test('watched in Plex since the last run marks it watched in Freetvarr', () => {
  const result = plan({ item: { viewCount: 1, lastViewedAt: PLEX_VIEWED_S } })
  assert.equal(result.pull.watched_at, '2026-10-29T20:00:00.000Z')
})

test('unwatched in Plex unmarks it in Freetvarr and clears the resume point', () => {
  const result = plan({ row: { watched_at: '2026-10-28T10:00:00Z' }, snapshot: { plex_watched: true, ft_watched: true } })
  assert.deepEqual(result.pull, { watched_at: null, playback_position_s: null })
  assert.equal(result.push, null)
})

test('an unwatch in Plex does not undo a mark made in Freetvarr since the last run', () => {
  const result = plan({ row: { watched_at: '2026-10-30T09:00:00Z' }, snapshot: { plex_watched: true, ft_watched: false } })
  assert.equal(result.pull, null)
  assert.deepEqual(result.push, { action: 'scrobble' })
})

test('marked and unmarked in Freetvarr are pushed to Plex', () => {
  assert.deepEqual(plan({ row: { watched_at: '2026-10-30T09:00:00Z' } }).push, { action: 'scrobble' })
  assert.deepEqual(plan({ item: { viewCount: 2 }, snapshot: { plex_watched: true, ft_watched: true } }).push, { action: 'unscrobble' })
})

test('our own write is not echoed back on the next run', () => {
  const first = plan({ row: { watched_at: '2026-10-30T09:00:00Z' } })
  const next = planRow({ nowMs: NOW, row: row({ watched_at: '2026-10-30T09:00:00Z' }), item: item({ viewCount: 1 }), snapshot: first.snapshot })
  assert.equal(next.pull, null)
  assert.equal(next.push, null)
})

test('a resume point from Plex is copied when only Plex moved', () => {
  const result = plan({ item: { viewOffset: 1_200_000, lastViewedAt: PLEX_VIEWED_S } })
  assert.deepEqual(result.pull, { playback_position_s: 1200, played_at: '2026-10-29T20:00:00.000Z' })
})

test('a resume point from Plex near the end also marks it watched', () => {
  const result = plan({ item: { viewOffset: 3_580_000, lastViewedAt: PLEX_VIEWED_S } })
  assert.equal(result.pull.watched_at, '2026-10-29T20:00:00.000Z')
})

test('a resume point from Freetvarr is sent to Plex', () => {
  const result = plan({ row: { playback_position_s: 900, played_at: '2026-10-30T09:00:00Z' } })
  assert.deepEqual(result.push, { action: 'progress', seconds: 900 })
  assert.equal(result.snapshot.plex_offset_s, 900)
})

test('offsets within 15 seconds count as the same', () => {
  const result = plan({ row: { playback_position_s: 610 }, item: { viewOffset: 600_000 }, snapshot: { plex_offset_s: 600, ft_position_s: 600 } })
  assert.equal(result.pull, null)
  assert.equal(result.push, null)
})

test('a resume point going backwards is still a change', () => {
  const result = plan({ item: { viewOffset: 300_000, lastViewedAt: PLEX_VIEWED_S }, row: { playback_position_s: 1800 }, snapshot: { plex_offset_s: 1800, ft_position_s: 1800 } })
  assert.equal(result.pull.playback_position_s, 300)
})

test('both resume points moved: the newer one wins, a tie goes to Freetvarr', () => {
  const plexNewer = plan({
    item: { viewOffset: 2_000_000, lastViewedAt: PLEX_VIEWED_S },
    row: { playback_position_s: 900, played_at: '2026-10-29T10:00:00Z' },
    snapshot: { plex_offset_s: 100, ft_position_s: 100 },
  })
  assert.equal(plexNewer.pull.playback_position_s, 2000)
  const tie = plan({
    item: { viewOffset: 2_000_000, lastViewedAt: PLEX_VIEWED_S },
    row: { playback_position_s: 900, played_at: '2026-10-29T20:00:00Z' },
    snapshot: { plex_offset_s: 100, ft_position_s: 100 },
  })
  assert.deepEqual(tie.push, { action: 'progress', seconds: 900 })
})

test('watched on both sides ignores resume points', () => {
  const result = plan({ item: { viewCount: 1, viewOffset: 600_000 }, row: { watched_at: '2026-10-28T10:00:00Z', playback_position_s: 50 }, snapshot: { plex_watched: true, ft_watched: true } })
  assert.equal(result.pull, null)
  assert.equal(result.push, null)
})

test('a new Plex item for the same recording is a fresh start, never an unwatch', () => {
  const result = plan({ row: { watched_at: '2026-10-28T10:00:00Z' }, item: { ratingKey: '202' }, snapshot: { rating_key: '101', plex_watched: true, ft_watched: true } })
  assert.equal(result.baseline, true)
  assert.equal(result.pull, null)
  assert.deepEqual(result.push, { action: 'scrobble' })
  assert.equal(result.snapshot.rating_key, '202')
})

test('a direction turned off sends nothing but the snapshot still follows that side', () => {
  const result = plan({ item: { viewCount: 1 }, fromPlex: false })
  assert.equal(result.pull, null)
  assert.equal(result.snapshot.plex_watched, true)
  assert.equal(result.snapshot.ft_watched, false)
  const later = planRow({ nowMs: NOW, row: row(), item: item({ viewCount: 1 }), snapshot: result.snapshot })
  assert.equal(later.pull, null)
})

test('a failed push keeps the old Freetvarr side so the change is sent again', () => {
  const previous = snapshot()
  const result = plan({ row: { watched_at: '2026-10-30T09:00:00Z' } })
  assert.deepEqual(snapshotAfterFailedPush({ plan: result, previous }), { ...result.snapshot, plex_watched: false, plex_offset_s: 0, ft_watched: false, ft_position_s: 0 })
  const retry = planRow({ nowMs: NOW, row: row({ watched_at: '2026-10-30T09:00:00Z' }), item: item(), snapshot: snapshotAfterFailedPush({ plan: result, previous }) })
  assert.deepEqual(retry.push, { action: 'scrobble' })
  assert.equal(snapshotAfterFailedPush({ plan: result, previous: null }), null)
})

test('matching: by file path tail, any part of multi-part media, and never on a tie', () => {
  const rows = [row(), row({ recording_id: 'r2', file_path: '/media/one-offs/Gruen/Gruen - 2026-10-29 2030.ts' })]
  const multipart = item({ ratingKey: '300', Media: [{ Part: [{ file: '/x/a.ts' }, { file: '/data/oneoffs/Gruen/Gruen - 2026-10-29 2030.ts' }] }] })
  const { matched, unmatched, ambiguous } = matchRows({ rows, items: [item(), multipart] })
  assert.deepEqual(matched.map((m) => [m.row.recording_id, m.item.ratingKey]), [['r1', '101'], ['r2', '300']])
  assert.equal(unmatched, 0)
  assert.equal(ambiguous, 0)
  const twin = item({ ratingKey: '102', Media: [{ Part: [{ file: '/old/Big Brother/Season 17/Big Brother - S17E04 - Episode 4.ts' }] }] })
  const tie = matchRows({ rows: [row()], items: [item(), twin] })
  assert.equal(tie.matched.length, 0)
  assert.equal(tie.ambiguous, 1)
})

test('matching: a Plex item claimed by two recordings is skipped for both', () => {
  const rows = [row(), row({ recording_id: 'r2' })]
  const result = matchRows({ rows, items: [item()] })
  assert.equal(result.matched.length, 0)
  assert.equal(result.ambiguous, 2)
})

test('matching: a recording Plex has not scanned yet is unmatched', () => {
  const result = planWatchSync({ rows: [row({ file_path: '/media/TV/New/Season 1/New - S01E01.ts' })], items: [item()], snapshots: [], nowMs: NOW })
  assert.equal(result.plans.length, 0)
  assert.equal(result.unmatched, 1)
})
