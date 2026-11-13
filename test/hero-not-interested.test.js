import { test } from 'node:test'
import assert from 'node:assert/strict'
import { currentCandidateTestOf, onNowPickOf } from '../src/web/home-hero.js'
import { dislikeItemOfSlide, onNowMenuOf } from '../src/web/home-menus.js'
import { titleTasteFrom } from '../src/for-you-routes.js'

const NOW = 1_800_000_000_000
const FISHING = { key: 'fishing', title: 'Fishing', phrase: 'fishing' }
const LEAGUE = { key: 'rugby-league', title: 'Rugby league', phrase: 'Rugby league', sport: true }

const entryOf = ({ id, title, genre = 64, pinned = true }) => ({
  channel: { id, name: `Channel ${id}`, pinned },
  now: { program_id: `${id}-now`, title, genre, start: NOW - 60_000, end: NOW + 600_000 },
})

const fishFirst = [entryOf({ id: 1, title: 'iFish' }), entryOf({ id: 2, title: 'NRL Live' })]

const tasteOf = (overrides = {}) => ({
  hiddenShows: [],
  hiddenThemes: [],
  showAffinity: {},
  themeShares: {},
  titles: {
    ifish: { kind: 'sport', sportCode: null, theme: FISHING },
    'nrl-live': { kind: 'sport', sportCode: 'rugby-league', theme: LEAGUE },
  },
  ...overrides,
})

test('onNowPickOf: without taste the first pinned live programme wins, as before', () => {
  assert.equal(onNowPickOf({ entries: fishFirst, nowMs: NOW }).now.title, 'iFish')
})

test('onNowPickOf: a sport-coded show whose theme is not a sport code is not live sport', () => {
  assert.equal(onNowPickOf({ entries: fishFirst, taste: tasteOf(), nowMs: NOW }).now.title, 'NRL Live')
})

test('onNowPickOf: hidden shows and hidden themes are skipped', () => {
  const news = [entryOf({ id: 3, title: 'World News', genre: 32 }), ...fishFirst.slice(1)]
  const liked = { showAffinity: { 'nrl-live': 0.4 } }
  assert.equal(onNowPickOf({ entries: news, taste: tasteOf(liked), nowMs: NOW }).now.title, 'NRL Live')
  assert.equal(onNowPickOf({ entries: news, taste: tasteOf({ ...liked, hiddenShows: ['nrl-live'] }), nowMs: NOW }).now.title, 'World News')
  assert.equal(onNowPickOf({ entries: news, taste: tasteOf({ ...liked, hiddenThemes: ['sport'] }), nowMs: NOW }).now.title, 'World News')
  assert.equal(onNowPickOf({ entries: news, taste: tasteOf({ ...liked, hiddenThemes: ['rugby-league'] }), nowMs: NOW }).now.title, 'World News')
})

test('onNowPickOf: a show or theme the household likes comes first', () => {
  const entries = [entryOf({ id: 4, title: 'Late News', genre: 32 }), entryOf({ id: 2, title: 'NRL Live' })]
  assert.equal(onNowPickOf({ entries, taste: tasteOf(), nowMs: NOW }).now.title, 'Late News')
  assert.equal(onNowPickOf({ entries, taste: tasteOf({ themeShares: { 'rugby-league': 0.2 } }), nowMs: NOW }).now.title, 'NRL Live')
  assert.equal(onNowPickOf({ entries, taste: tasteOf({ showAffinity: { 'nrl-live': 0.4 } }), nowMs: NOW }).now.title, 'NRL Live')
})

test('onNowMenuOf: the dislike group names the show and its theme', () => {
  const groups = onNowMenuOf({ channelName: 'Channel 1', dislike: { title: 'iFish', theme: FISHING } })
  assert.deepEqual(groups.at(-1).map((item) => item.label), ['Hide this show', 'Hide fishing shows'])
  const themeless = onNowMenuOf({ channelName: 'Channel 1', dislike: { title: 'iFish', theme: null } })
  assert.deepEqual(themeless.at(-1).map((item) => item.key), ['not-interested'])
  assert.equal(onNowMenuOf({ channelName: 'Channel 1' }).length, 2)
})

test('dislikeItemOfSlide: an On now slide gives the feedback item; other slides give none', () => {
  const slide = { type: 'on-now', source: { channel: { id: 1 }, program: { title: 'iFish', start: NOW }, theme: FISHING } }
  assert.deepEqual(dislikeItemOfSlide(slide), { title: 'iFish', start: NOW, channelId: 1, kind: null, theme: FISHING })
  assert.equal(dislikeItemOfSlide({ type: 'upcoming', source: {} }), null)
})

