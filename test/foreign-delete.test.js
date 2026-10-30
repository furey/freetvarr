import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  combineResults,
  foreignTargetsOf,
  groupByFile,
  keepsRecording,
  previewForeign,
  removeSeriesFromSonarr,
  routeOf,
  runForeign,
  versionChoicesFrom,
} from '../src/foreign-delete.js'
import { ArrError } from '../src/arr-client.js'

const tmp = async () => fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-foreign-')))

const sonarrVersion = (patch = {}) => ({ itemId: 'plex-7', partId: 'p7', filePath: '/tv/a.mkv', sizeBytes: 2, manager: 'sonarr', managerFileId: 70, managerItemId: null, managerSeriesId: 5, sectionId: '2', ...patch })

const fakeSonarr = ({ failDelete = null, failUnmonitor = null, episodes = [{ id: 1, monitored: true }, { id: 2, monitored: true }] } = {}) => {
  const calls = []
  return {
    calls,
    episodesOfFile: async (id) => {
      calls.push(['episodes', id])
      return episodes
    },
    unmonitorEpisodes: async (ids) => {
      calls.push(['unmonitor', ids])
      if (failUnmonitor) throw failUnmonitor
    },
    monitorEpisodes: async (ids) => calls.push(['monitor', ids]),
    deleteEpisodeFile: async (id) => {
      calls.push(['delete', id])
      if (failDelete) throw failDelete
    },
    deleteSeries: async (id) => calls.push(['series', id]),
  }
}

test('versionChoicesFrom: only both, recording, or other', () => {
  assert.deepEqual(versionChoicesFrom({}), { choices: {} })
  assert.deepEqual(versionChoicesFrom({ versions: { r1: 'other' } }), { choices: { r1: 'other' } })
  assert.ok(versionChoicesFrom({ versions: { r1: 'all' } }).error)
  assert.ok(versionChoicesFrom({ versions: ['x'] }).error)
})

test('foreignTargetsOf and keepsRecording: the version choice decides which copies go', () => {
  const recordingRow = { recording_id: 'r1', other_versions: [sonarrVersion()] }
  const plexRow = { recording_id: 'plex-8', source: 'plex', versions: [sonarrVersion({ filePath: '/tv/b.mkv' })] }
  assert.equal(foreignTargetsOf({ rows: [recordingRow, plexRow] }).length, 2)
  assert.equal(foreignTargetsOf({ rows: [recordingRow], choices: { r1: 'recording' } }).length, 0)
  assert.equal(keepsRecording({ row: recordingRow, choices: { r1: 'other' } }), false)
  assert.equal(keepsRecording({ row: recordingRow }), true)
  assert.equal(keepsRecording({ row: plexRow }), false)
})

test('groupByFile: a file holding two episodes is deleted once for both', () => {
  const groups = groupByFile([
    { recordingId: 'plex-1', filePath: '/tv/S01E01-E02.mkv' },
    { recordingId: 'plex-2', filePath: '/tv/S01E01-E02.mkv' },
  ])
  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0].recordingIds, ['plex-1', 'plex-2'])
})

test('routeOf: a managed file needs its app connected; an unmanaged file goes to the disk', () => {
  assert.equal(routeOf({ target: { manager: 'sonarr' }, connected: { sonarr: true } }), 'sonarr')
  assert.equal(routeOf({ target: { manager: 'radarr' }, connected: { radarr: false } }), 'not-connected')
  assert.equal(routeOf({ target: { manager: null }, connected: {} }), 'disk')
})

test('previewForeign: reports size, hard links, files outside the library, and the episodes a file holds', async () => {
  const dir = await tmp()
  const tv = path.join(dir, 'tv')
  await fs.mkdir(path.join(tv, 'Show'), { recursive: true })
  const single = path.join(tv, 'Show', 'a.ts')
  const linked = path.join(tv, 'Show', 'b.ts')
  await fs.writeFile(single, 'x'.repeat(10))
  await fs.writeFile(linked, 'y'.repeat(20))
  await fs.link(linked, path.join(dir, 'other.ts'))
  const files = await previewForeign({
    targets: [
      { recordingId: 'plex-1', filePath: single, manager: null },
      { recordingId: 'plex-2', filePath: linked, manager: null },
      { recordingId: 'plex-3', filePath: '/elsewhere/c.ts', manager: null },
    ],
    roots: { tv },
    connected: {},
    coversOf: async (file) => (file === single ? [{ season: 1, episode: 1 }, { season: 1, episode: 2 }] : []),
  })
  assert.deepEqual(files.map((file) => [file.bytes, file.hardlinked, file.outside, file.covers.length]), [
    [10, false, false, 2],
    [0, true, false, 0],
    [0, false, true, 0],
  ])
  await fs.rm(dir, { recursive: true, force: true })
})

