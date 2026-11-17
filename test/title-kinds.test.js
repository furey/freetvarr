import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-title-kinds-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')
const {
  createTitleKindStore,
  decideTitleKind,
  guideKindUpdatesOf,
  libraryKindUpdatesOf,
  loadTitleKinds,
  mergeTitleKinds,
  requestKindOf,
  withTitleKinds,
} = await import('../src/title-kinds.js')
const { airingKindOf, createAiringKinds, displayKindOf } = await import('../src/display-kind.js')
const { isFilmAiring } = await import('../src/genre-enrichment.js')
const { canonicalKindOf, storedKindOf } = await import('../src/art-resolver.js')
const { seriesKindOf } = await import('../src/series-kind.js')
const { showKeyOf } = await import('../src/web/show-key.js')

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

const HOUR = 60 * 60 * 1000
const START = Date.parse('2026-11-16T19:30:00+11:00')

const airing = ({ title, hours = 2, at = 0, ...rest }) => ({
  title,
  start: START + at * 24 * HOUR,
  end: START + at * 24 * HOUR + hours * HOUR,
  series_no: null,
  episode_no: null,
  episode_title: null,
  genre: null,
  ...rest,
})

const NBL_GAME = airing({ title: 'NBL: Tasmania JackJumpers v Illawarra Hawks' })
const OTHER_NBL_GAME = airing({ title: 'NBL: Melbourne United v New Zealand Breakers', at: 1 })
const BILLIE_JEAN_KING_CUP = airing({ title: 'Billie Jean King Cup', hours: 6 })
const FARGO_FILM = airing({ title: 'Fargo', synopsis: 'An inept car salesman plans to kidnap his wife. (1996)' })
const EUROVISION_ASIA = airing({ title: 'Eurovision Song Contest Asia', hours: 3 })
const ZOG_EPISODES = [23, 24, 25, 26].map((episode, at) => airing({ title: 'Zog', hours: 0.2, at, series_no: 1, episode_no: episode, episode_title: `Episode ${episode}` }))

const SPORT_CATEGORIES = new Map([
  [NBL_GAME.title, ['sport']],
  [OTHER_NBL_GAME.title, ['sport']],
  [BILLIE_JEAN_KING_CUP.title, ['sport']],
])

const LIBRARY_KINDS = new Map([['Zog', ['movie']], ['Fargo', ['series']]])

const guideRowsOf = (programmes) => {
  const updates = guideKindUpdatesOf({
    programmes,
    airingKindOf: createAiringKinds({ programmes }),
    categoriesOf: (title) => SPORT_CATEGORIES.get(title) ?? [],
    libraryKindsOf: (title) => LIBRARY_KINDS.get(title) ?? [],
  })
  const { rows } = mergeTitleKinds({ updates, nowMs: 1 })
  return new Map(rows.map((row) => [row.showKey, row]))
}

const LIVE_GUIDE = [NBL_GAME, OTHER_NBL_GAME, BILLIE_JEAN_KING_CUP, FARGO_FILM, EUROVISION_ASIA, ...ZOG_EPISODES]

test('decideTitleKind: the override, then one library kind, then the guide majority, then a hint', () => {
  const guide = { kind: 'one-off', seen: ['one-off'] }
  const table = [
    [{ override: 'movie', library: ['series'], guide, hint: 'series' }, { kind: 'movie', source: 'override' }],
    [{ override: 'show', library: ['movie'] }, { kind: 'series', source: 'override' }],
    [{ override: 'one-off', guide: { kind: 'movie', seen: ['movie'] } }, { kind: 'one-off', source: 'override' }],
    [{ library: ['movie'], guide, hint: 'series' }, { kind: 'movie', source: 'library' }],
    [{ library: ['movie', 'series'], guide, hint: 'series' }, { kind: 'one-off', source: 'guide' }],
    [{ guide, hint: 'movie' }, { kind: 'one-off', source: 'guide' }],
    [{ hint: 'series' }, { kind: 'series', source: 'hint' }],
    [{ override: 'not-movie', library: ['movie'], hint: 'movie' }, { kind: 'series', source: 'hint' }],
    [{}, null],
  ]
  for (const [evidence, decided] of table) assert.deepEqual(decideTitleKind(evidence), decided, JSON.stringify(evidence))
})