test('currentCandidateTestOf: an On now slide drops at once when its show or theme is hidden', () => {
  const candidate = { type: 'on-now', source: { program: { title: 'iFish' }, theme: FISHING } }
  assert.equal(currentCandidateTestOf({})(candidate), true)
  assert.equal(currentCandidateTestOf({ hiddenKeys: new Set(['ifish']) })(candidate), false)
  assert.equal(currentCandidateTestOf({ hiddenKeys: new Set(['theme:fishing']) })(candidate), false)
})

test('titleTasteFrom: reports the theme and whether the show or theme is already hidden', () => {
  assert.deepEqual(titleTasteFrom({ taste: tasteOf({ hiddenThemes: ['fishing'] }), title: 'iFish' }), {
    seriesKey: 'ifish',
    hidden: false,
    theme: FISHING,
    themeHidden: true,
  })
  assert.equal(titleTasteFrom({ taste: null, title: 'iFish' }).theme, null)
})

test('isFishingTitle: iFish counts as a fishing show', async () => {
  const { isFishingTitle } = await import('../src/for-you-themes.js')
  assert.equal(isFishingTitle('iFish'), true)
  assert.equal(isFishingTitle('Fishing Australia'), true)
  assert.equal(isFishingTitle('Selfish'), false)
})

test('dislikeLabelsOf: one wording for the show item and the theme item', async () => {
  const { dislikeLabelsOf, hiddenThemeTitleOf, programmeHiddenToastOf, themeHiddenToastOf } = await import('../src/web/for-you.js')
  const themeLabel = (theme) => dislikeLabelsOf({ theme }).theme
  assert.equal(dislikeLabelsOf({ kind: 'series' }).show, 'Hide this show')
  assert.equal(dislikeLabelsOf({ kind: 'movie' }).show, 'Hide this film')
  assert.equal(themeLabel(FISHING), 'Hide fishing shows')
  assert.equal(themeLabel(LEAGUE), 'Hide rugby league shows')
  assert.equal(themeLabel({ key: 'afl', title: 'Australian rules', sport: true }), 'Hide Australian rules shows')
  assert.equal(themeLabel({ key: 'seasonal-christmas', title: 'Christmas', seasonal: true }), 'Hide Christmas shows')
  assert.equal(themeLabel({ key: 'quiz', title: 'Quiz and game shows' }), 'Hide quiz and game shows')
  assert.equal(themeLabel({ key: 'local-life', title: 'Life in South Georgia & South Sandwich Islands' }), 'Hide shows about life in South Georgia & South Sandwich Islands')
  assert.equal(dislikeLabelsOf({ kind: 'series' }).theme, null)
  assert.equal(hiddenThemeTitleOf({ themeKey: 'fishing', title: 'Fishing', theme: true }), 'Fishing shows')
  assert.equal(programmeHiddenToastOf('series'), 'This show is hidden for 90 days')
  assert.equal(themeHiddenToastOf(FISHING), 'Fishing shows are hidden for 90 days')
  assert.equal(themeHiddenToastOf({ key: 'seasonal-christmas', title: 'Christmas', seasonal: true }), 'Christmas shows are hidden until next Christmas')
  const [notInterested, hideTheme] = onNowMenuOf({ dislike: { title: 'iFish', theme: FISHING } }).at(-1)
  assert.deepEqual([notInterested.label, hideTheme.label, notInterested.detail, hideTheme.detail], ['Hide this show', 'Hide fishing shows', undefined, undefined])
})

test('Fewer like this: the thumb sends fewer_like_this and its toast says what happens', async () => {
  const { FEWER_TOAST, thumbToggleOf } = await import('../src/web/for-you.js')
  assert.deepEqual(thumbToggleOf({ current: null, direction: 'down' }), { next: 'down', kind: 'fewer_like_this' })
  assert.deepEqual(thumbToggleOf({ current: 'down', direction: 'down' }), { next: null, kind: 'thumb_clear' })
  assert.equal(FEWER_TOAST, "You'll see fewer shows like this")
})

test('withFewerThemes: a Fewer like this show cuts the share of its themes', async () => {
  const { withFewerThemes } = await import('../src/for-you.js')
  const household = { groups: new Map([['fishing', { group: 'fishing', share: 0.5 }], ['cooking', { group: 'cooking', share: 0.3 }]]), hidden: new Set() }
  const tagsByKey = new Map([['ifish', { entries: [{ group: 'fishing', weight: 1 }] }]])
  const cut = withFewerThemes({ household, fewer: [{ key: 'ifish', fewerWeight: 1 }], tagsByKey })
  assert.ok(Math.abs(cut.groups.get('fishing').share - 0.1) < 1e-9)
  assert.equal(cut.groups.get('cooking').share, 0.3)
  assert.equal(withFewerThemes({ household, fewer: [], tagsByKey }), household)
})
