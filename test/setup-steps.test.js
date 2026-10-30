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
  const values = stepDoneValues({ tvhUrl: 'http://nas:9981', channels: 1, guideLinked: 22, guideTotal: 24, folderProblems: 0, plexLibrary: 'TV Shows', plexConnected: true })
  assert.deepEqual(values, { tvheadend: 'nas:9981', channels: '1 channel', guide: '22 of 24 channels', folders: 'Checks passed', plex: 'TV Shows' })
  assert.equal(stepDoneValues({ plexConnected: false }).plex, 'Skipped')
})

const READY = {
  tvhUrl: 'http://192.168.1.20:9981',
  tvhUsername: 'freetvarr',
  channels: 24,
  favourites: ['ABC TV', 'SBS'],
  guideLinked: 24,
  guideTotal: 24,
  guideRegion: 'Sydney',
  syncText: 'every 15 minutes',
  plexLibrary: 'TV Shows',
  mediaRoot: '/data/media/tv',
}

test('readySummaryRows: one row per part, all done', () => {
  const rows = readySummaryRows(READY)
  assert.deepEqual(rows.map((row) => row.key), ['tvheadend', 'channels', 'guide', 'recordings'])
  assert.equal(rows[0].value, '192.168.1.20:9981')
  assert.equal(rows[1].meta, 'Favourites: ABC TV, SBS')
  assert.equal(rows[2].value, '24 of 24')
  assert.equal(rows[3].meta, 'Added to your library every 15 minutes')
  assert.equal(isSetupComplete(rows), true)
})

test('readySummaryRows: missing channels or guide offer a way back and block completion', () => {
  const rows = readySummaryRows({ ...READY, channels: 0, guideLinked: 0, plexLibrary: '' })
  assert.deepEqual(rows[1].fix, { step: 'channels', label: 'Go to Channels' })
  assert.deepEqual(rows[2].fix, { step: 'guide', label: 'Go to Guide' })
  assert.equal(rows[3].value, '/data/media/tv')
  assert.equal(rows[3].mono, true)
  assert.equal(isSetupComplete(rows), false)
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
  assert.deepEqual(rows.map((row) => row.key), ['tvheadend', 'channels', 'guide', 'folders', 'plex', 'time-zone'])
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
