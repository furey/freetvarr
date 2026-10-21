import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  allSelectedIn,
  clockOf,
  episodeInfoOf,
  episodeMenuOf,
  latestEarlierEpisodeOf,
  markedText,
  movedText,
  moveSubtitleOf,
  moveTargetsOf,
  newShowTitleOf,
  prunedSelection,
  selectAllIn,
  selectionTitle,
  showInfoOf,
  menuPendingLabelOf,
  showMenuOf,
  toggledSelection,
  undoMovesOf,
  watchedChangeTargets,
} from '../src/web/library-menus.js'

const episode = (overrides = {}) => ({
  recordingId: 'r1',
  title: 'The Block',
  season: 22,
  episode: 44,
  airedAt: 1000,
  playable: true,
  watched: false,
  failed: false,
  positionS: null,
  status: 'done',
  libraryState: null,
  filePath: '/media/TV/The Block/e44.ts',
  deletedFromTvhAt: null,
  ...overrides,
})

const keysOf = (groups) => groups.map((group) => group.map((item) => item.key))

const showWith = (episodes, overrides = {}) => ({
  title: 'The Block',
  rule: { paused: false, channels: ['9HD'] },
  seasons: [{ season: 22, episodes }],
  resumeNext: { recordingId: episodes.find((e) => !e.watched)?.recordingId, positionS: 0 },
  ...overrides,
})

test('showMenuOf: lists every action in the approved order with delete counts', () => {
  const show = showWith([
    episode({ recordingId: 'a', episode: 41, watched: true }),
    episode({ recordingId: 'b', episode: 42 }),
    episode({ recordingId: 'c', episode: 43 }),
  ])
  show.resumeNext = { recordingId: 'b', positionS: 0 }
  const groups = showMenuOf({ show })
  assert.deepEqual(keysOf(groups), [
    ['play-next', 'mark-all-watched', 'mark-all-unwatched'],
    ['options', 'pause-series', 'show-info', 'plex', 'change-picture', 'refresh-artwork'],
    ['delete-watched', 'delete-all'],
  ])
  assert.equal(groups[0][0].detail, 'E42')
  assert.deepEqual(groups[2].map((item) => item.detail), ['1', '3'])
})

test('showMenuOf: hides what does not apply and leaves recording episodes out of the counts', () => {
  const show = showWith([episode({ recordingId: 'a' }), episode({ recordingId: 'live', episode: 45 })], { rule: null, resumeNext: null })
  const groups = showMenuOf({ show, activeIds: new Set(['live']) })
  assert.deepEqual(keysOf(groups), [['mark-all-watched'], ['show-info', 'plex', 'change-picture', 'refresh-artwork'], ['delete-all']])
  assert.equal(groups[2][0].detail, '1')
  const paused = showMenuOf({ show: showWith([episode()], { rule: { paused: true } }) })
  assert.ok(paused[1].some((item) => item.key === 'resume-series'))
})

test('showMenuOf: a series rule with nothing recorded yet offers the picture and rule actions only', () => {
  const show = showWith([], { seasons: [], resumeNext: null })
  assert.deepEqual(keysOf(showMenuOf({ show })), [['options', 'pause-series', 'show-info', 'change-picture', 'refresh-artwork']])
  assert.deepEqual(keysOf(showMenuOf({ show: { ...show, rule: null } })), [['show-info']])
})

test('episodeMenuOf: an in-progress episode offers resume, start over and earlier episodes', () => {
  const current = episode({ recordingId: 'b', episode: 44, positionS: 1390 })
  const episodes = [episode({ recordingId: 'a', episode: 43 }), current]
  const groups = episodeMenuOf({ episode: current, episodes, adRemovalEnabled: true })
  assert.deepEqual(keysOf(groups), [
    ['resume', 'play-start', 'watched', 'watched-earlier'],
    ['episode-info', 'remove-ads', 'plex'],
    ['delete-episode'],
  ])
  assert.equal(groups[0][0].detail, 'from 23:10')
  assert.equal(groups[0][1].label, 'Play from the start')
})

test('episodeMenuOf: a recording episode cannot be deleted and a failed one offers Retry', () => {
  const recording = episodeMenuOf({ episode: episode({ recordingId: 'live' }), activeIds: new Set(['live']) })
  assert.ok(!recording.flat().some((item) => item.key === 'delete-episode'))
  assert.equal(recording[0][0].label, 'Play')
  const failed = episodeMenuOf({ episode: episode({ failed: true, status: 'failed', playable: false, filePath: null }) })
  assert.deepEqual(keysOf(failed), [['episode-info', 'import'], ['delete-episode']])
  assert.equal(failed[0][1].label, 'Retry')
})

test('latestEarlierEpisodeOf: picks the episode just before, by season and number', () => {
  const episodes = [
    episode({ recordingId: 's21e9', season: 21, episode: 9 }),
    episode({ recordingId: 's22e1', season: 22, episode: 1 }),
    episode({ recordingId: 's22e2', season: 22, episode: 2 }),
  ]
  assert.equal(latestEarlierEpisodeOf({ episodes, episode: episodes[2] }).recordingId, 's22e1')
  assert.equal(latestEarlierEpisodeOf({ episodes, episode: episodes[1] }).recordingId, 's21e9')
  assert.equal(latestEarlierEpisodeOf({ episodes, episode: episodes[0] }), null)
})

test('clockOf: minutes and seconds, with hours when needed', () => {
  assert.equal(clockOf(1390), '23:10')
  assert.equal(clockOf(3725), '1:02:05')
  assert.equal(clockOf(null), '0:00')
})

