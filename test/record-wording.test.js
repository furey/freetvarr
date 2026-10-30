import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canRecordSeriesOf, recordKindOf, recordWordingOf } from '../src/web/record-wording.js'
import { guideMatchMenuOf, onNowMenuOf, scheduledMenuOf, skippedTextOf } from '../src/web/home-menus.js'
import { sheetStrengthsFor, strengthLineOf } from '../src/web/programme-sheet.js'

const labelsOf = (groups) => groups.flat().map((item) => item.label)

test('recordKindOf: falls back to series wording, and a series rule always means series', () => {
  assert.equal(recordKindOf({ kind: 'movie' }), 'movie')
  assert.equal(recordKindOf({ kind: 'one-off' }), 'one-off')
  assert.equal(recordKindOf({ kind: null }), 'series')
  assert.equal(recordKindOf({ kind: 'toString' }), 'series')
  assert.equal(recordKindOf(), 'series')
  assert.equal(recordKindOf({ kind: 'one-off', hasRule: true }), 'series')
})

test('recordWordingOf: menu labels per kind', () => {
  assert.equal(recordWordingOf({ kind: 'movie' }).menuLabel, 'Record this movie')
  assert.equal(recordWordingOf({ kind: 'one-off' }).menuLabel, 'Record')
  assert.equal(recordWordingOf({ kind: 'series' }).menuLabel, 'Record this episode')
})

test('canRecordSeriesOf: never for a movie or a programme with no series link', () => {
  assert.equal(canRecordSeriesOf({ series_link: 'x|y', kind: 'series' }), true)
  assert.equal(canRecordSeriesOf({ series_link: 'x|y' }), true)
  assert.equal(canRecordSeriesOf({ series_link: 'x|y', kind: 'movie' }), false)
  assert.equal(canRecordSeriesOf({ kind: 'series' }), false)
})

test('home menus: a movie gets movie wording and no Record series', () => {
  assert.deepEqual(labelsOf(onNowMenuOf({ channelName: 'SBS World Movies', seriesLink: true, kind: 'movie' })), [
    'Watch live', 'Record this movie', 'Programme info',
  ])
  assert.deepEqual(labelsOf(guideMatchMenuOf({ seriesLink: true, kind: 'one-off' })), ['Record', 'Record series', 'Programme info'])
  assert.equal(labelsOf(scheduledMenuOf({ kind: 'movie' })).at(-1), 'Don\'t record this movie')
  assert.equal(labelsOf(scheduledMenuOf({ kind: 'movie', hasRule: true })).at(-1), 'Don\'t record this episode')
  assert.equal(skippedTextOf('Master Cheng', 'movie'), 'Won\'t record Master Cheng')
  assert.equal(skippedTextOf('Utopia'), 'Won\'t record this episode of Utopia')
})

test('programme sheet: strength label and line follow the kind', () => {
  const labelFor = (kind) => sheetStrengthsFor({ canRecordEpisode: true, kind })[0].label
  assert.equal(labelFor('movie'), 'This movie')
  assert.equal(labelFor('one-off'), 'This showing')
  assert.equal(labelFor(undefined), 'This episode')
  assert.equal(strengthLineOf({ strength: 'episode', kind: 'movie' }), 'Records this movie.')
  assert.equal(strengthLineOf({ strength: 'episode', kind: 'one-off' }), 'Records this showing only.')
  assert.equal(strengthLineOf({ strength: 'episode' }), 'Records this airing only.')
})

test('For you menu: a movie card says Record this movie and passes the kind to the sheet', async () => {
  const { menuOf, programOf } = await import('../src/web/for-you.js')
  const item = { id: '1', title: 'Master Cheng', channelId: 'c', start: 0, stop: 1, kind: 'liked', programmeKind: 'movie' }
  assert.equal(menuOf({ item, nowMs: 0, timeZone: 'Australia/Sydney' }).actions.find((a) => a.key === 'record-episode').label, 'Record this movie')
  assert.equal(programOf(item).kind, 'movie')
})
