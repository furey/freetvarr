import { test } from 'node:test'
import assert from 'node:assert/strict'
import { folderRows, storageCheckOutcome, storageSummaryText, changedSettings } from '../src/web/setup-folders.js'

const FOLDERS = { mediaRoot: '/data/media/tv', recordingsRoot: '/data/recordings', tvhRecordingsPath: '/recordings' }

test('folderRows: one row per folder with its check result', () => {
  const rows = folderRows({
    folders: FOLDERS,
    library: { ok: true },
    recordings: { ok: true },
    tvh: { ok: true, configured: true, matches: true, tvhPath: '/recordings' },
  })
  assert.deepEqual(rows.map((row) => [row.title, row.path, row.value, row.ok]), [
    ['TV library', '/data/media/tv', 'Writable', true],
    ['Recordings, as Freetvarr sees them', '/data/recordings', 'Readable', true],
    ['Recordings, as TVHeadend sees them', '/recordings', 'Matches', true],
  ])
})

test('folderRows: a mismatch or failure shows as a problem', () => {
  const rows = folderRows({
    folders: FOLDERS,
    library: { ok: false, problem: 'missing' },
    recordings: { ok: true },
    tvh: { ok: true, configured: true, matches: false, tvhPath: '/rec' },
  })
  assert.equal(rows[0].value, 'Problem')
  assert.equal(rows[2].value, 'Different')
  assert.equal(rows[2].ok, false)
})

test('storageCheckOutcome: problems point at Change folders', () => {
  const outcome = storageCheckOutcome({
    folders: FOLDERS,
    library: { ok: false, problem: 'empty' },
    recordings: { ok: true, hardlinks: false },
    tvh: { ok: true, configured: true, matches: true, tvhPath: '/recordings' },
  })
  assert.equal(outcome.problems[0].fix, 'Press Change folders and correct the TV library folder.')
  assert.equal(outcome.notes.length, 1)
})

test('storageSummaryText: names the install folder for the default layout', () => {
  assert.match(storageSummaryText({ mediaRoot: '/data/media/tv', recordingsRoot: '/data/recordings' }), /folder you installed Freetvarr to/)
  assert.match(storageSummaryText({ mediaRoot: '/media/tv', recordingsRoot: '/data/recordings' }), /reads recordings from \/data\/recordings/)
})

test('changedSettings: keeps only changed values', () => {
  assert.deepEqual(changedSettings([['a', '1', '1'], ['b', '2', '3']]), { b: '2' })
})
