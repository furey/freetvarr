import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SHEET_KEEP_STEPS,
  SHEET_LEAD_STEPS,
  activeWatchItemFor,
  canStep,
  cellMarksOf,
  clockWithoutPeriod,
  initialStrengthOf,
  keepLabel,
  minutesShort,
  pendingActionLabelOf,
  primaryActionOf,
  seasonEpisodeShort,
  sheetMetaLineOf,
  sheetStrengthsFor,
  stepValue,
  strengthLineOf,
  watchedKeysOf,
} from '../src/web/programme-sheet.js'

test('stepValue: moves along the steps and stops at each end', () => {
  assert.equal(stepValue({ steps: SHEET_LEAD_STEPS, value: 2, step: 1 }), 3)
  assert.equal(stepValue({ steps: SHEET_LEAD_STEPS, value: 2, step: -1 }), 1)
  assert.equal(stepValue({ steps: SHEET_LEAD_STEPS, value: 0, step: -1 }), 0)
  assert.equal(stepValue({ steps: SHEET_LEAD_STEPS, value: 15, step: 1 }), 15)
  assert.equal(stepValue({ steps: SHEET_LEAD_STEPS, value: 7, step: 1 }), 1)
  assert.equal(canStep({ steps: SHEET_LEAD_STEPS, value: 0, step: -1 }), false)
  assert.equal(canStep({ steps: SHEET_LEAD_STEPS, value: 0, step: 1 }), true)
})

test('keep steps: All comes after the largest number', () => {
  assert.equal(stepValue({ steps: SHEET_KEEP_STEPS, value: 20, step: 1 }), 0)
  assert.equal(stepValue({ steps: SHEET_KEEP_STEPS, value: 0, step: -1 }), 20)
  assert.equal(keepLabel(0), 'All')
  assert.equal(keepLabel(5), '5')
  assert.equal(minutesShort(10), '10m')
})

test('sheetStrengthsFor: lists only the strengths that apply, in order', () => {
  assert.deepEqual(
    sheetStrengthsFor({ canRecordEpisode: true, canRecordSeries: true, canNotify: true }).map((s) => s.label),
    ['This episode', 'Every episode', 'Notify me'],
  )
  assert.deepEqual(
    sheetStrengthsFor({ canRecordEpisode: false, canRecordSeries: false, canNotify: true }).map((s) => s.key),
    ['notify'],
  )
})

test('initialStrengthOf: series focus picks Every episode when it is offered', () => {
  const strengths = sheetStrengthsFor({ canRecordEpisode: true, canRecordSeries: true, canNotify: true })
  assert.equal(initialStrengthOf({ strengths }), 'episode')
  assert.equal(initialStrengthOf({ strengths, focus: 'series' }), 'series')
  assert.equal(initialStrengthOf({ strengths: strengths.slice(2), focus: 'series' }), 'notify')
  assert.equal(initialStrengthOf({ strengths: [] }), '')
})

test('initialStrengthOf: notify focus picks Notify me, and an unoffered focus falls back to the first', () => {
  const strengths = sheetStrengthsFor({ canRecordEpisode: true, canRecordSeries: false, canNotify: true })
  assert.equal(initialStrengthOf({ strengths, focus: 'notify' }), 'notify')
  assert.equal(initialStrengthOf({ strengths, focus: 'series' }), 'episode')
})

test('strengthLineOf: one line that says what each strength does', () => {
  assert.equal(strengthLineOf({ strength: 'episode' }), 'Records this airing only.')
  assert.match(strengthLineOf({ strength: 'episode', onAirUntil: '9:12pm' }), /from now until 9:12pm/)
  assert.equal(
    strengthLineOf({ strength: 'series', title: 'The Rookie', channelLabel: 'on 7 Sydney' }),
    'Records every new episode of The Rookie on 7 Sydney.',
  )
  assert.match(strengthLineOf({ strength: 'notify', title: 'The Rookie' }), /Nothing records\.$/)
  assert.match(strengthLineOf({ strength: 'notify', title: 'The Rookie', recordWhenSeen: true }), /any channel/)
  assert.match(strengthLineOf({ strength: 'notify', title: 'The Rookie', watching: true }), /^You are watching for/)
})

test('primaryActionOf: red for recording, mint for notify', () => {
  assert.deepEqual(primaryActionOf({ strength: 'episode' }), { key: 'record', label: 'Record', tone: 'record' })
  assert.equal(primaryActionOf({ strength: 'series' }).label, 'Record series')
  assert.deepEqual(primaryActionOf({ strength: 'notify' }), { key: 'notify', label: 'Notify me', tone: 'primary' })
  assert.equal(primaryActionOf({ strength: 'notify', recordWhenSeen: true }).label, 'Record when it appears')
  assert.equal(primaryActionOf({ strength: 'notify', watching: true }).key, 'stop-watching')
  assert.equal(primaryActionOf({ strength: '' }), null)
})

test('sheetMetaLineOf and seasonEpisodeShort: skip the parts a programme lacks', () => {
  assert.equal(seasonEpisodeShort({ series_no: 8, episode_no: 17 }), 'S8 E17')
  assert.equal(seasonEpisodeShort({ series_no: null, episode_no: 3 }), 'E3')
  assert.equal(
    sheetMetaLineOf({ seasonEpisode: 'S8 E17', episodeTitle: 'Dead Ringer', channelName: '7 Sydney', timeRange: 'Mon 9:12–10:10pm' }),
    'S8 E17 · Dead Ringer · 7 Sydney · Mon 9:12–10:10pm',
  )
  assert.equal(sheetMetaLineOf({ seasonEpisode: '', episodeTitle: null, channelName: 'ABC', timeRange: '' }), 'ABC')
})

test('watch items: fulfilled entries no longer count as watched', () => {
  const items = [{ key: 'the-rookie' }, { key: 'gruen', fulfilledAt: 'x' }]
  assert.deepEqual([...watchedKeysOf(items)], ['the-rookie'])
  assert.equal(activeWatchItemFor({ items, key: 'gruen' }), null)
  assert.equal(activeWatchItemFor({ items, key: 'the-rookie' }), items[0])
})

test('cellMarksOf: ring for recording, red dot for scheduled or series, mint dot otherwise', () => {
  assert.deepEqual(cellMarksOf({ state: 'recording' }), { ring: true, scheduledDot: false, watchDot: false })
  assert.equal(cellMarksOf({ state: 'scheduled' }).scheduledDot, true)
  assert.equal(cellMarksOf({ state: 'series' }).scheduledDot, true)
  assert.equal(cellMarksOf({ state: '', seriesScheduled: true }).scheduledDot, true)
  assert.equal(cellMarksOf({ state: '', watching: true }).watchDot, true)
  assert.equal(cellMarksOf({ state: 'scheduled', watching: true }).watchDot, false)
})

test('clockWithoutPeriod: drops am or pm for the now pill', () => {
  assert.equal(clockWithoutPeriod('7:33pm'), '7:33')
  assert.equal(clockWithoutPeriod('11:05 am'), '11:05')
  assert.equal(clockWithoutPeriod('19:33'), '19:33')
})

test('pendingActionLabelOf: each sheet action has its own -ing label', () => {
  assert.equal(pendingActionLabelOf('record'), 'Scheduling…')
  assert.equal(pendingActionLabelOf('record-series'), 'Setting up…')
  assert.equal(pendingActionLabelOf('notify'), 'Saving…')
  assert.equal(pendingActionLabelOf('stop'), 'Stopping…')
  assert.equal(pendingActionLabelOf('cancel'), 'Cancelling…')
  assert.equal(pendingActionLabelOf('unknown'), 'Saving…')
})