test('a guide sport category blocks a film: the NBL games and the Billie Jean King Cup are one-offs everywhere', () => {
  for (const programme of [NBL_GAME, OTHER_NBL_GAME, BILLIE_JEAN_KING_CUP]) assert.equal(airingKindOf({ programme }), 'movie', programme.title)
  const rows = guideRowsOf(LIVE_GUIDE)
  for (const programme of [NBL_GAME, OTHER_NBL_GAME, BILLIE_JEAN_KING_CUP]) {
    const row = rows.get(showKeyOf(programme.title))
    assert.deepEqual({ kind: row.kind, source: row.source }, { kind: 'one-off', source: 'guide' }, programme.title)
    const record = { titleKind: row }
    assert.equal(displayKindOf({ programme, record }), 'one-off')
    assert.equal(isFilmAiring({ programme, record }), false)
    assert.equal(storedKindOf({ row, hint: 'movie' }), 'one-off')
  }
})

test('a guide news category blocks a film too, unless the guide also lists it as a movie', () => {
  const special = airing({ title: 'Election Night Special Report' })
  const news = guideKindUpdatesOf({ programmes: [special], airingKindOf: () => 'movie', categoriesOf: () => ['news'] })
  assert.equal(decideTitleKind(news.get('election-night-special-report')).kind, 'one-off')
  const film = guideKindUpdatesOf({ programmes: [special], airingKindOf: () => 'movie', categoriesOf: () => ['news', 'movie'] })
  assert.equal(decideTitleKind(film.get('election-night-special-report')).kind, 'movie')
})

test('Zog stays a kids series: episodes in the guide outrank one Plex film of the same name, and the film keeps its own card', () => {
  const row = guideRowsOf(LIVE_GUIDE).get('zog')
  assert.deepEqual({ kind: row.kind, source: row.source }, { kind: 'series', source: 'guide' })
  assert.equal(storedKindOf({ row }), 'series')
  assert.equal(storedKindOf({ row, hint: 'series' }), 'series')
  assert.equal(storedKindOf({ row, hint: 'movie' }), 'movie')
  for (const programme of ZOG_EPISODES) assert.equal(displayKindOf({ programme, record: { titleKind: row } }), 'series')
})

test('Fargo: the library series names the title, and a film airing hint keeps film art', () => {
  const row = guideRowsOf(LIVE_GUIDE).get('fargo')
  assert.deepEqual({ kind: row.kind, source: row.source }, { kind: 'series', source: 'library' })
  assert.equal(storedKindOf({ row }), 'series')
  assert.equal(storedKindOf({ row, hint: 'movie' }), 'movie')
  assert.equal(displayKindOf({ programme: FARGO_FILM, record: { titleKind: row } }), 'movie')
  assert.equal(isFilmAiring({ programme: FARGO_FILM, record: { titleKind: row } }), true)
  assert.equal(canonicalKindOf({ libraryKinds: ['series'], guideKind: 'movie', hint: 'movie' }), 'movie')
})

test('Eurovision Song Contest Asia: a one-off in the guide, and a film hint does not change it', () => {
  const row = guideRowsOf(LIVE_GUIDE).get('eurovision-song-contest-asia')
  assert.equal(row.kind, 'one-off')
  assert.equal(storedKindOf({ row, hint: 'movie' }), 'one-off')
  assert.equal(displayKindOf({ programme: EUROVISION_ASIA, record: { titleKind: row } }), 'one-off')
})

