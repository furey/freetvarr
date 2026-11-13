import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.DB_PATH ??= path.join(os.tmpdir(), `freetvarr-for-you-themes-${process.pid}.db`)

const { buildForYou } = await import('../src/for-you.js')
const { THEME_CATALOGUE_VERSION, sportLabelOf, themeCatalogueOf } = await import('../src/for-you-theme-catalogue.js')
const {
  createThemeIndex,
  dedupeThemeRow,
  householdEpisodesOf,
  hiddenThemesOf,
  householdThemesOf,
  isKidsSlot,
  rankSportCandidates,
  rankThemeCandidates,
  selectSportCodes,
  selectThemeGroups,
  sportAiringKindOf,
  sportCodeOf,
  tagTitle,
  themeChoicesOf,
  themeSettingsOf,
  themeMutesOf,
  titleKindOf,
} = await import('../src/for-you-themes.js')
const { countryForTimeZone } = await import('../src/zone-countries.js')
const { identityOf, isHiddenSuggestion, menuOf, rowMenuOf, sectionsOf, themeGroupsOf, themeHiddenKeyOf, themesOnCountOf } = await import('../src/web/for-you.js')

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const NOW = Date.UTC(2026, 9, 20, 8, 0)
const index = createThemeIndex({ country: 'au' })
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/for-you-theme-vectors.json', import.meta.url), 'utf8'))

const titleOfZone = (zone) => themeCatalogueOf({ country: countryForTimeZone(zone) }).find((category) => category.key === 'local-life').title

test('local life row: named after the country of the time zone', () => {
  assert.equal(titleOfZone('Australia/Sydney'), 'Life in Australia')
  assert.equal(titleOfZone('Pacific/Auckland'), 'Life in New Zealand')
  assert.equal(titleOfZone('Europe/London'), 'Life in the United Kingdom')
  assert.equal(titleOfZone('America/New_York'), 'Life in the United States')
  assert.equal(titleOfZone('Etc/Unknown'), 'Local life')
})

test('local life prototypes are filled with the country, and other prototypes name no country', () => {
  const nz = themeCatalogueOf({ country: 'nz' })
  const local = nz.find((category) => category.key === 'local-life').subthemes.flatMap((subtheme) => subtheme.prototypes)
  assert.ok(local.every((text) => text.endsWith('in New Zealand.')))
  const unknown = themeCatalogueOf({ country: '' }).find((category) => category.key === 'local-life').subthemes.flatMap((subtheme) => subtheme.prototypes)
  assert.ok(unknown.every((text) => !text.includes('{in}') && !/ in \./.test(text)))
  const others = nz.filter((category) => category.key !== 'local-life' && category.key !== 'sport').flatMap((category) => category.subthemes.flatMap((subtheme) => subtheme.prototypes))
  assert.ok(others.every((text) => !/australia|aussie|new zealand|queensland|victoria|\bnsw\b|tradies|barramundi/i.test(text)), 'no country-only wording')
})

test('sport rows are named by sport, with the local name for football', () => {
  assert.equal(sportLabelOf({ code: 'soccer', country: 'au' }), 'Football (soccer)')
  assert.equal(sportLabelOf({ code: 'soccer', country: 'uk' }), 'Football')
  assert.equal(sportLabelOf({ code: 'soccer', country: 'nz' }), 'Football')
  assert.equal(sportLabelOf({ code: 'soccer', country: 'us' }), 'Soccer')
  assert.equal(sportLabelOf({ code: 'american-football', country: 'us' }), 'Football')
  assert.equal(sportLabelOf({ code: 'american-football', country: 'uk' }), 'American football')
  assert.equal(sportLabelOf({ code: 'rugby-league', country: 'au' }), 'Rugby league')
  assert.equal(sportLabelOf({ code: 'rugby-league', country: 'uk' }), 'Rugby league')
  assert.equal(sportLabelOf({ code: 'rugby-union', country: 'nz' }), 'Rugby union')
  assert.equal(sportLabelOf({ code: 'afl', country: 'au' }), 'Australian rules')
  assert.equal(sportLabelOf({ code: 'greyhound-racing', country: 'au' }), 'Greyhound racing')
})

