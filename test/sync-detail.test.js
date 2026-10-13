import { test } from 'node:test'
import assert from 'node:assert/strict'

import { syncDetail, sxe } from '../src/web/sync-detail.js'

test('syncDetail: lists each item with its episode, kind, and error', () => {
  const detail = syncDetail({
    trigger: 'cron',
    imported: 1,
    failed: 1,
    errors: ['Quiz: short copy'],
    items: [
      { id: 'a', title: 'The Block', season: 21, episode: 4, episodeTitle: 'Kitchens', kind: 'tv', outcome: 'imported', durationS: 5400, size: 2e9, ms: 1200, removedFromTvh: true },
      { id: 'b', title: 'Quiz', kind: 'oneOff', outcome: 'failed', error: 'short copy' },
    ],
  })
  assert.equal(detail.trigger, 'Scheduled sync')
  assert.equal(detail.items[0].episode, 'S21E04 · Kitchens')
  assert.equal(detail.items[0].kind, 'series')
  assert.equal(detail.items[0].durationMins, 90)
  assert.equal(detail.items[0].took, '1s')
  assert.equal(detail.items[0].removedFromTvh, true)
  assert.equal(detail.items[1].outcomeLabel, 'FAILED')
  assert.equal(detail.items[1].error, 'short copy')
  assert.deepEqual(detail.errors, [])
})

test('syncDetail: an older sync with counts only says so, and keeps its errors', () => {
  const detail = syncDetail({ trigger: 'manual', imported: 2, failed: 0, errors: ['TVHeadend timed out'] })
  assert.equal(detail.countsOnly, true)
  assert.deepEqual(detail.errors, ['TVHeadend timed out'])
})

test('syncDetail: gives one line per step with its result and run time', () => {
  const detail = syncDetail({
    steps: { list: 800, imports: 33_000, plexTv: 400, unknown: 5 },
    plex: { triggered: true, status: 200 },
    plexMovies: { error: 'HTTP 401' },
    delete: { triggered: 1, removed: ['a', 'b'] },
  })
  assert.deepEqual(detail.steps.map((s) => `${s.label}: ${s.text}`), [
    'Read TVHeadend: 1s',
    'Import files: 33s',
    'Refresh Plex TV: refreshed · under 1s',
    'Refresh Plex movies: failed: HTTP 401',
    'Remove from TVHeadend: removed 2',
  ])
  assert.equal(detail.steps[3].ok, false)
})

test('sxe pads season and episode', () => {
  assert.equal(sxe({ season: 3, episode: 12 }), 'S03E12')
  assert.equal(sxe({ season: null, episode: 7 }), 'E07')
  assert.equal(sxe({}), '')
})
