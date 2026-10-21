import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { showTitleIn, titleFromKey } from '../src/web/show-page.js'

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
  assert.match(view, /titleHint\.value \|\| \(loaded\.value \? titleFromKey\(key\.value\) : ''\)/)
})

test('show hero reserves the meta line and the wide actions row from the first frame', () => {
  assert.match(view, /<p class="show-hero-meta">/)
  assert.match(view, /<div v-if="!show" class="show-actions ui-only-wide" aria-hidden="true">\s*<span class="ui-button ui-button-secondary show-options-button ui-skeleton show-skeleton-button">/)
  assert.match(css, /\.show-hero-meta \{\n  min-height: 20px;/)
  assert.match(css, /\.show-hero-body \.show-actions \{\n  align-items: center;\n  min-height: 48px;/)
})

test('show page reuses the last loaded detail for an instant repeat visit', () => {
  assert.match(view, /const show = ref\(cachedDetails\.get\(key\.value\) \|\| null\)/)
  assert.match(view, /if \(requestedKey !== key\.value\) return/)
})
