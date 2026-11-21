import { test } from 'node:test'
import assert from 'node:assert/strict'

import { canRecordSeriesOf, isSingleTitleKind } from '../src/web/title-kind.js'
import { heroMetaOf, heroPlayOf, pageShapeOf, playButtonLabel, ruleStatusOf, singleItemOf } from '../src/web/show-page.js'
import { episodeInfoOf, episodeMenuOf, showInfoOf, showMenuOf, titleInfoOf, titleMenuSubtitleOf } from '../src/web/library-menus.js'
import { deleteConfirmOf, deleteOutcomeOf } from '../src/web/delete-copy.js'
import { guideMatchMenuOf, onNowMenuOf } from '../src/web/home-menus.js'

const item = (overrides = {}) => ({
  recordingId: 'r1',
  title: 'Heat',
  episodeTitle: null,
  season: null,
  episode: null,
  airedAt: Date.UTC(2026, 9, 31, 9, 30),
  durationS: 9300,
  synopsis: 'A thief and a detective.',
  channelName: '9Gem',
  playable: true,
  watched: false,
  failed: false,
  positionS: null,
  watchedPercent: 0,
  status: 'done',
  libraryState: null,
  filePath: '/media/movies/Heat (1995)/Heat.ts',
  deletedFromTvhAt: null,
  ...overrides,
})

const titleOf = (kind, items, overrides = {}) => ({
  key: 'heat',
  title: 'Heat',
  kind,
  year: 1995,
  rule: null,
  nextAiring: null,
  seasons: items.length ? [{ season: null, episodes: items }] : [],
  resumeNext: items[0] ? { recordingId: items[0].recordingId, positionS: items[0].positionS || 0 } : null,
  ...overrides,
})

const plexItem = (overrides = {}) => item({
  recordingId: 'plex-1',
  source: 'plex',
  channelName: null,
  versions: [{ manager: 'radarr', filePath: '/media/movies/Heat.mkv', sizeBytes: 8e9, videoCodec: 'hevc', resolution: '4k' }],
  ...overrides,
})

const keysOf = (groups) => groups.flat().map((entry) => entry.key)
const labelsOf = (groups) => groups.flat().map((entry) => entry.label)
const rowLabelsOf = (info) => info.rows.map((row) => row.label)

test('title kind: films and one-offs are single titles in every spelling', () => {
  assert.deepEqual(['movie', 'oneoff', 'one-off', 'show', 'series', null].map(isSingleTitleKind), [true, true, true, false, false, false])
})

test('title kind: a series link offers Record series except for a movie or a confirmed one-off', () => {
  assert.equal(canRecordSeriesOf({ series_link: 'x', kind: 'series' }), true)
  assert.equal(canRecordSeriesOf({ series_link: 'x', kind: null }), true)
  assert.equal(canRecordSeriesOf({ series_link: 'x', kind: 'movie' }), false)
  assert.equal(canRecordSeriesOf({ series_link: 'x', kind: 'one-off' }), true)
  assert.equal(canRecordSeriesOf({ series_link: 'x', kind: 'one-off', one_off_confirmed: true }), false)
  assert.equal(canRecordSeriesOf({ series_link: null, kind: 'series' }), false)
  assert.ok(labelsOf(onNowMenuOf({ seriesLink: true, kind: 'one-off' })).includes('Record series'))
  assert.ok(!labelsOf(onNowMenuOf({ seriesLink: true, kind: 'one-off', oneOffConfirmed: true })).includes('Record series'))
  assert.ok(!labelsOf(guideMatchMenuOf({ seriesLink: true, kind: 'one-off', oneOffConfirmed: true })).includes('Record series'))
  assert.ok(labelsOf(guideMatchMenuOf({ seriesLink: true, kind: 'series' })).includes('Record series'))
})

test('page shape: a series lists episodes, a single film or one-off is one item, several one-off airings are a list', () => {
  assert.equal(pageShapeOf(titleOf('show', [item()])), 'series')
  assert.equal(pageShapeOf(titleOf('movie', [plexItem()])), 'single')
  assert.equal(pageShapeOf(titleOf('oneoff', [item()])), 'single')
  assert.equal(pageShapeOf(titleOf('oneoff', [item(), item({ recordingId: 'r2' })])), 'list')
  assert.equal(pageShapeOf(titleOf('movie', [])), 'list')
  assert.equal(singleItemOf(titleOf('oneoff', [item(), item({ recordingId: 'r2' })])), null)
  assert.equal(singleItemOf(titleOf('movie', [plexItem()])).recordingId, 'plex-1')
})