test('requestKindOf: an override row ignores every hint; a hint row takes the asked kind unless films are blocked', () => {
  const override = { kind: 'movie', source: 'override', evidence: { override: 'movie' } }
  assert.equal(requestKindOf({ row: override, hint: 'series' }), 'movie')
  const hinted = { kind: 'series', source: 'hint', evidence: { hint: 'series' } }
  assert.equal(requestKindOf({ row: hinted, hint: 'one-off' }), 'one-off')
  const notMovie = { kind: 'series', source: 'hint', evidence: { override: 'not-movie', hint: 'series' } }
  assert.equal(requestKindOf({ row: notMovie, hint: 'movie' }), 'series')
  assert.equal(requestKindOf({ row: null, hint: 'bogus' }), null)
})

test('the import filing reads the sport block: a sport title is not filed as a film', () => {
  const titleKind = { kind: 'one-off', source: 'guide', evidence: { guide: { kind: 'one-off', seen: ['one-off'], sport: true } } }
  assert.equal(seriesKindOf({ title: 'Billie Jean King Cup', isFilm: true }), 'movie')
  assert.equal(seriesKindOf({ title: 'Billie Jean King Cup', isFilm: true, titleKind }), 'oneoff')
})

test('mergeTitleKinds: a row changes only on new evidence, and only a new kind counts as a change', () => {
  const first = mergeTitleKinds({ updates: new Map([['zog', { library: ['movie'] }]]), nowMs: 1 })
  assert.deepEqual(first.changes, [])
  const stored = new Map(first.rows.map((row) => [row.showKey, row]))
  assert.equal(stored.get('zog').kind, 'movie')
  assert.deepEqual(mergeTitleKinds({ stored, updates: new Map([['zog', { library: ['movie'] }]]), nowMs: 2 }), { rows: [], changes: [] })
  const guide = { kind: 'series', seen: ['series'], episodes: true, sport: false }
  const second = mergeTitleKinds({ stored, updates: new Map([['zog', { guide }]]), nowMs: 3 })
  assert.deepEqual(second.changes, [{ showKey: 'zog', from: 'movie', to: 'series' }])
  assert.deepEqual(second.rows[0].evidence.library, ['movie'])
})

test('libraryKindUpdatesOf: groups by the title key, adds a series hint from recorded episodes, and clears titles that left the library', () => {
  const stored = new Map([['gone', { kind: 'movie', source: 'library', evidence: { library: ['movie'] } }]])
  const updates = libraryKindUpdatesOf({
    rows: [
      { title: 'Fargo (1996)', library_kind: 'movie' },
      { title: 'Fargo', library_kind: 'series' },
      { title: 'Gardening Australia', recording_id: 'r1', series_no: 37, episode_no: 4 },
    ],
    stored,
    overrides: new Map([['gone', 'one-off']]),
    groupKeyOf: (title) => String(title).toLowerCase().replace(/\s*\(\d{4}\)/, ''),
  })
  assert.deepEqual(updates.get('fargo').library, ['movie', 'series'])
  assert.deepEqual(updates.get('fargo-1996').library, ['movie', 'series'])
  assert.deepEqual(updates.get('gardening-australia'), { override: null, library: [], hint: 'series' })
  assert.deepEqual(updates.get('gone'), { override: 'one-off', library: [], hint: null })
})

test('withTitleKinds: adds the title kind to the enrichment records by show key', () => {
  const titleKind = { kind: 'one-off', source: 'guide' }
  const merged = withTitleKinds({ records: new Map([['wnbl', { genreTags: ['sport'] }]]), titleKinds: new Map([['wnbl', titleKind], ['zog', titleKind]]) })
  assert.deepEqual(merged.get('wnbl'), { genreTags: ['sport'], genres: [], source: null, titleKind })
  assert.deepEqual(merged.get('zog'), { genreTags: [], genres: [], source: null, titleKind })
})

test('migration 0053 adds title_kinds, and its down() drops it', async () => {
  await db.migrate.latest()
  assert.equal(await db.schema.hasTable('title_kinds'), true)
  const [, pending] = await db.migrate.list()
  assert.deepEqual(pending, [])
  await db('title_kinds').insert({ show_key: 'zog', kind: 'series', source: 'guide', evidence_json: '{}', decided_at: 1 })
  await db.migrate.down({ name: '0053_title_kinds.js' })
  assert.equal(await db.schema.hasTable('title_kinds'), false)
  await db.migrate.latest()
  assert.equal(await db.schema.hasTable('title_kinds'), true)
})

