import assert from 'node:assert/strict'
import test from 'node:test'

import { recheckManagers } from '../src/delete-manager-check.js'

const lookupOf = (byPath, checked = ['sonarr']) => ({
  managerOf: async ({ filePath }) => ({ found: byPath[filePath] ?? null, checked }),
})

const SONARR_ENTRY = { manager: 'sonarr', path: '/tv/A/x.mkv', fileId: 9, itemId: null, seriesId: 3 }

test('recheckManagers: a live Sonarr answer replaces a stale link, and an unlinked file goes back to the disk', async () => {
  const checked = await recheckManagers({
    targets: [{ recordingId: 'plex-1', filePath: '/media/A/x.mkv', manager: null }, { recordingId: 'plex-2', filePath: '/media/B/y.mkv', manager: 'sonarr', managerFileId: 5 }],
    recordingRows: [],
    lookup: lookupOf({ '/media/A/x.mkv': SONARR_ENTRY }),
    kindOfTarget: () => 'episode',
    kindOfRow: () => 'tv',
  })
  assert.deepEqual(checked.targets.map((target) => [target.recordingId, target.manager, target.managerFileId]), [['plex-1', 'sonarr', 9], ['plex-2', null, null]])
  assert.equal(checked.blocked, null)
})

test('recheckManagers: keeps the stored link for an app that is not connected', async () => {
  const checked = await recheckManagers({
    targets: [{ recordingId: 'plex-1', filePath: '/media/A/x.mkv', manager: 'radarr', managerFileId: 5 }],
    recordingRows: [],
    lookup: lookupOf({}, []),
    kindOfTarget: () => 'movie',
    kindOfRow: () => null,
  })
  assert.equal(checked.targets[0].manager, 'radarr')
})

test('recheckManagers: a recording Sonarr manages becomes a Sonarr target; one still recording is left to the recording delete', async () => {
  const checked = await recheckManagers({
    targets: [],
    recordingRows: [{ recording_id: 'r1', file_path: '/media/A/x.mkv' }, { recording_id: 'live', file_path: '/media/A/x.mkv' }, { recording_id: 'r2', file_path: '/media/B/z.ts' }],
    lookup: lookupOf({ '/media/A/x.mkv': SONARR_ENTRY }),
    kindOfTarget: () => null,
    kindOfRow: () => 'tv',
    activeIds: new Set(['live']),
  })
  assert.deepEqual(checked.targets.map((target) => [target.recordingId, target.manager, target.recording]), [['r1', 'sonarr', true]])
  assert.deepEqual([...checked.managedRecordingIds], ['r1'])
})

test('recheckManagers: an unreachable app blocks the delete with a plain reason', async () => {
  const checked = await recheckManagers({
    targets: [{ recordingId: 'plex-1', filePath: '/media/A/x.mkv' }],
    recordingRows: [],
    lookup: { managerOf: async () => { throw Object.assign(new Error('Sonarr did not answer (ECONNREFUSED)'), { app: 'sonarr' }) } },
    kindOfTarget: () => 'episode',
    kindOfRow: () => null,
  })
  assert.equal(checked.blocked, 'Freetvarr could not check whether Sonarr manages these files, so nothing was deleted. Sonarr did not answer (ECONNREFUSED). Try again when Sonarr answers.')
})