test('sport codes: keywords first, and plain "football" depends on the country', () => {
  assert.equal(sportCodeOf({ title: 'Rugby League World Cup 2026', country: 'au' }), 'rugby-league')
  assert.equal(sportCodeOf({ title: 'AFL: Grand Final', country: 'uk' }), 'afl')
  assert.equal(sportCodeOf({ title: 'Super Rugby Pacific', country: 'nz' }), 'rugby-union')
  assert.equal(sportCodeOf({ title: 'Supercars: Bathurst 1000', country: 'au' }), 'motorsport')
  assert.equal(sportCodeOf({ title: 'Saturday Night Racing', channelNames: ['Racing.com'], country: 'au' }), 'horse-racing')
  assert.equal(sportCodeOf({ title: 'A-League Men: Sydney v Melbourne', country: 'au' }), 'soccer')
  assert.equal(sportCodeOf({ title: 'Live Football', country: 'au' }), null)
  assert.equal(sportCodeOf({ title: 'Live Football', country: 'uk' }), 'soccer')
  assert.equal(sportCodeOf({ title: 'Live Football', country: 'nz' }), 'soccer')
  assert.equal(sportCodeOf({ title: 'Live Football', country: 'us' }), 'american-football')
  assert.equal(sportCodeOf({ title: 'Footy Classified', country: 'au' }), 'afl')
  assert.equal(sportCodeOf({ title: 'SANFL: Grand Final', country: 'au' }), 'afl')
  assert.equal(sportCodeOf({ title: 'NRLW: Broncos v Roosters', country: 'au' }), 'rugby-league')
  assert.equal(sportCodeOf({ title: 'State of Origin', country: 'au' }), 'rugby-league')
  assert.equal(sportCodeOf({ title: 'The Agenda Setters: Rugby League', country: 'au' }), 'rugby-league')
  assert.equal(sportCodeOf({ title: 'Bledisloe Cup: Wallabies v All Blacks', country: 'au' }), 'rugby-union')
  assert.equal(sportCodeOf({ title: 'Cricket World Cup', country: 'au' }), 'cricket')
  assert.equal(sportCodeOf({ title: 'BBL: Sixers v Thunder', country: 'au' }), 'cricket')
  assert.equal(sportCodeOf({ title: 'FIFA World Cup Qualifier', country: 'au' }), 'soccer')
  assert.equal(sportCodeOf({ title: 'NBL: Kings v Breakers', country: 'au' }), 'basketball')
  assert.equal(sportCodeOf({ title: 'Formula 1: Las Vegas Grand Prix', country: 'au' }), 'motorsport')
  assert.equal(sportCodeOf({ title: 'Harness Racing: Inter Dominion', country: 'au' }), 'horse-racing')
  assert.equal(sportCodeOf({ title: 'Greyhounds Live', country: 'au' }), 'greyhound-racing')
})

test('kind gate: kids channels and OP-39 kids codes, sport, scripted and factual', () => {
  assert.equal(titleKindOf({ genre: 0x50 }), 'kids')
  assert.equal(titleKindOf({ channelNames: ['ABC Kids'] }), 'kids')
  assert.equal(titleKindOf({ channelNames: ['ABC Kids/ABC Family'] }), 'unknown')
  assert.equal(titleKindOf({ channelNames: ['ABC Kids/ABC Family'], kidsSlotsOnly: true }), 'kids')
  const hourOf = (ms) => new Date(ms).getUTCHours()
  assert.equal(isKidsSlot({ channelName: 'ABC Kids/ABC Family', start: Date.UTC(2026, 9, 20, 9), hourOf }), true)
  assert.equal(isKidsSlot({ channelName: 'ABC Kids/ABC Family', start: Date.UTC(2026, 9, 20, 20), hourOf }), false)
  assert.equal(isKidsSlot({ channelName: 'Nickelodeon', start: Date.UTC(2026, 9, 20, 20), hourOf }), true)
  assert.equal(titleKindOf({ categories: ['sport'] }), 'sport')
  assert.equal(titleKindOf({ tvmazeType: 'Scripted', categories: ['drama'] }), 'fiction')
  assert.equal(titleKindOf({ tvmazeType: 'Reality', categories: ['food'] }), 'factual')
  assert.equal(titleKindOf({ categories: ['drama'] }), 'fiction')
  assert.equal(titleKindOf({ categories: ['drama', 'documentary'] }), 'factual')
  assert.equal(titleKindOf({ film: true, categories: ['drama'] }), 'film')
  assert.equal(titleKindOf({}), 'unknown')
})