test('createTitleKindStore: writes only changed evidence, reports a kind change once, and an override rewrites the row', async () => {
  await db.migrate.latest()
  await db('title_kinds').delete()
  const reported = []
  let clock = 100
  const store = createTitleKindStore({ now: () => clock, onChange: (changes) => reported.push(...changes) })
  const guide = { kind: 'movie', seen: ['movie'], episodes: false, sport: false }
  await store.update(new Map([['billie-jean-king-cup', { guide }]]))
  assert.equal((await store.rowFor('Billie Jean King Cup')).kind, 'movie')
  clock = 200
  await store.update(new Map([['billie-jean-king-cup', { guide }]]))
  assert.equal((await loadTitleKinds()).get('billie-jean-king-cup').decidedAt, 100)
  assert.deepEqual(reported, [])
  await store.update(new Map([['billie-jean-king-cup', { guide: { ...guide, kind: 'one-off', seen: ['one-off'], sport: true } }]]))
  assert.deepEqual(reported, [{ showKey: 'billie-jean-king-cup', from: 'movie', to: 'one-off' }])
  await store.update(new Map([['billie-jean-king-cup', { override: 'movie' }]]))
  const saved = (await loadTitleKinds()).get('billie-jean-king-cup')
  assert.deepEqual({ kind: saved.kind, source: saved.source, decidedAt: saved.decidedAt }, { kind: 'movie', source: 'override', decidedAt: 200 })
  assert.equal(reported.length, 2)
})

test('a removed override with no other evidence leaves a hint row, so request hints count again', () => {
  const stored = new Map(mergeTitleKinds({ updates: new Map([['the-castle', { override: 'movie' }]]), nowMs: 1 }).rows.map((row) => [row.showKey, row]))
  assert.equal(stored.get('the-castle').source, 'override')
  const { rows, changes } = mergeTitleKinds({ stored, updates: new Map([['the-castle', { override: null }]]), nowMs: 2 })
  assert.deepEqual({ kind: rows[0].kind, source: rows[0].source }, { kind: 'series', source: 'hint' })
  assert.deepEqual(changes, [{ showKey: 'the-castle', from: 'movie', to: 'series' }])
  assert.equal(requestKindOf({ row: rows[0], hint: 'movie' }), 'movie')
  assert.equal(requestKindOf({ row: rows[0], hint: 'one-off' }), 'one-off')
})

test('a Seven-style film with its description in the episode title keeps the library film kind', () => {
  const film = airing({ title: 'Paddington 2', episode_title: 'Paddington picks up a series of odd jobs to buy the perfect present for his aunt.' })
  const updates = guideKindUpdatesOf({ programmes: [film], airingKindOf: () => 'movie', libraryKindsOf: () => ['movie'] })
  assert.equal(updates.get('paddington-2').guide.episodes, false)
  assert.deepEqual(decideTitleKind(updates.get('paddington-2')), { kind: 'movie', source: 'library' })
})

test('guide categories: the live news and sport spellings block a film', () => {
  for (const categories of [['News & Current Affairs'], ['news/current affairs'], ['Current Affairs'], [' Sport '], ['Sports'], ['Sports Other'], ['Other Sport'], ['News']]) {
    const updates = guideKindUpdatesOf({ programmes: [NBL_GAME], airingKindOf: () => 'movie', categoriesOf: () => categories })
    assert.equal(decideTitleKind(updates.get(showKeyOf(NBL_GAME.title))).kind, 'one-off', categories[0])
  }
})

test('guide categories: a sport film keeps film status', () => {
  for (const categories of [['Sport drama'], ['Sports film']]) {
    const film = airing({ title: 'Rocky' })
    const updates = guideKindUpdatesOf({ programmes: [film], airingKindOf: () => 'movie', categoriesOf: () => categories })
    assert.equal(decideTitleKind(updates.get('rocky')).kind, 'movie', categories[0])
  }
})
