import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  folderRows,
  storageCheckOutcome,
  storageSummaryText,
  changedSettings,
  prefillPlexSections,
  visiblePlexSectionRows,
  plexSectionOptions,
  plexSectionSettings,
} from '../src/web/setup-folders.js'

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

const PLAN = [
  { kind: 'tv', location: '/data/media/tv', existing: { key: '2', title: 'TV Shows' } },
  { kind: 'oneoff', location: '/data/media/oneoffs', existing: { key: '5', title: 'One-offs' } },
  { kind: 'movies', location: '/data/media/movies', existing: null },
]
const NO_PICKS = { tv: '', oneoff: '', movies: '' }

test('prefillPlexSections: fills each empty pick with the library at its folder', () => {
  assert.deepEqual(prefillPlexSections({ picks: NO_PICKS, plan: PLAN }), { tv: '2', oneoff: '5', movies: '' })
})

test('prefillPlexSections: keeps saved picks', () => {
  const picks = { tv: '9', oneoff: '', movies: '7' }
  assert.deepEqual(prefillPlexSections({ picks, plan: PLAN }), { tv: '9', oneoff: '5', movies: '7' })
})

test('prefillPlexSections: keeps picks when Plex has no plan', () => {
  assert.deepEqual(prefillPlexSections({ picks: { tv: '3', oneoff: '', movies: '' }, plan: null }), { tv: '3', oneoff: '', movies: '' })
})

test('visiblePlexSectionRows: hides a kind with no folder and no saved pick', () => {
  const plan = PLAN.filter((lib) => lib.kind !== 'movies')
  const labels = (picks) => visiblePlexSectionRows({ picks, plan }).map((row) => row.label)
  assert.deepEqual(labels(NO_PICKS), ['TV library', 'One-off library'])
  assert.deepEqual(labels({ ...NO_PICKS, movies: '7' }), ['TV library', 'Movies library', 'One-off library'])
  assert.deepEqual(visiblePlexSectionRows({ picks: NO_PICKS, plan: null }).map((row) => row.kind), ['tv'])
})

test('plexSectionOptions: lists sections of the row type plus the current pick', () => {
  const sections = [
    { key: '2', title: 'TV Shows', type: 'show' },
    { key: '5', title: 'One-offs', type: 'movie' },
    { key: '8', title: 'Music', type: 'artist' },
  ]
  assert.deepEqual(plexSectionOptions({ sections, type: 'movie', pick: '' }).map((sec) => sec.key), ['5'])
  assert.deepEqual(plexSectionOptions({ sections, type: 'show', pick: '8' }).map((sec) => sec.key), ['2', '8'])
})

test('plexSectionSettings: saves all three section ids, blank when cleared', () => {
  assert.deepEqual(plexSectionSettings({ tv: '2', oneoff: '', movies: '7' }), {
    plex_tv_section_id: '2',
    plex_oneoff_section_id: '',
    plex_movies_section_id: '7',
  })
})