test('kind gate: fiction takes only fiction themes, kids take only Kids', () => {
  const prototypes = new Map([['cooking-recipes', [axis(0)]], ['drama-family', [axis(1)]], ['reality-competition', [axis(2)]]])
  const fiction = tagTitle({ index, facts: facts({ tvmazeType: 'Scripted' }), titleVector: blend([0, 0.9], [1, 0.5]), prototypes })
  assert.deepEqual(fiction.entries.map((entry) => entry.subtheme), ['drama-family'])
  const kids = tagTitle({ index, facts: facts({ genre: 0x50 }), titleVector: axis(0), prototypes })
  assert.deepEqual(kids.entries.map((entry) => entry.category), ['kids'])
})

test('a title takes one format and one topic at most, weighted by the 0.30 to 0.45 ramp', () => {
  const prototypes = new Map([
    ['reality-competition', [axis(0)]],
    ['quiz-trivia', [axis(1)]],
    ['home-renovation', [axis(2)]],
    ['cooking-competition', [axis(3)]],
  ])
  const tags = tagTitle({ index, facts: facts({ tvmazeType: 'Reality' }), titleVector: blend([0, 0.5], [1, 0.47], [2, 0.48], [3, 0.46]), prototypes })
  assert.deepEqual(tags.entries.map((entry) => entry.category).sort(), ['home', 'reality'])
  assert.ok(tags.entries.every((entry) => entry.member))
  const sum = tags.entries.reduce((total, entry) => total + entry.weight, 0)
  assert.ok(Math.abs(sum - 1) < 1e-6)
  const weak = tagTitle({ index, facts: facts({ tvmazeType: 'Reality' }), titleVector: blend([0, 0.36], [5, 0.9]), prototypes })
  assert.equal(weak.entries.length, 1)
  assert.ok(weak.entries[0].weight > 0.39 && weak.entries[0].weight < 0.41)
  assert.equal(weak.entries[0].member, false)
})

test('a far weaker second theme is left out', () => {
  const prototypes = new Map([['quiz-trivia', [axis(0)]], ['cooking-competition', [axis(1)]]])
  const tags = tagTitle({ index, facts: facts({ tvmazeType: 'Game Show' }), titleVector: blend([0, 0.73], [1, 0.44]), prototypes })
  assert.deepEqual(tags.entries.map((entry) => entry.category), ['quiz'])
})

test('model vectors: The Block is home and reality, Love Island is reality dating, quiz shows are not cooking', () => {
  assert.equal(fixture.catalogueVersion, THEME_CATALOGUE_VERSION)
  const prototypes = new Map(Object.entries(fixture.prototypes).map(([key, list]) => [key, list.map(decoded)]))
  const tagsOf = (title) => tagTitle({ index, facts: facts({ title, tvmazeType: 'Reality' }), titleVector: decoded(fixture.titles[title].vector), prototypes })
  const block = tagsOf('The Block')
  assert.deepEqual(block.entries.map((entry) => entry.category).sort(), ['home', 'reality'])
  assert.equal(block.entries.find((entry) => entry.category === 'home').subtheme, 'home-renovation')
  assert.deepEqual(tagsOf('Love Island Australia').entries.map((entry) => entry.subtheme), ['reality-dating'])
  assert.equal(tagsOf('My Kitchen Rules').entries[0].subtheme, 'cooking-competition')
  assert.ok(!tagsOf('Jeopardy!').entries.some((entry) => entry.category === 'cooking'))
  assert.ok(!tagsOf('House Rules').entries.some((entry) => entry.category === 'cooking'))
})

test('sport titles: league before union, and fishing filed as sport goes to Fishing', () => {
  const league = tagTitle({ index, facts: facts({ title: 'Rugby League World Cup 2026', categories: ['sport'] }) })
  assert.equal(league.sportCode, 'rugby-league')
  assert.equal(index.groups.get(league.entries[0].group).title, 'Rugby league')
  const fishing = tagTitle({ index, facts: facts({ title: 'Escape Fishing With ET', categories: ['sport'] }) })
  assert.deepEqual(fishing.entries.map((entry) => entry.group), ['fishing'])
  assert.equal(fishing.sportCode, null)
})

