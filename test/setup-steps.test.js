import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SETUP_STEPS,
  partFills,
  stepCaption,
  railGroups,
  hostOf,
  stepDoneValues,
  readySummaryRows,
  readyDestinationRows,
  readyImportNote,
  isSetupComplete,
  runStepValue,
  runStepProgress,
  setupDrawerOf,
  setupSettingsRows,
  morphFrames,
} from '../src/web/setup-steps.js'

test('SETUP_STEPS: five steps in three parts', () => {
  assert.deepEqual(SETUP_STEPS.map((step) => step.key), ['tvheadend', 'channels', 'guide', 'folders', 'plex'])
  assert.deepEqual(SETUP_STEPS.map((step) => step.part), [0, 1, 1, 2, 2])
})

test('partFills: the current step fills half its share, finished steps fill all of it', () => {
  assert.deepEqual(partFills(0), [0.5, 0, 0])
  assert.deepEqual(partFills(1), [1, 0.25, 0])
  assert.deepEqual(partFills(2), [1, 0.75, 0])
  assert.deepEqual(partFills(4), [1, 1, 0.75])
  assert.deepEqual(partFills(5), [1, 1, 1])
})

test('stepCaption: names the step and its part, then says setup is done', () => {
  assert.equal(stepCaption(0), 'Step 1 of 5 · Connect')
  assert.equal(stepCaption(2), 'Step 3 of 5 · Tune in')
  assert.equal(stepCaption(5), 'Setup done')
})

test('railGroups: lists finished steps with the values they saved', () => {
  const groups = railGroups({ current: 2, doneValues: { tvheadend: '192.168.1.20:9981', channels: '24 channels', guide: 'x' } })
  assert.deepEqual(groups.map((group) => group.label), ['Connect', 'Tune in', 'Save'])
  assert.deepEqual(groups[0].steps[0], { key: 'tvheadend', title: 'TVHeadend', index: 0, state: 'done', value: '192.168.1.20:9981' })
  assert.equal(groups[1].steps[0].value, '24 channels')
  assert.equal(groups[1].steps[1].state, 'current')
  assert.equal(groups[1].steps[1].value, '')
  assert.equal(groups[2].steps[0].state, 'next')
})

test('hostOf: keeps the host and port of an address', () => {
  assert.equal(hostOf('http://192.168.1.20:9981/'), '192.168.1.20:9981')
  assert.equal(hostOf('192.168.1.20:9981'), '192.168.1.20:9981')
  assert.equal(hostOf(''), '')
})

test('stepDoneValues: short values for the rail', () => {
  const values = stepDoneValues({ tvhUrl: 'http://nas:9981', channels: 1, guideLinked: 22, guideTotal: 24, folderProblems: 0, plexLibraries: { tv: 'TV Shows' }, plexConnected: true })
  assert.deepEqual(values, { tvheadend: 'nas:9981', channels: '1 channel', guide: '22 of 24 channels', folders: 'Checks passed', plex: 'TV Shows' })
  assert.equal(stepDoneValues({ plexConnected: false }).plex, 'Skipped')
  assert.equal(stepDoneValues({ plexConnected: true }).plex, 'Connected')
})

test('stepDoneValues: the rail names every chosen Plex library once', () => {
  const all = { tv: 'TV Shows', movies: 'Movies', oneoff: 'One-offs' }
  assert.equal(stepDoneValues({ plexLibraries: all, plexConnected: true }).plex, 'TV Shows, Movies, One-offs')
  assert.equal(stepDoneValues({ plexLibraries: { tv: 'TV Shows', movies: 'Films', oneoff: 'Films' }, plexConnected: true }).plex, 'TV Shows, Films')
})

const READY = {
  tvhUrl: 'http://192.168.1.20:9981',
  tvhUsername: 'freetvarr',
  channels: 24,
  favourites: ['ABC TV', 'SBS'],
  guideLinked: 24,
  guideTotal: 24,
  guideRegion: 'Sydney',
}

const FOLDERS = {
  mediaRoot: '/data/media/tv',
  moviesRoot: '/data/media/movies',
  oneOffRoot: '/data/media/one-offs',
  importUnmatched: true,
}

const PLEX_ALL = { tv: 'TV Shows', movies: 'Movies', oneoff: 'One-offs' }

