import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-taste-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { createTasteStore, withHiddenNow } = await import('../src/for-you-service.js')
const { CHOICE_KINDS, FEEDBACK_KINDS } = await import('../src/user-events.js')
const { onNowPickOf } = await import('../src/web/home-hero.js')
const { programmeHiddenToastOf, programmeKindOfItem, dislikeLabelsOf, thumbToggleOf } = await import('../src/web/for-you.js')

const NOW = 1_800_000_000_000
const FISHING = { key: 'fishing', title: 'Fishing', phrase: 'fishing' }
const LEAGUE = { key: 'rugby-league', title: 'Rugby league', phrase: 'Rugby league', sport: true }
const TASTE = {
  hiddenShows: [],
  hiddenThemes: [],
  showAffinity: { ifish: 0.6 },
  themeShares: {},
  titles: {
    ifish: { kind: 'sport', sportCode: 'rugby-league', theme: LEAGUE },
    'the-catch': { kind: 'sport', sportCode: null, theme: FISHING },
  },
}
const entryOf = ({ id, title }) => ({
  channel: { id, name: `Channel ${id}`, pinned: true },
  now: { program_id: `${id}-now`, title, genre: 64, start: NOW - 60_000, end: NOW + 600_000 },
})

test('taste store: keeps the last taste when no new result is ready', async () => {
  const store = createTasteStore({ readHidden: async () => ({ shows: [], themes: [] }) })
  store.note({ taste: TASTE })
  store.note(null)
  store.note({ sections: [] })
  assert.deepEqual((await store.current()).titles, TASTE.titles)
})

test('taste store: a hide applies at once, even while the For you result is stale', async () => {
  const hidden = { shows: [], themes: [] }
  const store = createTasteStore({ readHidden: async () => hidden })
  store.note({ taste: TASTE })
  const entries = [entryOf({ id: 1, title: 'iFish' }), entryOf({ id: 2, title: 'NRL Live' })]
  const titles = { ...TASTE.titles, 'nrl-live': { kind: 'sport', sportCode: 'rugby-league', theme: LEAGUE } }
  const pick = async () => onNowPickOf({ entries, taste: { ...(await store.current()), titles }, nowMs: NOW })?.now.title ?? null
  assert.equal(await pick(), 'iFish')
  hidden.shows = ['ifish']
  assert.equal(await pick(), 'NRL Live')
  hidden.themes = ['rugby-league']
  assert.equal(await pick(), null)
})

test('taste store: falls back to the saved result, then to a taste with no titles', async () => {
  const fromPeek = createTasteStore({ readHidden: async () => ({ shows: ['x'], themes: [] }), peek: () => ({ taste: TASTE }) })
  assert.deepEqual((await fromPeek.current()).hiddenShows, ['x'])
  assert.deepEqual((await fromPeek.current()).titles, TASTE.titles)
  const empty = createTasteStore({ readHidden: async () => { throw new Error('db busy') } })
  const taste = await empty.current()
  assert.equal(taste.titles, null)
  assert.deepEqual(taste.hiddenShows, [])
  assert.equal(onNowPickOf({ entries: [entryOf({ id: 1, title: 'iFish' })], taste, nowMs: NOW }).now.title, 'iFish')
})

test('withHiddenNow: the current hidden keys win, so an unhide applies before the next For you result', () => {
  const saved = { ...TASTE, hiddenShows: ['ifish', 'a'], hiddenThemes: ['fishing'] }
  const merged = withHiddenNow({ taste: saved, hidden: { shows: ['a', 'b', 'b'], themes: ['cooking'] } })
  assert.deepEqual(merged.hiddenShows, ['a', 'b'])
  assert.deepEqual(merged.hiddenThemes, ['cooking'])
})

test('withHiddenNow: keeps the saved hidden keys when the current ones cannot be read', () => {
  const saved = { ...TASTE, hiddenShows: ['ifish'], hiddenThemes: ['fishing'] }
  const merged = withHiddenNow({ taste: saved, hidden: null })
  assert.deepEqual(merged.hiddenShows, ['ifish'])
  assert.deepEqual(merged.hiddenThemes, ['fishing'])
})

test('Fewer like this undo has its own event kind, logged even with history paused', () => {
  assert.ok(FEEDBACK_KINDS.has('fewer_like_this_undo'))
  assert.ok(CHOICE_KINDS.has('fewer_like_this_undo'))
  assert.deepEqual(thumbToggleOf({ current: 'down', direction: 'down' }), { next: null, kind: 'fewer_like_this_undo' })
  assert.deepEqual(thumbToggleOf({ current: 'up', direction: 'up' }), { next: null, kind: 'thumb_clear' })
})

test('programmeKindOfItem: the menu and the toast use the same show or film word', () => {
  const cases = [
    [{ kind: 'liked', programmeKind: 'movie' }, 'film'],
    [{ kind: 'movie' }, 'film'],
    [{ kind: 'new-season', programmeKind: 'series' }, 'show'],
    [{ kind: 'ready' }, 'show'],
    [{ programmeKind: 'movie', kind: 'series' }, 'film'],
  ]
  for (const [item, noun] of cases) {
    const kind = programmeKindOfItem(item)
    assert.equal(dislikeLabelsOf({ kind }).show, `Hide this ${noun}`)
    assert.equal(programmeHiddenToastOf(kind), `This ${noun} is hidden for 90 days`)
  }
})

test('the taste route reads the taste store and never waits on a For you build', async () => {
  const source = await fs.readFile(new URL('../src/for-you-routes.js', import.meta.url), 'utf8')
  const route = source.slice(source.indexOf("'/api/for-you/taste'"), source.indexOf("'/api/for-you/pickable'"))
  assert.ok(route.includes('getCurrentTaste()'))
  assert.equal(route.includes('getForYou('), false)
})

test('the empty Hidden shows text names the Hide this show choice', async () => {
  const source = await fs.readFile(new URL('../src/web/views/suggestions-settings-view.js', import.meta.url), 'utf8')
  assert.ok(source.includes('No hidden shows. Choose Hide this show on Home or For you to hide a show.'))
  assert.equal(/Not interested|Fewer like this on/.test(source.replace('More like this, Fewer like this, and Hide still count.', '')), false)
})