test('basic tier: keyword and genre rules still tag titles', () => {
  const block = tagTitle({ index, facts: facts({ title: 'The Block', tvmazeType: 'Reality', categories: ['reality'] }) })
  assert.deepEqual(block.entries.map((entry) => entry.category).sort(), ['home', 'reality'])
  const love = tagTitle({ index, facts: facts({ title: 'Love Island Australia', tvmazeType: 'Reality', categories: ['reality'] }) })
  assert.deepEqual(love.entries.map((entry) => entry.subtheme), ['reality-dating'])
  const cooking = tagTitle({ index, facts: facts({ title: 'Recipe of the Year', categories: ['food'] }) })
  assert.deepEqual(cooking.entries.map((entry) => entry.category), ['cooking'])
  const news = tagTitle({ index, facts: facts({ title: 'Seven News', categories: ['news'] }) })
  assert.equal(news.bulletin, true)
})

test('affinity: record 3, watch 2, accepted 1, opened 0.5, counted once per episode', () => {
  const keyOf = (title) => title.toLowerCase()
  const recordings = [
    { recording_id: 'r1', title: 'Show', season: 1, episode: 1, aired_at: NOW },
    { recording_id: 'r2', title: 'Show', season: 1, episode: 1, aired_at: NOW - HOUR },
  ]
  const events = [
    { kind: 'record_request', title: 'Show', channel_id: 'a', programme_start: NOW, ts: NOW },
    { kind: 'watch_start', title: 'Show', recording_id: 'r1', ts: NOW },
    { kind: 'watch_end', title: 'Show', recording_id: 'r2', ts: NOW },
    { kind: 'suggestion_accepted', title: 'Other', channel_id: 'a', programme_start: NOW, ts: NOW },
    { kind: 'programme_opened', title: 'Other', channel_id: 'a', programme_start: NOW, ts: NOW },
    { kind: 'programme_opened', title: 'Old', channel_id: 'a', programme_start: NOW - 60 * DAY, ts: NOW - 60 * DAY },
  ]
  const programmeAt = ({ start }) => (start === NOW ? { series_no: 1, episode_no: 1 } : null)
  const weights = householdEpisodesOf({ events, recordings, keyOf, programmeAt, nowMs: NOW })
  assert.equal(weights.get('show').episodes, 1)
  assert.equal(weights.get('show').weight, 5)
  assert.equal(weights.get('other').weight, 1.5)
  assert.ok(Math.abs(weights.get('old').weight - 0.25) < 1e-9)
})

test('affinity: one title holds at most 30% of a category, and news bulletins leave the share total', () => {
  const tagsByKey = new Map([
    ['big', cookingTags()],
    ['small-a', cookingTags()],
    ['small-b', cookingTags()],
    ['quiz', quizTags()],
    ['news', { kind: 'factual', bulletin: true, entries: [] }],
  ])
  const weights = new Map([['big', { weight: 80 }], ['small-a', { weight: 5 }], ['small-b', { weight: 5 }], ['quiz', { weight: 10 }], ['news', { weight: 400 }]])
  const household = householdThemesOf({ index, weights, tagsByKey, nowMs: NOW })
  assert.equal(household.total, 100)
  const cooking = household.groups.get('cooking')
  assert.equal(cooking.titles, 3)
  assert.ok(Math.abs(cooking.share - (27 + 5 + 5) / 100) < 1e-9)
  assert.ok(Math.abs(household.groups.get('quiz').share - 0.03) < 1e-9)
})

