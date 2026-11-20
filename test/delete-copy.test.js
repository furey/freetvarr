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
const textOf = (line) => [line.title, line.detail].filter(Boolean).join(' · ')
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
  assert.equal(copy.deleted.length, 2)
  assert.match(textOf(copy.deleted[0]), /10 episodes.*41 GB.*library and Plex/)
  assert.match(textOf(copy.deleted[1]), /TVHeadend/)
  assert.equal(copy.stays.length, 2)
  assert.match(textOf(copy.stays[0]), /series recording.*9HD/)
  assert.match(textOf(copy.stays[1]), /other shows/)
  assert.equal(copy.confirmLabel, 'Delete 10 episodes')
  assert.equal(copy.offersStopSeries, true)
  assert.equal(copy.missingNote, '')
})

test('deleteConfirmOf: stopping the series moves it to what gets deleted', () => {
  const copy = deleteConfirmOf({ variant: 'all', show, preview: { count: 1, bytes: GB, items: [item(1)] }, episodes: inTvh(1), totalCount: 1, stopSeries: true })
  assert.equal(copy.title, 'Delete the only episode of The Block?')
  assert.match(textOf(copy.deleted.at(-1)), /series recording.*stop recording/)
  assert.equal(copy.stays.length, 1)
  assert.doesNotMatch(textOf(copy.stays[0]), /series recording/)
})

test('deleteConfirmOf: a single episode keeps the others and the series', () => {
  const copy = deleteConfirmOf({ variant: 'episode', show, preview: { count: 1, bytes: 4.1 * GB, items: [item(44)] }, episodes: inTvh(1), totalCount: 10 })
  assert.equal(copy.title, 'Delete this episode?')
  assert.equal(copy.deleted.length, 2)
  assert.match(textOf(copy.deleted[0]), /4\.1 GB.*library and Plex/)
  assert.match(textOf(copy.deleted[1]), /TVHeadend/)
  assert.match(textOf(copy.stays[0]), /\b9 episodes\b/)
  assert.equal(copy.confirmLabel, 'Delete episode')
  assert.equal(copy.offersStopSeries, false)
})

test('deleteConfirmOf: watched episodes are listed, and a missing file gets a note', () => {
  const items = [item(41, { missing: true }), item(42), item(43)]
  const copy = deleteConfirmOf({ variant: 'watched', show, preview: { count: 3, bytes: 8.2 * GB, missingCount: 1, items }, episodes: inTvh(3), totalCount: 10 })
  assert.equal(copy.title, 'Delete 3 watched episodes of The Block?')
  assert.equal(copy.deleted.length, 2)
  assert.match(copy.deleted[0].title, /E42 and E43.*8\.2 GB/)
  assert.doesNotMatch(copy.deleted[0].title, /E41/)
  assert.match(copy.deleted[1].title, /\b3 recordings in TVHeadend/)
  assert.match(copy.missingNote, /E41/)
  assert.match(copy.missingNote, /only its TVHeadend recording/)
  assert.match(textOf(copy.stays[0]), /\b7 unwatched episodes/)
})

test('deleteConfirmOf: selected episodes, a paused series, and rows already gone from TVHeadend', () => {
  const items = [item(1), item(2), item(3), item(4)]
  const episodes = [{ deletedFromTvhAt: 'x' }, ...inTvh(3)]
  const paused = { ...show, rule: { paused: true } }
  const copy = deleteConfirmOf({ variant: 'selected', show: paused, preview: { count: 4, bytes: 16 * GB, items }, episodes, totalCount: 10 })
  assert.equal(copy.title, 'Delete 4 selected episodes of The Block?')
  assert.equal(copy.deleted.length, 2)
  assert.match(copy.deleted[0].title, /\b4 episodes.*16 GB/)
  assert.match(copy.deleted[1].title, /\b3 recordings in TVHeadend/)
  assert.equal(copy.stays.length, 2)
  assert.match(textOf(copy.stays[0]), /\b6 episodes/)
  assert.match(textOf(copy.stays[1]), /series recording.*Paused/)
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