test('runForeign: Sonarr unmonitors the episodes, then deletes the file, then the Plex rows go', async () => {
  const sonarr = fakeSonarr()
  const removed = []
  const outcomes = await runForeign({
    targets: [{ recordingId: 'plex-7', ...sonarrVersion() }],
    roots: {},
    connected: { sonarr: true },
    clientFor: async () => sonarr,
    unmonitor: true,
    removeParts: async (file) => removed.push(file),
  })
  assert.deepEqual(sonarr.calls, [['episodes', 70], ['unmonitor', [1, 2]], ['delete', 70]])
  assert.equal(outcomes[0].ok, true)
  assert.equal(outcomes[0].recycled, true)
  assert.deepEqual(removed, ['/tv/a.mkv'])
})

test('runForeign: a failed unmonitor deletes nothing; a failed delete monitors again', async () => {
  const refused = fakeSonarr({ failUnmonitor: new ArrError('Sonarr HTTP 500', { app: 'sonarr' }) })
  const first = await runForeign({ targets: [{ recordingId: 'plex-7', ...sonarrVersion() }], roots: {}, connected: { sonarr: true }, clientFor: async () => refused, unmonitor: true, removeParts: async () => {} })
  assert.equal(first[0].ok, false)
  assert.equal(refused.calls.some(([name]) => name === 'delete'), false)
  const conflict = fakeSonarr({ failDelete: new ArrError('Sonarr refused: root folder missing', { app: 'sonarr', kind: 'conflict', status: 409 }) })
  const second = await runForeign({ targets: [{ recordingId: 'plex-7', ...sonarrVersion() }], roots: {}, connected: { sonarr: true }, clientFor: async () => conflict, unmonitor: true, removeParts: async () => {} })
  assert.equal(second[0].ok, false)
  assert.match(second[0].error, /root folder missing/)
  assert.deepEqual(conflict.calls.at(-1), ['monitor', [1, 2]])
})

test('runForeign: a file Sonarr no longer has counts as done; without unmonitor it only deletes', async () => {
  const gone = fakeSonarr({ failDelete: new ArrError('Sonarr has no such item', { app: 'sonarr', kind: 'missing', status: 404 }) })
  const outcomes = await runForeign({ targets: [{ recordingId: 'plex-7', ...sonarrVersion() }], roots: {}, connected: { sonarr: true }, clientFor: async () => gone, unmonitor: false, removeParts: async () => {} })
  assert.equal(outcomes[0].ok, true)
  assert.equal(outcomes[0].status, 'missing')
  assert.deepEqual(gone.calls, [['delete', 70]])
})

test('runForeign: an unconnected manager leaves the file alone; an unmanaged file is deleted from the disk', async () => {
  const dir = await tmp()
  const tv = path.join(dir, 'tv')
  await fs.mkdir(path.join(tv, 'Show'), { recursive: true })
  const file = path.join(tv, 'Show', 'x.ts')
  await fs.writeFile(file, 'abc')
  const outcomes = await runForeign({
    targets: [
      { recordingId: 'plex-1', filePath: '/tv/managed.mkv', manager: 'radarr', managerFileId: 3 },
      { recordingId: 'plex-2', filePath: file, manager: null },
    ],
    roots: { tv },
    connected: { radarr: false },
    clientFor: async () => null,
    unmonitor: true,
    removeParts: async () => {},
  })
  assert.equal(outcomes[0].ok, false)
  assert.match(outcomes[0].error, /Radarr is not connected/)
  assert.equal(outcomes[1].ok, true)
  assert.equal(outcomes[1].bytes, 3)
  await assert.rejects(fs.stat(file))
  await fs.rm(dir, { recursive: true, force: true })
})

test('removeSeriesFromSonarr and combineResults: per-step results join the recording result', async () => {
  const sonarr = fakeSonarr()
  assert.deepEqual(await removeSeriesFromSonarr({ seriesIds: [5], client: sonarr }), [{ seriesId: 5, ok: true }])
  const results = combineResults({
    recordingResults: [{ recordingId: 'r1', ok: true, library: 'deleted', tvh: 'removed', bytesFreed: 4, error: null }],
    foreign: [
      { recordingIds: ['r1'], ok: false, route: 'sonarr', status: 'failed', bytes: 0, error: 'Sonarr did not delete it' },
      { recordingIds: ['plex-8'], ok: true, route: 'disk', status: 'deleted', bytes: 3 },
    ],
    requestedIds: ['r1', 'plex-8'],
  })
  assert.equal(results[0].ok, false)
  assert.equal(results[0].error, 'Sonarr did not delete it')
  assert.equal(results[1].ok, true)
  assert.equal(results[1].bytesFreed, 3)
})