test('rows: a 4% share and 4 upcoming items, three rows at most', () => {
  const household = householdOf({ cooking: [0.3, 5], reality: [0.03, 5], home: [0.04, 5], travel: [0.09, 2], history: [0.2, 5] })
  const itemCounts = new Map([['cooking', 9], ['reality', 9], ['home', 9], ['travel', 9], ['history', 3]])
  assert.deepEqual(selectThemeGroups({ household, itemCounts }).map((entry) => entry.group), ['cooking', 'home'])
  const many = householdOf({ cooking: [0.3, 5], reality: [0.2, 5], home: [0.1, 5], travel: [0.05, 5] })
  const counts = new Map([['cooking', 9], ['reality', 9], ['home', 9], ['travel', 9]])
  assert.deepEqual(selectThemeGroups({ household: many, itemCounts: counts }).map((entry) => entry.group), ['cooking', 'reality', 'home'])
})

test('sport row: one code takes its name, one title is enough, matches first and replays last', () => {
  const one = householdOf({ afl: [0.2, 1], cricket: [0.03, 3] })
  const counts = new Map([['afl', 6], ['cricket', 6]])
  assert.deepEqual(selectSportCodes({ household: one, itemCounts: counts }).map((entry) => entry.info.title), ['Australian rules'])
  const two = householdOf({ afl: [0.2, 2], cricket: [0.1, 2] })
  assert.equal(selectSportCodes({ household: two, itemCounts: counts }).length, 2)
  assert.equal(sportAiringKindOf({ title: 'Rugby League World Cup 2026', episodeTitle: 'Australia v New Zealand' }), 'match')
  assert.equal(sportAiringKindOf({ title: 'NRL 360' }), 'show')
  assert.equal(sportAiringKindOf({ title: 'Rugby League World Cup 2026', episodeTitle: 'Post Game Semi Final: New Zealand v Tonga' }), 'show')
  const repeats = rankSportCandidates(['a', 'b'].map((id, i) => ({ key: 'cup', start: NOW + i * HOUR, sportKind: 'match', programme: { episode_title: 'Final: Australia v Fiji' } })))
  assert.equal(repeats.length, 1)
  assert.equal(sportAiringKindOf({ title: 'Rugby League World Cup 2026', episodeTitle: 'Highlights' }), 'replay')
  const ranked = rankSportCandidates([
    { key: 'replay', start: NOW, sportKind: 'replay' },
    { key: 'show', start: NOW + HOUR, sportKind: 'show' },
    { key: 'later-match', start: NOW + DAY, sportKind: 'match' },
    { key: 'match', start: NOW + 2 * HOUR, sportKind: 'match' },
  ])
  assert.deepEqual(ranked.map((candidate) => candidate.key), ['match', 'later-match', 'show', 'replay'])
  const capped = rankSportCandidates(Array.from({ length: 5 }, (_, i) => ({ key: 'cup', start: NOW + i * HOUR, sportKind: 'match' })))
  assert.equal(capped.length, 3)
})

test('boost and off: More multiplies the share by 1.5 once, and a theme turned off stops counting', () => {
  const tagsByKey = new Map([['a', cookingTags()], ['b', cookingTags()], ['c', cookingTags()], ['q', quizTags()]])
  const weights = new Map([['a', { weight: 10 }], ['b', { weight: 10 }], ['c', { weight: 10 }], ['q', { weight: 10 }]])
  const { mutes, boosts } = themeChoicesOf([
    { kind: 'theme_boosted', series_key: 'theme-cooking', ts: NOW - DAY },
    { kind: 'theme_boosted', series_key: 'theme-cooking', ts: NOW - HOUR },
  ])
  const plain = householdThemesOf({ index, weights, tagsByKey, nowMs: NOW }).groups.get('cooking').share
  const boosted = householdThemesOf({ index, weights, tagsByKey, mutes, boosts, nowMs: NOW }).groups.get('cooking')
  assert.ok(Math.abs(boosted.share - plain * 1.5) < 1e-9)
  assert.equal(boosted.boosted, true)
  const off = householdThemesOf({ index, weights, tagsByKey, off: new Set(['cooking']), nowMs: NOW })
  assert.equal(off.groups.has('cooking'), false)
  assert.equal(off.hidden.has('cooking'), true)
  const settings = themeSettingsOf({ index, mutes: new Map([['quiz', NOW - DAY]]), off: new Set(['cooking']), nowMs: NOW })
  assert.equal(settings.find((theme) => theme.key === 'cooking').on, false)
  assert.equal(settings.find((theme) => theme.key === 'quiz').on, false)
  assert.equal(settings.find((theme) => theme.key === 'travel').on, true)
  assert.equal(settings.find((theme) => theme.key === 'afl').sport, true)
  assert.ok(!settings.some((theme) => ['news', 'kids', 'other-sport'].includes(theme.key)))
  assert.deepEqual(hiddenThemesOf({ index, mutes: new Map([['quiz', NOW - DAY]]), nowMs: NOW }).map((entry) => [entry.seriesKey, entry.title]), [['theme:quiz', 'Quiz and game shows']])
  const offShare = householdThemesOf({ index, weights, tagsByKey, off: new Set(['cooking']), nowMs: NOW })
  assert.equal(offShare.total, 10)
  assert.ok(Math.abs(offShare.groups.get('quiz').share - 0.3) < 1e-9)
  const muted = themeChoicesOf([
    { kind: 'theme_boosted', series_key: 'theme-cooking', ts: NOW - DAY },
    { kind: 'theme_muted', series_key: 'theme-cooking', ts: NOW },
  ])
  assert.equal(muted.boosts.has('cooking'), false)
})