test('single title page: year, length, and watched state; Play with no episode number; no rule card', () => {
  const film = titleOf('movie', [item({ positionS: 3000, episode: 3 })])
  assert.equal(heroMetaOf({ show: film }), '1995 · 2 hrs 35 mins · 105 mins left')
  assert.equal(playButtonLabel({ show: film }), 'Resume')
  assert.equal(ruleStatusOf({ show: film, timeZone: 'UTC' }), null)
  assert.equal(ruleStatusOf({ show: titleOf('show', [item()]), timeZone: 'UTC' }).headline, 'Not recording new episodes')
  assert.equal(playButtonLabel({ show: titleOf('show', [item({ episode: 3 })]) }), 'Play E3')
})

test('single title hero: Play from the beginning when watched or unstarted, Resume when part way through', () => {
  const watched = titleOf('movie', [item({ watched: true, positionS: 9000 })], { resumeNext: null })
  assert.equal(playButtonLabel({ show: watched }), 'Play')
  assert.deepEqual(heroPlayOf(watched), { episode: watched.seasons[0].episodes[0], fromStart: true })
  assert.ok(!keysOf(showMenuOf({ show: watched })).includes('play-start'))
  const unstarted = titleOf('oneoff', [item()])
  assert.equal(playButtonLabel({ show: unstarted }), 'Play')
  assert.equal(heroPlayOf(unstarted).fromStart, true)
  const started = titleOf('movie', [item({ positionS: 600 })])
  assert.equal(playButtonLabel({ show: started }), 'Resume')
  assert.equal(heroPlayOf(started).fromStart, false)
  assert.ok(keysOf(showMenuOf({ show: started })).includes('play-start'))
  const failed = titleOf('movie', [item({ failed: true, playable: false })])
  assert.equal(playButtonLabel({ show: failed }), '')
  assert.equal(heroPlayOf(failed), null)
})

test('scheduled-only single title: the list path, not the one-item page', () => {
  const scheduled = item({ recordingId: 'scheduled-1', scheduled: { programId: 7 } })
  const film = titleOf('movie', [scheduled], { resumeNext: null })
  assert.equal(pageShapeOf(film), 'list')
  assert.equal(singleItemOf(film), null)
  assert.equal(playButtonLabel({ show: film }), '')
})

test('a movie with several recordings uses recording wording', () => {
  const film = titleOf('movie', [item(), item({ recordingId: 'r2' })])
  const groups = showMenuOf({ show: film })
  assert.equal(groups.flat().find((entry) => entry.key === 'delete-all').label, 'Delete all recordings')
  assert.equal(groups.flat().find((entry) => entry.key === 'delete-all').detail, '2')
  assert.equal(titleMenuSubtitleOf({ show: film, timeZone: 'UTC' }), '2 recordings · 2 unwatched')
  const preview = { count: 2, bytes: 8e9, items: [{ recordingId: 'r1', episode: null, bytes: 4e9 }, { recordingId: 'r2', episode: null, bytes: 4e9 }] }
  assert.equal(deleteConfirmOf({ variant: 'all', show: film, preview, episodes: film.seasons[0].episodes, totalCount: 2 }).title, 'Delete all 2 recordings of Heat?')
})

test('single title menu: one menu with the item actions and no episode wording', () => {
  const groups = showMenuOf({ show: titleOf('movie', [item()]), canMove: true, adRemovalEnabled: true })
  assert.deepEqual(labelsOf(groups), [
    'Mark as watched',
    'Info', 'Find ads', 'Open in Plex', 'Change picture', 'Refresh artwork',
    'Delete movie',
  ])
  const resumed = keysOf(showMenuOf({ show: titleOf('movie', [plexItem({ positionS: 600 })]) }))
  assert.deepEqual(resumed, ['play-start', 'watched', 'show-info', 'plex', 'change-picture', 'refresh-artwork', 'delete-episode'])
  const oneOff = labelsOf(showMenuOf({ show: titleOf('oneoff', [item()]), canMove: true }))
  assert.ok(oneOff.includes('Merge into another show…'))
  assert.ok(oneOff.includes('Move to Shows'))
  assert.ok(oneOff.includes('Delete recording'))
})

