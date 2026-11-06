import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_GUIDE_RESULTS, buildShowSearch, episodeLineOf, guideRowsOf, matchNoteOf, searchGroupsOf, searchShowsOf } from '../src/web/search-results.js'
import { showKeyOf as keyOf } from '../src/web/show-key.js'

const shows = [{ title: 'The Block', recordingCount: 2 }, { title: 'Gruen', recordingCount: 1 }, { title: 'Blockbusters', recordingCount: 1 }]
const series = [{ title: 'The Block' }, { title: 'Hard Quiz' }]
const curated = [{ title: 'My Kitchen Rules', aliases: ['MKR'] }]
const index = buildShowSearch({ keyOf, shows: [...shows, { title: 'My Kitchen Rules', recordingCount: 3 }], series, curated })

test('searchShowsOf: short queries return nothing', () => {
  assert.deepEqual(searchShowsOf({ index, query: 'b' }), [])
})

test('searchShowsOf: groups recordings and rules into one show per key, more recordings first on a tie', () => {
  assert.deepEqual(searchShowsOf({ index, query: 'block' }).map(({ title, meta }) => [title, meta]), [
    ['The Block', '2 recordings · Series rule'],
    ['Blockbusters', '1 recording'],
  ])
})

test('searchShowsOf: a rule with no recordings still matches, accents fold', () => {
  assert.deepEqual(searchShowsOf({ index, query: 'quiz' }).map(({ key, meta }) => [key, meta]), [['hard-quiz', 'Series rule']])
  assert.equal(searchShowsOf({ index, query: 'grüen' })[0].title, 'Gruen')
})

test('searchShowsOf: alias matches keep the real title and note the alias in the meta', () => {
  const [show] = searchShowsOf({ index, query: 'mkr' })
  assert.deepEqual([show.title, show.reason, show.meta], ['My Kitchen Rules', 'alias', 'Also known as MKR · 3 recordings'])
})

test('matchNoteOf: only non-literal matches get a note', () => {
  assert.equal(matchNoteOf({ reason: 'title', query: 'kitchen' }), '')
  assert.equal(matchNoteOf({ reason: 'yours', matchedName: 'Footy bar', query: 'footy' }), 'Also known as Footy bar')
  assert.equal(matchNoteOf({ reason: 'initials', query: 'afl' }), 'Initials AFL')
  assert.equal(matchNoteOf({ reason: 'fuzzy', query: 'gogglbox' }), 'Did you mean')
})

test('episodeLineOf: placeholder episode titles become S and E numbers, real ones stay', () => {
  assert.equal(episodeLineOf({ episode_title: 'Episode 8 of Season 16' }), 'S16 E8')
  assert.equal(episodeLineOf({ episode_title: 'Episode 9' }), 'E9')
  assert.equal(episodeLineOf({ episode_title: 'Rnd 11: Sydney v West Coast' }), 'Rnd 11: Sydney v West Coast')
  assert.equal(episodeLineOf({ episode_title: null }), '')
  assert.equal(episodeLineOf({ title: 'A Football Life', series_no: 1, episode_no: 45, episode_title: 'A Football Life' }), 'S1 E45')
})

test('guideRowsOf: the match note shows on the first row of each show only', () => {
  const airing = (start, extra = {}) => ({ title: 'My Kitchen Rules', channelId: 'c7', channelName: '7 Sydney', start, reason: 'alias', matchedName: 'MKR', ...extra })
  const rows = guideRowsOf({
    results: [airing(1, { episode_title: 'Episode 8 of Season 16' }), airing(2), { ...airing(3), title: 'A Football Life', reason: 'initials', matchedName: undefined }],
    query: 'mkr',
    whenOf: (start) => `t${start}`,
  })
  assert.deepEqual(rows.map(({ title, episode, meta }) => [title, episode, meta]), [
    ['My Kitchen Rules', 'S16 E8', 'Also known as MKR · t1 · 7 Sydney'],
    ['My Kitchen Rules', '', 't2 · 7 Sydney'],
    ['A Football Life', '', 'Initials MKR · t3 · 7 Sydney'],
  ])
})

test('guideRowsOf: scheduled and series rows lead their meta with the recording state, guide rows do not', () => {
  const programme = (group) => ({ title: 'The Chase', channelId: 'c7', channelName: '7', start: 1, group })
  const rows = guideRowsOf({
    results: [programme('scheduled'), programme('guide')],
    query: 'chase',
    whenOf: () => 'Today 7:30 pm',
    stateTextOf: () => 'One-off recording scheduled',
  })
  assert.deepEqual(rows.map(({ group, meta }) => [group, meta]), [
    ['scheduled', 'One-off recording scheduled · Today 7:30 pm · 7'],
    ['guide', 'Today 7:30 pm · 7'],
  ])
})

const programmeRow = (group, start) => ({ key: `c1:${start}`, group, title: `Show ${start}` })

test('searchGroupsOf: groups follow the order, empty groups drop out, and rows keep their kind', () => {
  const groups = searchGroupsOf({
    shows: [{ key: 'big-brother', title: 'Big Brother', meta: '' }],
    programmes: [programmeRow('guide', 1), programmeRow('scheduled', 2), programmeRow('for-you', 3)],
  })
  assert.deepEqual(groups.map(({ key, label }) => [key, label]), [
    ['scheduled', 'Scheduled'],
    ['recordings', 'Recordings'],
    ['for-you', 'For you'],
    ['guide', 'TV guide'],
  ])
  assert.deepEqual(groups.map((group) => group.rows[0].kind), ['programme', 'show', 'programme', 'programme'])
})

test('searchGroupsOf: a group shows five rows, then Show all expands it in place', () => {
  const programmes = Array.from({ length: 7 }, (_, i) => programmeRow('guide', i))
  const [capped] = searchGroupsOf({ programmes })
  assert.deepEqual([capped.rows.length, capped.total, capped.isCapped], [5, 7, true])
  const [expanded] = searchGroupsOf({ programmes, expanded: new Set(['guide']) })
  assert.deepEqual([expanded.rows.length, expanded.isCapped], [7, false])
  const [exact] = searchGroupsOf({ programmes: programmes.slice(0, 5) })
  assert.equal(exact.isCapped, false)
})

test('searchGroupsOf: row keys stay the same when more results arrive', () => {
  const keysOf = (programmes) => searchGroupsOf({ programmes })[0].rows.map((row) => row.key)
  const first = [programmeRow('guide', 1), programmeRow('guide', 2)]
  assert.deepEqual(keysOf([...first, programmeRow('guide', 3)]).slice(0, 2), keysOf(first))
})

test('searchGroupsOf: Show all names the group and its count when the list is complete', () => {
  const programmes = Array.from({ length: 7 }, (_, i) => programmeRow('guide', i))
  const [group] = searchGroupsOf({ programmes })
  assert.deepEqual([group.showAllText, group.showAllLabel], ['Show all 7', 'Show all 7 in TV guide'])
})

test('searchGroupsOf: Show all drops the count when the guide list hit its cap, because more results may exist', () => {
  const programmes = Array.from({ length: MAX_GUIDE_RESULTS }, (_, i) => programmeRow('guide', i))
  const [group] = searchGroupsOf({ programmes })
  assert.deepEqual([group.showAllText, group.showAllLabel], ['Show all', 'Show all in TV guide'])
})