test('selection helpers: toggle, select the season, skip recording episodes', () => {
  const episodes = [episode({ recordingId: 'a' }), episode({ recordingId: 'b' }), episode({ recordingId: 'live' })]
  const activeIds = new Set(['live'])
  let selected = toggledSelection({ selected: new Set(), recordingId: 'a' })
  assert.deepEqual([...selected], ['a'])
  assert.equal(allSelectedIn({ episodes, selected, activeIds }), false)
  selected = selectAllIn({ episodes, selected, activeIds })
  assert.deepEqual([...selected].sort(), ['a', 'b'])
  assert.equal(allSelectedIn({ episodes, selected, activeIds }), true)
  assert.deepEqual([...selectAllIn({ episodes, selected, activeIds })], [])
  assert.deepEqual([...prunedSelection({ selected: new Set(['a', 'live', 'gone']), episodes, activeIds })], ['a'])
  assert.equal(selectionTitle(0), 'Select episodes')
  assert.equal(selectionTitle(3), '3 selected')
})

test('watchedChangeTargets and markedText: only the episodes that change', () => {
  const episodes = [episode({ recordingId: 'a', watched: true }), episode({ recordingId: 'b', positionS: 30 }), episode({ recordingId: 'c' })]
  assert.deepEqual(watchedChangeTargets({ episodes, watched: true }).map((e) => e.recordingId), ['b', 'c'])
  assert.deepEqual(watchedChangeTargets({ episodes, watched: false }).map((e) => e.recordingId), ['a', 'b'])
  assert.equal(markedText({ count: 1, watched: true }), 'Marked 1 episode as watched')
  assert.equal(markedText({ count: 3, watched: false }), 'Marked 3 episodes as unwatched')
})

test('episodeInfoOf and showInfoOf: plain rows, empty ones left out', () => {
  const info = episodeInfoOf({ episode: episode({ positionS: 1390, durationS: 3720, channelName: '9HD', synopsis: 'Storm week.' }), showTitle: 'The Block', timeZone: 'UTC' })
  assert.equal(info.title, 'E44')
  assert.equal(info.text, 'Storm week.')
  assert.deepEqual(info.rows.map((row) => row.label), ['Aired', 'Channel', 'Length', 'Watched', 'Saves to'])
  assert.equal(info.rows.find((row) => row.label === 'Watched').value, 'Up to 23:10')
  const showInfo = showInfoOf({ show: showWith([episode(), episode({ recordingId: 'b', watched: true })], { rule: null }), timeZone: 'UTC' })
  assert.deepEqual(showInfo.rows, [
    { label: 'Episodes', value: '2 recorded · 1 unwatched' },
    { label: 'Series recording', value: 'Not recording new episodes' },
  ])
})

test('menuPendingLabelOf: actions that wait keep the menu open with an -ing label', () => {
  assert.equal(menuPendingLabelOf('refresh-artwork'), 'Refreshing artwork…')
  assert.equal(menuPendingLabelOf('mark-all-watched'), 'Marking as watched…')
  assert.equal(menuPendingLabelOf('watched'), 'Marking as watched…')
  assert.equal(menuPendingLabelOf('play-next'), '')
  assert.equal(menuPendingLabelOf('delete-all'), '')
})

test('Move to show… follows Show info and Episode info only where moving is offered', () => {
  const show = showWith([episode()], { rule: null })
  assert.deepEqual(keysOf(showMenuOf({ show, canMove: true }))[1].slice(0, 2), ['show-info', 'move'])
  assert.ok(!showMenuOf({ show }).flat().some((item) => item.key === 'move'))
  assert.ok(!showMenuOf({ show: showWith([], { seasons: [] }), canMove: true }).flat().some((item) => item.key === 'move'))
  const groups = episodeMenuOf({ episode: episode(), canMove: true })
  assert.deepEqual(keysOf(groups)[1].slice(0, 2), ['episode-info', 'move'])
  assert.equal(groups[1][1].label, 'Move to show…')
})

test('moveTargetsOf and newShowTitleOf: filter other shows and offer a new one unless the text names a show', () => {
  const shows = [
    { key: 'the-block', title: 'The Block', poster: '/p?title=The%20Block', counts: { total: 10 } },
    { key: 'the-block-kids-room', title: 'The Block - Kids Room', poster: '/p', counts: { total: 2 } },
    { key: 'blockbusters', title: 'Blockbusters', poster: '/p', counts: { total: 0 } },
  ]
  const targets = moveTargetsOf({ shows, query: ' BLOCK', currentKey: 'the-block-kids-room' })
  assert.deepEqual(targets.map((show) => [show.title, show.meta]), [['The Block', '10 episodes'], ['Blockbusters', 'No episodes yet']])
  assert.equal(newShowTitleOf({ shows, query: ' block ' }), 'block')
  assert.equal(newShowTitleOf({ shows, query: 'the block' }), '')
  assert.equal(newShowTitleOf({ shows, query: 'The Block - Kids Room' }), '')
  assert.equal(newShowTitleOf({ shows, query: '   ' }), '')
})

test('move copy and undo: a short subtitle, the toast text, and one undo request per old value', () => {
  assert.equal(moveSubtitleOf({ title: 'The Block - Kids Room and Re-Do Room Week', count: 2 }), 'The Block - Kids Room… · 2 episodes')
  assert.equal(moveSubtitleOf({ title: 'The Block', count: 1 }), 'The Block · 1 episode')
  assert.equal(movedText('The Block'), 'Moved to The Block')
  assert.deepEqual(undoMovesOf([{ id: 'a', title: null }, { id: 'b', title: 'Specials' }, { id: 'c', title: null }]), [
    { ids: ['a', 'c'], title: null },
    { ids: ['b'], title: 'Specials' },
  ])
})