test('readySummaryRows: one row per part, all done', () => {
  const rows = readySummaryRows(READY)
  assert.deepEqual(rows.map((row) => row.key), ['tvheadend', 'channels', 'guide'])
  assert.equal(rows[0].value, '192.168.1.20:9981')
  assert.equal(rows[1].meta, 'Favourites: ABC TV, SBS')
  assert.equal(rows[2].value, '24 of 24')
  assert.equal(isSetupComplete(rows), true)
})

test('readySummaryRows: missing channels or guide offer a way back and block completion', () => {
  const rows = readySummaryRows({ ...READY, channels: 0, guideLinked: 0 })
  assert.deepEqual(rows[1].fix, { step: 'channels', label: 'Go to Channels' })
  assert.deepEqual(rows[2].fix, { step: 'guide', label: 'Go to Guide' })
  assert.equal(isSetupComplete(rows), false)
})

test('readyDestinationRows: each folder with its Plex library', () => {
  const rows = readyDestinationRows({ ...FOLDERS, plexLibraries: PLEX_ALL })
  assert.deepEqual(rows, [
    { key: 'tv', title: 'TV episodes', meta: '/data/media/tv', mono: true, value: 'TV Shows', note: '' },
    { key: 'movies', title: 'Movies', meta: '/data/media/movies', mono: true, value: 'Movies', note: '' },
    { key: 'oneoff', title: 'One-offs', meta: '/data/media/one-offs', mono: true, value: 'One-offs', note: '' },
  ])
})

test('readyDestinationRows: with no movies folder, movies save to One-offs', () => {
  const rows = readyDestinationRows({ ...FOLDERS, moviesRoot: '', plexLibraries: { tv: 'TV Shows', movies: 'Movies' } })
  assert.equal(rows[1].meta, 'No movies folder, so movies save to One-offs')
  assert.equal(rows[1].mono, false)
  assert.equal(rows[1].value, '')
  assert.equal(rows[0].value, 'TV Shows')
  assert.equal(rows[2].value, '')
})

test('readyDestinationRows: without Plex, rows show only the folder', () => {
  const rows = readyDestinationRows(FOLDERS)
  assert.deepEqual(rows.map((row) => row.value), ['', '', ''])
  assert.deepEqual(rows.map((row) => row.meta), ['/data/media/tv', '/data/media/movies', '/data/media/one-offs'])
})

test('readyDestinationRows: with Import every recording off, movies and one-offs say what still saves', () => {
  const note = 'Import every recording is off, so only your series and recordings with Add to library on save here.'
  const rows = readyDestinationRows({ ...FOLDERS, importUnmatched: false })
  assert.deepEqual(rows.map((row) => row.note), ['', note, note])
  const noMovies = readyDestinationRows({ ...FOLDERS, moviesRoot: '', importUnmatched: false })
  assert.deepEqual(noMovies.map((row) => row.note), ['', '', note])
})

test('readyDestinationRows: an empty folder reads Not set', () => {
  const rows = readyDestinationRows({ ...FOLDERS, mediaRoot: '' })
  assert.equal(rows[0].meta, 'Not set')
  assert.equal(rows[0].mono, false)
})

test('readyImportNote: uses the sync interval', () => {
  assert.equal(readyImportNote('every 15 minutes'), 'Freetvarr imports new recordings every 15 minutes.')
  assert.equal(readyImportNote('on your sync schedule'), 'Freetvarr imports new recordings on your sync schedule.')
})

test('runStepValue: hides zero counts', () => {
  assert.equal(runStepValue({ id: 'scan', detail: { frequencies: 8, scanned: 0 } }), '')
  assert.equal(runStepValue({ id: 'scan', detail: { frequencies: 8, scanned: 3 } }), '3 of 8')
  assert.equal(runStepValue({ id: 'map', detail: { total: 0 } }), 'Nothing new')
  assert.equal(runStepValue({ id: 'map', detail: { total: 30, ok: 0, fail: 0 } }), '')
  assert.equal(runStepValue({ id: 'map', detail: { total: 30, ok: 10, fail: 2 } }), '12 of 30')
  assert.equal(runStepValue({ id: 'download', detail: { expected: 171, found: 40 } }), '40 of 171')
  assert.equal(runStepValue({ id: 'tuners' }), '')
})

