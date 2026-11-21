import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { openingDetailOf, pageShapeOf, pageTitleOf, showTitleIn, titleFromKey, whenDetailLoaded } from '../src/web/show-page.js'

const view = readFileSync(new URL('../src/web/views/show-view.js', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/web/styles/recordings.css', import.meta.url), 'utf8')

test('showTitleIn: finds the cached title for a key, or nothing', () => {
  const shows = [{ key: 'the-block', title: 'The Block' }, { key: 'gruen', title: 'Gruen' }]
  assert.equal(showTitleIn({ key: 'gruen', shows }), 'Gruen')
  assert.equal(showTitleIn({ key: 'missing', shows }), '')
  assert.equal(showTitleIn({ key: 'gruen' }), '')
})

test('titleFromKey: readable fallback once loading has failed', () => {
  assert.equal(titleFromKey('the-block'), 'The block')
})

test('show page paints a known title or a skeleton, never the route key, before loading', () => {
  assert.match(view, /<h1 class="show-title"><template v-if="title">\{\{ title \}\}<\/template><span v-else class="ui-skeleton is-text show-title-skeleton"/)
})

test('pageTitleOf: the known title, else nothing while loading, else the readable key once loading ends', () => {
  assert.equal(pageTitleOf({ titleHint: 'The Block', loaded: false, key: 'the-block' }), 'The Block')
  assert.equal(pageTitleOf({ titleHint: 'The Block', loaded: true, key: 'the-block' }), 'The Block')
  assert.equal(pageTitleOf({ titleHint: '', loaded: false, key: 'the-block' }), '')
  assert.equal(pageTitleOf({ titleHint: '', loaded: true, key: 'the-block' }), 'The block')
})

test('show hero reserves the meta line and the wide actions row from the first frame', () => {
  assert.match(view, /<p class="show-hero-meta">/)
  assert.match(view, /<div v-if="!settled" class="show-actions ui-only-wide" aria-hidden="true">\s*<span class="ui-button ui-button-secondary show-options-button ui-skeleton show-skeleton-button">/)
  assert.match(css, /\.show-hero-meta \{\n  min-height: 20px;/)
  assert.match(css, /\.show-hero-body \.show-actions \{\n  align-items: center;\n  min-height: 48px;/)
})

test('show hero skeletons clear once loading ends, even for a missing show', () => {
  assert.match(view, /<span v-else-if="!settled" class="ui-skeleton is-text show-meta-skeleton"/)
  assert.doesNotMatch(view, /<div v-if="!show" class="show-actions/)
  assert.match(css, /\.show-missing \{\n  align-items: flex-start;\n  text-align: left;/)
})

const filmSummary = {
  key: 'rocky',
  title: 'Rocky',
  kind: 'movie',
  year: 1976,
  counts: { total: 1, unwatched: 1, failed: 0, inProgress: 0 },
  recordingNow: false,
  rule: null,
  nextAiring: null,
  latest: { recordingId: 'plex-1', airedAt: 1, durationS: 7200, watched: false, positionS: null },
}

test('openingDetailOf: a repeat visit reuses the last loaded detail', () => {
  const cached = { key: 'rocky', title: 'Rocky', kind: 'movie', seasons: [] }
  assert.equal(openingDetailOf({ cached, summary: filmSummary }), cached)
})

test('openingDetailOf: a film opened from a shelf starts in its final single shape', () => {
  const opening = openingDetailOf({ cached: undefined, summary: filmSummary })
  assert.equal(opening.seeded, true)
  assert.equal(pageShapeOf(opening), 'single')
})

test('openingDetailOf: with no cached detail and no shelf summary the page starts empty', () => {
  assert.equal(openingDetailOf({ cached: undefined, summary: null }), null)
})

test('show page drops answers for a show it has left', () => {
  assert.match(view, /const isStale = \(\) => requestedKey !== key\.value \|\| !loads\.accept\(ticket\)/)
})

test('a show that empties while open goes back to Recordings instead of the not-in-library page', () => {
  assert.match(view, /if \(show\.value && !show\.value\.seeded\) return leaveEmptiedShow\(\)\n\s*missing\.value = true/)
  assert.match(view, /const leaveEmptiedShow = \(\) => \{\n\s*show\.value = null\n\s*navigate\(BACK_FALLBACK\.route\)/)
  assert.match(view, /<div v-else-if="ruleStatus" class="show-rule is-static">/)
})

const gateOf = (state) => whenDetailLoaded({ currentOf: () => state.show, pendingOf: () => state.pending })

test('whenDetailLoaded: Play pressed on a seeded page waits for the real detail, then plays it', async () => {
  const played = []
  const load = Promise.withResolvers()
  const state = { show: { key: 'rocky', seeded: true }, pending: load.promise }
  const press = gateOf(state)((target) => played.push(target))('play')
  await Promise.resolve()
  assert.deepEqual(played, [])
  state.show = { key: 'rocky' }
  load.resolve()
  await press
  assert.deepEqual(played, ['play'])
})

test('whenDetailLoaded: a press does nothing when the detail fails to load', async () => {
  const played = []
  const state = { show: { key: 'rocky', seeded: true }, pending: Promise.resolve() }
  const press = gateOf(state)(() => played.push('play'))()
  state.show = null
  await press
  assert.deepEqual(played, [])
})

test('whenDetailLoaded: a press on a loaded page runs at once', async () => {
  const played = []
  await gateOf({ show: { key: 'rocky' }, pending: null })(() => played.push('play'))()
  assert.deepEqual(played, ['play'])
})

test('show page wires Play and More through the loaded-detail gate', () => {
  assert.match(view, /playNext: whenLoaded\(playNow\), openShowMenu: whenLoaded\(actions\.openShowMenu\)/)
})
