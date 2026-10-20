import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  guideMatchMenuOf,
  onNowMenuOf,
  programmeOfRecording,
  recordingNowMenuOf,
  scheduledMenuOf,
  skippedTextOf,
  withGoToShow,
} from '../src/web/home-menus.js'

const keysOf = (groups) => groups.map((group) => group.map((item) => item.key))

test('onNowMenuOf: watch, record, and programme info, with Record series only for a series', () => {
  assert.deepEqual(keysOf(onNowMenuOf({ channelName: 'ABC TV', seriesLink: true })), [
    ['watch-live', 'record-episode', 'record-series'],
    ['programme-info'],
  ])
  const single = onNowMenuOf({ channelName: 'ABC TV' })
  assert.deepEqual(keysOf(single), [['watch-live', 'record-episode'], ['programme-info']])
  assert.equal(single[0][0].detail, 'ABC TV')
  assert.equal(single[0][1].detail, 'From now')
  assert.equal(single[1][0].label, 'Programme info')
})

test('recordingNowMenuOf: Watch from the start only when the recording can play', () => {
  assert.deepEqual(keysOf(recordingNowMenuOf({ canStartOver: true })), [['from-start', 'watch-live'], ['programme-info', 'show']])
  assert.deepEqual(keysOf(recordingNowMenuOf({})), [['watch-live'], ['programme-info', 'show']])
})

test('scheduledMenuOf: programme info first, options only with a rule, skip last and red', () => {
  assert.deepEqual(keysOf(scheduledMenuOf({ hasRule: true })), [['programme-info', 'show', 'options'], ['skip']])
  const once = scheduledMenuOf({})
  assert.deepEqual(keysOf(once), [['programme-info', 'show'], ['skip']])
  assert.equal(once[1][0].danger, true)
})

test('guideMatchMenuOf: record actions then programme info', () => {
  const groups = guideMatchMenuOf({ when: 'Wed 7:30pm', seriesLink: true })
  assert.deepEqual(keysOf(groups), [['record-episode', 'record-series'], ['programme-info']])
  assert.equal(groups[0][0].detail, 'Wed 7:30pm')
})

test('withGoToShow: puts Go to show straight after Episode info', () => {
  const groups = [[{ key: 'play-start' }], [{ key: 'episode-info' }, { key: 'plex' }], [{ key: 'delete-episode' }]]
  assert.deepEqual(keysOf(withGoToShow(groups)), [['play-start'], ['episode-info', 'show', 'plex'], ['delete-episode']])
})

test('programmeOfRecording: maps a recording to the programme sheet shape', () => {
  assert.deepEqual(programmeOfRecording({ programId: 42, title: 'The Block', episodeTitle: '', start: 1, stop: 2, channelId: 'c9' }), {
    program_id: 42, title: 'The Block', episode_title: null, start: 1, end: 2, channelId: 'c9',
  })
  assert.equal(skippedTextOf('Utopia'), "Won't record this episode of Utopia")
})
