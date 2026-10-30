import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  deleteConfirmOf,
  deleteOutcomeOf,
  deleteRefusalOf,
  listText,
  plexLineOf,
  sizeText,
} from '../src/web/delete-copy.js'

const GB = 1e9
const show = { title: 'The Block', rule: { paused: false, channels: ['9HD'] } }
const item = (episode, overrides = {}) => ({ recordingId: `e${episode}`, title: 'The Block', episodeTitle: null, season: 22, episode, bytes: 4 * GB, missing: false, ...overrides })
const inTvh = (count) => Array.from({ length: count }, () => ({ deletedFromTvhAt: null }))

test('sizeText and listText: plain sizes and joined lists', () => {
  assert.equal(sizeText(41 * GB), '41 GB')
  assert.equal(sizeText(4.1 * GB), '4.1 GB')
  assert.equal(sizeText(850e6), '850 MB')
  assert.equal(sizeText(0), '')
  assert.equal(listText(['E41', 'E42', 'E43']), 'E41, E42 and E43')
  assert.equal(listText(['E41']), 'E41')
})

test('deleteConfirmOf: delete all episodes says what goes and what stays', () => {
  const items = Array.from({ length: 10 }, (_, i) => item(35 + i))
  const copy = deleteConfirmOf({ variant: 'all', show, preview: { count: 10, bytes: 41 * GB, items }, episodes: inTvh(10), totalCount: 10 })
  assert.equal(copy.title, 'Delete all 10 episodes of The Block?')
  assert.deepEqual(copy.deleted, [
    { title: '10 episodes, 41 GB', detail: 'from your library and Plex' },
    { title: 'Their recordings in TVHeadend' },
  ])
  assert.deepEqual(copy.stays, [
    { title: 'The series recording', detail: 'New episodes still record on 9HD' },
    { title: 'Your other shows' },
  ])
  assert.equal(copy.confirmLabel, 'Delete 10 episodes')
  assert.equal(copy.offersStopSeries, true)
  assert.equal(copy.missingNote, '')
})

test('deleteConfirmOf: stopping the series moves it to what gets deleted', () => {
  const copy = deleteConfirmOf({ variant: 'all', show, preview: { count: 1, bytes: GB, items: [item(1)] }, episodes: inTvh(1), totalCount: 1, stopSeries: true })
  assert.equal(copy.title, 'Delete the only episode of The Block?')
  assert.deepEqual(copy.deleted.at(-1), { title: 'The series recording', detail: 'New episodes stop recording' })
  assert.deepEqual(copy.stays, [{ title: 'Your other shows' }])
})

test('deleteConfirmOf: a single episode keeps the others and the series', () => {
  const copy = deleteConfirmOf({ variant: 'episode', show, preview: { count: 1, bytes: 4.1 * GB, items: [item(44)] }, episodes: inTvh(1), totalCount: 10 })
  assert.equal(copy.title, 'Delete this episode?')
  assert.deepEqual(copy.deleted, [
    { title: 'This episode, 4.1 GB', detail: 'from your library and Plex' },
    { title: 'Its recording in TVHeadend' },
  ])
  assert.deepEqual(copy.stays[0], { title: 'The other 9 episodes of The Block' })
  assert.equal(copy.confirmLabel, 'Delete episode')
  assert.equal(copy.offersStopSeries, false)
})

test('deleteConfirmOf: watched episodes are listed, and a missing file gets a note', () => {
  const items = [item(41, { missing: true }), item(42), item(43)]
  const copy = deleteConfirmOf({ variant: 'watched', show, preview: { count: 3, bytes: 8.2 * GB, missingCount: 1, items }, episodes: inTvh(3), totalCount: 10 })
  assert.equal(copy.title, 'Delete 3 watched episodes of The Block?')
  assert.deepEqual(copy.deleted.map((line) => line.title), ['E42 and E43, 8.2 GB', 'All 3 recordings in TVHeadend'])
  assert.equal(copy.missingNote, 'E41 is already missing from your library. Someone may have moved or deleted it. Freetvarr deletes only its TVHeadend recording.')
  assert.deepEqual(copy.stays[0], { title: '7 unwatched episodes' })
})

test('deleteConfirmOf: selected episodes, a paused series, and rows already gone from TVHeadend', () => {
  const items = [item(1), item(2), item(3), item(4)]
  const episodes = [{ deletedFromTvhAt: 'x' }, ...inTvh(3)]
  const paused = { ...show, rule: { paused: true } }
  const copy = deleteConfirmOf({ variant: 'selected', show: paused, preview: { count: 4, bytes: 16 * GB, items }, episodes, totalCount: 10 })
  assert.equal(copy.title, 'Delete 4 selected episodes of The Block?')
  assert.deepEqual(copy.deleted.map((line) => line.title), ['4 episodes, 16 GB', '3 recordings in TVHeadend'])
  assert.deepEqual(copy.stays, [
    { title: 'The other 6 episodes' },
    { title: 'The series recording', detail: 'Paused, so new episodes do not record' },
  ])
  assert.equal(copy.confirmLabel, 'Delete 4 episodes')
})

test('deleteOutcomeOf: a full delete names the count and the Plex refresh', () => {
  const body = { results: [{ recordingId: 'a', ok: true }, { recordingId: 'b', ok: true }], plex: { tv: { triggered: true } } }
  assert.deepEqual(deleteOutcomeOf({ body }), { kind: 'ok', title: 'Deleted 2 episodes', detail: 'Plex is updating its library', failures: [] })
})

test('deleteOutcomeOf: a partial delete says which failed and why', () => {
  const body = {
    results: [
      { recordingId: 'a', ok: true },
      { recordingId: 'b', ok: false, library: 'failed', error: 'The library folder is read-only' },
      { recordingId: 'c', ok: false, library: 'skipped', error: 'This episode is still recording. Stop it or wait until it finishes.' },
    ],
    plex: { tv: { error: 'ECONNREFUSED' } },
  }
  const outcome = deleteOutcomeOf({ body, labelsById: { b: 'E42', c: 'E43' } })
  assert.equal(outcome.kind, 'partial')
  assert.equal(outcome.title, 'Deleted 1 of 3 episodes')
  assert.equal(outcome.detail, 'Plex did not refresh (ECONNREFUSED)')
  assert.deepEqual(outcome.failures, [
    'E42: The library folder is read-only.',
    'E43: This episode is still recording. Stop it or wait until it finishes.',
  ])
  assert.equal(deleteOutcomeOf({ body: { results: [{ recordingId: 'x', ok: false }] } }).title, 'Could not delete the episode')
})

test('deleteRefusalOf and plexLineOf: a changed count asks for a recheck', () => {
  assert.equal(deleteRefusalOf({ status: 409, data: { count: 4 }, message: 'changed' }).recheck, true)
  assert.deepEqual(deleteRefusalOf({ status: 409, data: {}, message: 'A sync is running. Try again when it finishes.' }), {
    recheck: false,
    message: 'A sync is running. Try again when it finishes.',
  })
  assert.equal(plexLineOf({ tv: { skipped: true } }), '')
})