test('runStepProgress: only running steps with a known total show a bar', () => {
  assert.equal(runStepProgress({ id: 'scan', status: 'running', detail: { frequencies: 8, scanned: 2 } }), 0.25)
  assert.equal(runStepProgress({ id: 'scan', status: 'done', detail: { frequencies: 8, scanned: 8 } }), null)
  assert.equal(runStepProgress({ id: 'tuners', status: 'running' }), null)
})

test('setupDrawerOf: opens a known drawer from the setup page link', () => {
  assert.equal(setupDrawerOf(['system', 'setup', 'channels']), 'channels')
  assert.equal(setupDrawerOf(['system', 'setup', 'nope']), '')
  assert.equal(setupDrawerOf(['system', 'health', 'channels']), '')
})

test('setupSettingsRows: shows what Freetvarr uses now', () => {
  const rows = setupSettingsRows({
    settings: { tvh_url: 'http://192.168.1.20:9981', tvh_username: 'freetvarr', time_zone: 'Australia/Sydney', tz_source: 'setting' },
    channelStatus: { channels: 24, networks: [{ name: 'au-Sydney_ArtarmonBridge' }] },
    guideStatus: { suggestion: { available: true, linked: 24, channels: 24, url: 'u', feeds: [{ url: 'u', region: 'Sydney' }] } },
    folders: { problems: [], notes: [] },
  })
  const byKey = Object.fromEntries(rows.map((row) => [row.key, row]))
  assert.deepEqual(rows.map((row) => row.key), ['tvheadend', 'channels', 'guide', 'folders', 'plex', 'time-zone', 'hostnames'])
  assert.equal(byKey.tvheadend.meta, 'Signs in as freetvarr')
  assert.equal(byKey.channels.meta, 'Sydney ArtarmonBridge')
  assert.equal(byKey.guide.meta, 'Sydney')
  assert.equal(byKey.folders.tone, 'ok')
  assert.equal(byKey.plex.tone, '')
  assert.equal(byKey['time-zone'].value, 'Australia/Sydney')
})

test('setupSettingsRows: unknown parts stay neutral while loading, missing parts warn', () => {
  const rows = setupSettingsRows({ settings: {}, channelStatus: { channels: 0 } })
  assert.equal(rows[0].tone, 'warn')
  assert.equal(rows[1].tone, 'warn')
  assert.equal(rows[2].tone, '')
  assert.equal(rows[2].meta, 'Checking…')
})

test('setupSettingsRows: the Allowed hostnames row counts the names and warns about unknown names and *', () => {
  const rowOf = (hosts) => setupSettingsRows({ hosts }).find((row) => row.key === 'hostnames')
  assert.equal(rowOf(null).meta, 'Checking…')
  assert.deepEqual(
    (({ title, meta, value, tone }) => ({ title, meta, value, tone }))(rowOf({ hosts: [], env_hosts: [], any_host: false, seen: [] })),
    { title: 'Allowed hostnames', meta: 'IP addresses and local names always work', value: '', tone: '' },
  )
  const added = rowOf({ hosts: ['a.example.com'], env_hosts: ['b.example.com'], any_host: false, seen: [] })
  assert.equal(added.value, '2')
  assert.equal(added.tone, 'ok')
  const unknown = rowOf({ hosts: [], env_hosts: [], any_host: false, seen: [{ name: 'tv.example.com' }] })
  assert.equal(unknown.meta, 'Opened as tv.example.com, which 3.0.0 will refuse')
  assert.equal(unknown.tone, 'warn')
  const anyName = rowOf({ hosts: ['*'], env_hosts: [], any_host: true, seen: [] })
  assert.equal(anyName.meta, 'Answers to any name')
  assert.equal(anyName.tone, 'warn')
  assert.equal(setupDrawerOf(['system', 'setup', 'hostnames']), 'hostnames')
})

test('morphFrames: maps a chip box onto its bar and keeps the visible corner radius', () => {
  const frames = morphFrames({
    from: { left: 16, top: 12, width: 60, height: 6 },
    to: { left: 16, top: 100, width: 30, height: 24 },
    fromRadius: 2,
    toRadius: 3,
  })
  assert.equal(frames.x, 15)
  assert.equal(frames.y, -97)
  assert.equal(frames.sx, 2)
  assert.equal(frames.sy, 0.25)
  assert.equal(frames.startRadius, '1px / 8px')
  assert.equal(frames.endRadius, '3px')
})