test('several one-off airings: a list with recording wording; a series keeps episode wording', () => {
  const list = labelsOf(showMenuOf({ show: titleOf('oneoff', [item({ watched: true }), item({ recordingId: 'r2' })]) }))
  assert.ok(list.includes('Info'))
  assert.ok(list.includes('Delete watched recordings'))
  assert.ok(list.includes('Delete all recordings'))
  const series = labelsOf(showMenuOf({ show: titleOf('show', [item({ episode: 1 }), item({ recordingId: 'r2', episode: 2 })]) }))
  assert.ok(series.includes('Show info'))
  assert.ok(series.includes('Delete all episodes'))
  assert.equal(titleMenuSubtitleOf({ show: titleOf('oneoff', [item(), item({ recordingId: 'r2' })]), timeZone: 'UTC' }), '2 recordings · 2 unwatched')
})

test('row menu: films and one-offs say Info and name the item; films have no Merge', () => {
  const film = episodeMenuOf({ episode: item(), canMove: true, kind: 'movie' })
  assert.ok(labelsOf(film).includes('Info'))
  assert.ok(labelsOf(film).includes('Delete movie'))
  assert.ok(!keysOf(film).includes('move'))
  const oneOff = episodeMenuOf({ episode: item(), canMove: true, kind: 'oneoff' })
  assert.ok(labelsOf(oneOff).includes('Delete recording'))
  assert.ok(keysOf(oneOff).includes('move'))
  assert.ok(labelsOf(episodeMenuOf({ episode: item({ episode: 2 }), kind: 'show' })).includes('Episode info'))
})

test('single title Info: the title once, the film facts, and no aired time for a download', () => {
  const plex = titleInfoOf({ show: titleOf('movie', [plexItem()]), timeZone: 'UTC', nicknames: ['Heat 95'] })
  assert.equal(plex.title, 'Heat')
  assert.equal(plex.subtitle, '')
  assert.equal(plex.text, 'A thief and a detective.')
  assert.deepEqual(plex.more, { title: 'Heat', kind: 'movie', year: 1995 })
  assert.deepEqual(rowLabelsOf(plex), ['Length', 'Watched', 'Came from', 'File', 'Size', 'Also known as'])
  const recorded = titleInfoOf({ show: titleOf('movie', [item()]), timeZone: 'UTC' })
  assert.deepEqual(rowLabelsOf(recorded), ['Recorded', 'Channel', 'Length', 'Watched', 'Saves to'])
  const versions = episodeInfoOf({ episode: plexItem({ versions: [plexItem().versions[0], plexItem().versions[0]] }), showTitle: 'Heat', timeZone: 'UTC', kind: 'movie' })
  assert.match(versions.note, /^This movie has 2 versions/)
  assert.equal(episodeInfoOf({ episode: item({ episode: 4 }), showTitle: 'Heat', timeZone: 'UTC', kind: 'show' }).subtitle, 'Heat')
})

test('list Info: recordings count and no series row without a rule', () => {
  const info = showInfoOf({ show: titleOf('oneoff', [item(), item({ recordingId: 'r2', watched: true })]), timeZone: 'UTC' })
  assert.deepEqual(info.rows, [{ label: 'Recordings', value: '2 recorded · 1 unwatched' }])
})

test('delete copy: names a movie or a recording instead of an episode', () => {
  const preview = { count: 1, bytes: 4e9, items: [{ recordingId: 'r1', title: 'Heat', episode: null, bytes: 4e9, missing: false }] }
  const film = deleteConfirmOf({ variant: 'episode', show: titleOf('movie', [item()]), preview, episodes: [item()], totalCount: 1 })
  assert.equal(film.title, 'Delete this movie?')
  assert.equal(film.confirmLabel, 'Delete movie')
  const oneOff = deleteConfirmOf({ variant: 'all', show: titleOf('oneoff', [item()]), preview, episodes: [item()], totalCount: 1 })
  assert.equal(oneOff.title, 'Delete the only recording of Heat?')
  const outcome = deleteOutcomeOf({ body: { results: [{ recordingId: 'r1', ok: true }] }, noun: { one: 'movie', many: 'movies' } })
  assert.equal(outcome.title, 'Deleted 1 movie')
})