test('rows rank by the household subthemes first, and leave out subthemes under 25%', () => {
  const entry = { subthemes: new Map([['cooking-competition', 0.7], ['cooking-recipes', 0.2], ['cooking-food-culture', 0.1]]) }
  const ranked = rankThemeCandidates({
    entry,
    candidates: [
      { key: 'a', subtheme: 'cooking-recipes', score: 0.9, start: NOW },
      { key: 'b', subtheme: 'cooking-competition', score: 0.1, start: NOW },
      { key: 'c', subtheme: 'cooking-competition', score: 0.5, start: NOW },
    ],
  })
  assert.deepEqual(ranked.map((candidate) => candidate.key), ['c', 'b'])
})

test('dedupe: a row is hidden when more than half its items show elsewhere, else repeats are dropped', () => {
  const ranked = ['a', 'b', 'c', 'd', 'e', 'f'].map((key) => ({ key }))
  assert.deepEqual(dedupeThemeRow({ ranked, used: new Set(['a', 'b', 'c', 'd']), limit: 6 }), [])
  assert.deepEqual(dedupeThemeRow({ ranked, used: new Set(['a', 'b']), limit: 6 }).map((candidate) => candidate.key), ['c', 'd', 'e', 'f'])
})

test('mute: hides the row and keeps 0.2 of the share for 90 days, then expires; undo clears it', () => {
  const mutes = themeMutesOf([{ kind: 'theme_muted', series_key: 'theme-cooking', ts: NOW - DAY }])
  const tagsByKey = new Map(['a', 'b', 'c'].map((key) => [key, cookingTags()]))
  const weights = new Map(['a', 'b', 'c'].map((key) => [key, { weight: 10 }]))
  const fresh = householdThemesOf({ index, weights, tagsByKey, mutes, nowMs: NOW })
  assert.equal(fresh.groups.get('cooking').muted, true)
  assert.ok(Math.abs(fresh.groups.get('cooking').share - (27 * 0.2) / 30) < 1e-9)
  const later = householdThemesOf({ index, weights, tagsByKey, mutes, nowMs: NOW + 91 * DAY })
  assert.equal(later.groups.get('cooking').muted, false)
  assert.ok(Math.abs(later.groups.get('cooking').share - 27 / 30) < 1e-9)
  const reboosted = themeChoicesOf([
    { kind: 'theme_muted', series_key: 'theme-cooking', ts: NOW - DAY },
    { kind: 'theme_boosted', series_key: 'theme-cooking', ts: NOW - HOUR },
  ])
  assert.equal(reboosted.mutes.has('cooking'), false)
  assert.equal(reboosted.boosts.has('cooking'), true)
  const restored = themeChoicesOf([
    { kind: 'theme_boosted', series_key: 'theme-cooking', ts: NOW - 2 * DAY },
    { kind: 'theme_muted', series_key: 'theme-cooking', ts: NOW - DAY },
    { kind: 'theme_unmuted', series_key: 'theme-cooking', ts: NOW - HOUR },
  ])
  assert.equal(restored.boosts.has('cooking'), true)
  const plainUndo = themeChoicesOf([
    { kind: 'theme_muted', series_key: 'theme-cooking', ts: NOW - DAY },
    { kind: 'theme_unmuted', series_key: 'theme-cooking', ts: NOW - HOUR },
  ])
  assert.equal(plainUndo.boosts.has('cooking'), false)
  const undone = themeMutesOf([
    { kind: 'theme_muted', series_key: 'theme-cooking', ts: NOW - DAY },
    { kind: 'theme_unmuted', series_key: 'theme-cooking', ts: NOW },
  ])
  assert.equal(undone.size, 0)
})

