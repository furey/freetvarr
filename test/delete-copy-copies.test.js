import { test } from 'node:test'
import assert from 'node:assert/strict'

import { deleteConfirmOf, deleteOutcomeOf } from '../src/web/delete-copy.js'

const GB = 1e9
const show = { title: 'The Block', rule: { paused: false, channels: ['9HD'] } }
const item = (episode, overrides = {}) => ({ recordingId: `e${episode}`, title: 'The Block', episodeTitle: null, season: 22, episode, bytes: 4 * GB, missing: false, ...overrides })
const inTvh = (count) => Array.from({ length: count }, () => ({ deletedFromTvhAt: null }))
const sonarrCopy = (patch = {}) => ({ route: 'sonarr', manager: 'sonarr', filePath: '/tv/The Block/Season 22/E41.mkv', bytes: 2.2 * GB, sizeBytes: 2.2 * GB, hardlinked: false, missing: false, outside: false, covers: [], ...patch })

test('deleteConfirmOf: a Sonarr-only episode is deleted through Sonarr, which stops monitoring it', () => {
  const items = [item(34, { recording: false, source: 'plex', copies: [sonarrCopy({ bytes: 2.9 * GB, sizeBytes: 2.9 * GB })] })]
  const copy = deleteConfirmOf({ variant: 'episode', show, preview: { count: 1, bytes: 2.9 * GB, items, unmonitor: true, recycleBin: { sonarr: { on: true, days: 7 } } }, episodes: [{ source: 'plex', deletedFromTvhAt: 'x' }], totalCount: 10 })
  assert.equal(copy.title, 'Delete this episode?')
  assert.deepEqual(copy.deleted, [
    { title: 'The file', detail: '2.9 GB, deleted through Sonarr' },
    { title: 'Sonarr monitoring for E34', detail: 'Sonarr stops looking for E34, so it does not download it again' },
  ])
  assert.equal(copy.undoText, 'Sonarr keeps deleted files in its recycle bin for 7\u00a0days.')
  assert.deepEqual(copy.stays.at(-1), { title: 'The rest of The Block in Sonarr', detail: 'New episodes still download' })
  assert.equal(copy.confirmLabel, 'Delete episode')
})

test('deleteConfirmOf: a recording with a Sonarr copy offers Both, Recording, or the Sonarr copy', () => {
  const items = [item(41, { recording: true, bytes: 4.1 * GB, canChoose: true, otherManager: 'sonarr', copies: [sonarrCopy()] })]
  const copy = deleteConfirmOf({ variant: 'episode', show, preview: { count: 1, bytes: 6.3 * GB, items, unmonitor: true, recycleBin: { sonarr: { on: true, days: 7 } } }, episodes: [{ deletedFromTvhAt: null, filePath: '/tv/The Block - S22E41.ts' }], totalCount: 10 })
  assert.deepEqual(copy.chooser.map((option) => option.label), ['Both', 'Recording', 'Sonarr copy'])
  assert.deepEqual(copy.deleted, [
    { title: 'The recording', detail: '4.1 GB', path: 'The Block - S22E41.ts' },
    { title: 'Its recording in TVHeadend' },
    { title: 'The Sonarr copy', detail: '2.2 GB, deleted through Sonarr, which stops monitoring E41' },
  ])
  assert.equal(copy.undoText, 'Sonarr keeps its copy in its recycle bin for 7\u00a0days. The recording cannot be undone.')
  assert.equal(copy.confirmLabel, 'Delete both')
  assert.equal(deleteConfirmOf({ variant: 'episode', show, preview: { count: 1, items }, episodes: [], choice: 'other' }).confirmLabel, 'Delete sonarr copy')
})

test('deleteConfirmOf: an unmanaged file names its path, a hard link frees no space, and a two-episode file says so', () => {
  const disk = { route: 'disk', manager: null, filePath: '/tv/The Block/Season 22/S22 E9.ts', bytes: 0, sizeBytes: 3.1 * GB, hardlinked: true, covers: [{ episode: 9 }, { episode: 10 }] }
  const copy = deleteConfirmOf({ variant: 'episode', show, preview: { count: 1, items: [item(9, { recording: false, copies: [disk] })], recycleBin: {} }, episodes: [], totalCount: 10 })
  assert.equal(copy.title, 'Delete this file?')
  assert.deepEqual(copy.deleted, [{ title: 'The file', detail: '3.1 GB · one file holds E9 and E10', path: '/tv/The Block/Season 22/S22 E9.ts' }])
  assert.equal(copy.notes[0], 'No app manages this file, so Freetvarr deletes it from the disk. Plex removes the episode at its next scan.')
  assert.equal(copy.notes[1], 'Another copy of this file stays on the disk, so deleting it frees no space.')
  assert.equal(copy.undoText, "You can't undo this.")
  assert.equal(copy.confirmLabel, 'Delete file')
})

test('deleteConfirmOf: deleting a whole show counts files per source and offers removing the Sonarr series', () => {
  const items = [
    item(1, { copies: [] }),
    item(2, { recording: false, copies: [sonarrCopy({ filePath: '/a' })] }),
    item(3, { recording: false, copies: [sonarrCopy({ filePath: '/b' })] }),
    item(4, { recording: false, copies: [{ route: 'not-connected', manager: 'radarr', filePath: '/c' }] }),
  ]
  const copy = deleteConfirmOf({ variant: 'all', show, preview: { count: 4, items, unmonitor: true, sonarrSeries: [{ id: 5 }] }, episodes: inTvh(1), totalCount: 4, removeSeries: true })
  assert.equal(copy.offersRemoveSeries, true)
  assert.ok(copy.deleted.some((line) => line.title === '2 files from Sonarr'))
  assert.deepEqual(copy.deleted.at(-1), { title: 'The series in Sonarr', detail: 'Sonarr stops downloading new episodes' })
  assert.match(copy.notes.at(-1), /Radarr is not connected/)
})

test('deleteOutcomeOf: names the recycle bin when a copy went to it', () => {
  const outcome = deleteOutcomeOf({
    body: { results: [{ recordingId: 'e1', ok: true, copies: [{ route: 'sonarr', ok: true, recycled: true }] }], plex: {} },
    recycleBin: { sonarr: { on: true, days: 7 } },
  })
  assert.equal(outcome.detail, 'Sonarr keeps it in its recycle bin for 7\u00a0days')
})
