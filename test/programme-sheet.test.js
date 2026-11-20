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
  scheduledMessageOf,
  pendingActionLabelOf,
  primaryActionOf,
  seasonEpisodeShort,
  sheetAiringLineOf,
  sheetEpisodeLineOf,
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
    sheetStrengthsFor({ canRecordEpisode: true, canRecordSeries: true }).map((s) => s.label),
    ['This episode', 'Every episode'],
  )
  assert.deepEqual(sheetStrengthsFor({ canRecordEpisode: false, canRecordSeries: false }), [])
})

test('initialStrengthOf: series focus picks Every episode when it is offered', () => {
  const strengths = sheetStrengthsFor({ canRecordEpisode: true, canRecordSeries: true })
  assert.equal(initialStrengthOf({ strengths }), 'episode')
  assert.equal(initialStrengthOf({ strengths, focus: 'series' }), 'series')
  assert.equal(initialStrengthOf({ strengths: strengths.slice(1), focus: 'episode' }), 'series')
  assert.equal(initialStrengthOf({ strengths: [] }), '')
})

test('initialStrengthOf: an unoffered focus falls back to the first', () => {
  const strengths = sheetStrengthsFor({ canRecordEpisode: true, canRecordSeries: false })
  assert.equal(initialStrengthOf({ strengths, focus: 'series' }), 'episode')
})

test('strengthLineOf: one line that says what each strength does', () => {
  assert.match(strengthLineOf({ strength: 'episode' }), /airing/i)
  assert.doesNotMatch(strengthLineOf({ strength: 'episode' }), /until|every|undefined/i)
  assert.match(strengthLineOf({ strength: 'episode', onAirUntil: '9:12pm' }), /from now until 9:12pm/)
  const seriesLine = strengthLineOf({ strength: 'series', title: 'The Rookie', channelLabel: 'on 7 Sydney' })
  assert.match(seriesLine, /every/i)
  assert.match(seriesLine, /The Rookie/)
  assert.match(seriesLine, /on 7 Sydney/)
  assert.doesNotMatch(strengthLineOf({ strength: 'series', title: 'The Rookie' }), / \.|undefined/)
  assert.match(strengthLineOf({ strength: 'notify', title: 'The Rookie' }), /Nothing records\.$/)
  assert.match(strengthLineOf({ strength: 'notify', title: 'The Rookie', recordWhenSeen: true }), /any channel/)
})

test('primaryActionOf: red for recording, nothing otherwise', () => {
  assert.deepEqual(primaryActionOf({ strength: 'episode' }), { key: 'record', label: 'Record', tone: 'record' })
  assert.equal(primaryActionOf({ strength: 'series' }).label, 'Record series')
  assert.equal(primaryActionOf({ strength: 'notify' }), null)
  assert.equal(primaryActionOf({ strength: '' }), null)
})

test('sheet lines: the episode line names the episode, the airing line names the channel and time', () => {
  assert.equal(seasonEpisodeShort({ series_no: 8, episode_no: 17 }), 'S8 E17')
  assert.equal(seasonEpisodeShort({ series_no: null, episode_no: 3 }), 'E3')
  assert.equal(sheetEpisodeLineOf({ seasonEpisode: 'S1 E6', episodeTitle: 'Wednesday' }), 'S1 E6 · Wednesday')
  assert.equal(sheetEpisodeLineOf({ seasonEpisode: 'S14 E1', episodeTitle: 'Episode 1' }), 'S14 E1')
  assert.equal(sheetEpisodeLineOf({ seasonEpisode: '', episodeTitle: null }), '')
  assert.equal(sheetEpisodeLineOf({ seasonEpisode: 'E3', episodeTitle: 'The Return' }), 'E3 · The Return')
  assert.equal(sheetEpisodeLineOf({ seasonEpisode: 'S2 E12', episodeTitle: 'episode 12' }), 'S2 E12')
  assert.equal(sheetEpisodeLineOf({ seasonEpisode: 'S1 E1', episodeTitle: 'Episode 1 of 6' }), 'S1 E1 · Episode 1 of 6')
  assert.equal(sheetAiringLineOf({ channelName: 'SBS ONE HD', timeRange: 'Fri 10:50pm–11:55pm' }), 'SBS ONE HD · Fri 10:50pm–11:55pm')
  assert.equal(sheetAiringLineOf({ channelName: 'ABC', timeRange: '' }), 'ABC')
})

test('watch items: fulfilled entries no longer count as watched', () => {
  const items = [{ key: 'the-rookie' }, { key: 'gruen', fulfilledAt: 'x' }]
  assert.deepEqual([...watchedKeysOf(items)], ['the-rookie'])
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
  assert.equal(pendingActionLabelOf('stop'), 'Stopping…')
  assert.equal(pendingActionLabelOf('cancel'), 'Cancelling…')
  assert.equal(pendingActionLabelOf('unknown'), 'Saving…')
})

test('activeWatchItemFor finds the watchlist entry that is still waiting', () => {
  const items = [{ id: 1, key: 'vera', fulfilledAt: 5 }, { id: 2, key: 'vera', fulfilledAt: null }, { id: 3, key: 'bluey' }]
  assert.equal(activeWatchItemFor({ items, key: 'vera' }).id, 2)
  assert.equal(activeWatchItemFor({ items, key: 'frasier' }), null)
})

test('a failed sheet action reloads the recording state, so the sheet shows what TVHeadend has', async () => {
  const { readFile } = await import('node:fs/promises')
  const source = await readFile(new URL('../src/web/components/programme-sheet-host.js', import.meta.url), 'utf8')
  const runner = source.slice(source.indexOf('const runSheetAction = async'), source.indexOf('const afterRecordingChange = async'))
  const failure = runner.slice(runner.indexOf('} catch (err) {'), runner.indexOf('} finally {'))
  assert.match(failure, /reloadAfterFailedChange\(\)/)
  assert.match(source, /const reloadAfterFailedChange = \(\) => \{\n\s+refreshAfterRecordingChange\(\)\n\s+loadEpgState\(\{ fresh: true \}\)\.catch\(\(\) => \{\}\)/)
})

test('scheduledMessageOf: says when TVHeadend did not save the padding', () => {
  const saved = scheduledMessageOf({ title: 'The Chase' })
  assert.match(saved, /scheduled/i)
  assert.match(saved, /"The Chase"/)
  assert.doesNotMatch(saved, /TVHeadend|Start early|Finish late/)
  const unsaved = scheduledMessageOf({ title: 'The Chase', paddingSaved: false })
  assert.match(unsaved, /scheduled/i)
  assert.match(unsaved, /"The Chase"/)
  assert.match(unsaved, /TVHeadend/)
  assert.match(unsaved, /Start early/)
  assert.match(unsaved, /Finish late/)
  assert.doesNotMatch(scheduledMessageOf({ title: 'The Chase', paddingSaved: true }), /Start early/)
})