test('For you: a basic-tier household gets a Cooking row with its own shows left out, and muting removes it', () => {
  const own = ['Recipe Hour', 'Kitchen Nights', 'Bake Off Weekly', 'Chef At Home']
  const others = ['Market Kitchen', 'Cook Club', 'Kitchen Garden', 'Chefs Table', 'Pastry Lab', 'Cooking Simply', 'Soup Season', 'Grill Masters']
  const programmes = [...own, ...others, 'Garden Patch', 'Quiz Night'].map((title, i) => airing(title, { start: NOW + (i + 2) * HOUR }))
  const genresByKey = new Map([...own, ...others].map((title) => [title.toLowerCase().replace(/\s+/g, '-'), { categories: ['food'], genres: ['Food'], source: 'tvmaze:1' }]))
  const events = [...own, 'Garden Patch'].flatMap((title, i) => [
    { id: i * 3 + 1, kind: 'record_request', title, channel_id: 'seven', programme_start: NOW - (i + 1) * DAY, ts: NOW - (i + 1) * DAY, meta_json: '{"type":"episode"}' },
    { id: i * 3 + 2, kind: 'watch_start', title, channel_id: 'seven', programme_start: NOW - (i + 1) * DAY, ts: NOW - (i + 1) * DAY },
  ])
  const run = (extra = []) => buildForYou({ nowMs: NOW, programmes, events: [...events, ...extra], channels: [{ id: 'seven', name: 'Seven' }], genresByKey, timeZone: 'Australia/Sydney', limit: 20 })
  const result = run()
  const row = result.sections.find((section) => section.key === 'theme-cooking')
  assert.equal(row?.title, 'Cooking')
  assert.ok(row.items.length >= 4)
  assert.ok(row.items.every((item) => item.theme.key === 'cooking' && !own.includes(item.title)))
  const elsewhere = new Set(result.sections.filter((section) => section !== row).flatMap((section) => section.items.map((item) => item.seriesKey)))
  assert.ok(row.items.every((item) => !elsewhere.has(item.seriesKey)))
  assert.match(result.explanations.get(row.items[0].id).reasons[0].text, /cooking/)
  const muted = run([{ id: 99, kind: 'theme_muted', series_key: 'theme-cooking', title: 'Cooking', ts: NOW - HOUR }])
  assert.equal(muted.sections.find((section) => section.key === 'theme-cooking'), undefined)
  assert.deepEqual(row.theme, { key: 'cooking', title: 'Cooking', phrase: 'cooking' })
  const off = buildForYou({ nowMs: NOW, programmes, events, channels: [{ id: 'seven', name: 'Seven' }], genresByKey, timeZone: 'Australia/Sydney', limit: 20, themesOff: ['cooking'] })
  assert.equal(off.sections.find((section) => section.key === 'theme-cooking'), undefined)
})

test('web: theme cards offer Hide for their row, and a muted row hides its cards', () => {
  const item = { id: '1', title: 'Recipe Hour', seriesKey: 'recipe-hour', channelId: 'seven', start: NOW + HOUR, stop: NOW + 2 * HOUR, theme: { key: 'cooking', title: 'Cooking', phrase: 'cooking' } }
  const more = menuOf({ item, nowMs: NOW, timeZone: 'UTC' }).more
  assert.deepEqual(more.find((entry) => entry.key === 'fewer-theme'), { key: 'fewer-theme', label: 'Hide cooking shows', icon: 'hide' })
  assert.deepEqual(rowMenuOf(item.theme).map((entry) => entry.label), ['More Cooking', 'Hide cooking shows'])
  assert.equal(menuOf({ item: { ...item, theme: undefined }, nowMs: NOW, timeZone: 'UTC' }).more.some((entry) => entry.key === 'fewer-theme'), false)
  const hidden = new Set([themeHiddenKeyOf('cooking')])
  assert.equal(isHiddenSuggestion({ item, hiddenKeys: hidden }), true)
  assert.equal(isHiddenSuggestion({ item: { ...item, theme: null }, hiddenKeys: hidden }), false)
  const payload = { sections: [
    { key: 'premieres', title: 'Premieres this week', items: [{ ...item, id: '2', title: 'New', seriesKey: 'new', theme: null }] },
    { key: 'theme-cooking', title: 'Cooking', items: [item] },
    { key: 'might-like', title: 'You might like', items: [{ ...item, id: '3', title: 'Other', seriesKey: 'other', theme: null }] },
  ] }
  assert.deepEqual(sectionsOf({ payload }).map((section) => section.key), ['might-like', 'theme-cooking', 'premieres'])
  assert.deepEqual(sectionsOf({ payload, hiddenKeys: hidden }).map((section) => section.key), ['might-like', 'premieres'])
  assert.equal(identityOf(item), 'recipe-hour')
  assert.equal(sectionsOf({ payload: { sections: [{ key: 'theme-cooking', title: 'Cooking', theme: item.theme, items: [item] }] } })[0].theme.key, 'cooking')
  const groups = themeGroupsOf([{ key: 'cooking', title: 'Cooking', on: true, sport: false }, { key: 'afl', title: 'Australian rules', on: false, sport: true }])
  assert.deepEqual(groups.map((group) => group.label), ['Themes', 'Sport'])
  assert.equal(themesOnCountOf([{ on: true }, { on: false }]), '1 of 2')
  const sport = { key: 'rugby-league', title: 'Rugby league', phrase: 'Rugby league', sport: true }
  const matches = ['1', '2'].map((id) => ({ ...item, id, title: 'Cup', seriesKey: 'cup', theme: sport }))
  const sportPayload = { sections: [{ key: 'might-like', items: [{ ...matches[0], id: '0', theme: null }] }, { key: 'theme-rugby-league', title: 'Rugby league', theme: sport, items: matches }] }
  assert.deepEqual(sectionsOf({ payload: sportPayload })[1].rows.flatMap((row) => row.items.map((entry) => entry.id)), ['1', '2'])
})

const DIMS = 8

const axis = (i) => Float32Array.from({ length: DIMS }, (_, j) => (j === i ? 1 : 0))

const blend = (...parts) => {
  const vector = new Float32Array(DIMS)
  for (const [i, value] of parts) vector[i] = value
  const rest = 1 - parts.reduce((sum, [, value]) => sum + value * value, 0)
  if (rest > 0) vector[DIMS - 1] = Math.sqrt(rest)
  return vector
}

const decoded = (base64) => {
  const bytes = Buffer.from(base64, 'base64')
  return Float32Array.from(new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length), (value) => value / fixture.scale)
}

const facts = (extra = {}) => ({ key: 'title', title: 'Title', hashes: new Set(), categories: [], channelNames: [], guideCategories: [], genre: null, tvmazeType: null, film: false, ...extra })

const cookingTags = () => ({ kind: 'factual', bulletin: false, entries: [{ category: 'cooking', group: 'cooking', subtheme: 'cooking-recipes', weight: 1, member: true }] })

const quizTags = () => ({ kind: 'factual', bulletin: false, entries: [{ category: 'quiz', group: 'quiz', subtheme: 'quiz-trivia', weight: 1, member: true }] })

const householdOf = (shares) => ({
  hidden: new Set(),
  groups: new Map(Object.entries(shares).map(([group, [share, titles]]) => [group, { group, info: index.groups.get(group), share, titles, muted: false, subthemes: new Map() }])),
})

let nextId = 9000

const airing = (title, extra = {}) => {
  const start = extra.start ?? NOW + 3 * HOUR
  return {
    program_id: nextId++,
    channel_id: 'seven',
    title,
    episode_title: null,
    synopsis: `${title} synopsis`,
    start,
    end: start + HOUR,
    series_no: 1,
    episode_no: 2,
    series_link: `seven|${title.toLowerCase()}`,
    genre: null,
    image: 'https://example.com/i.jpg',
    ...extra,
  }
}
