import test from 'node:test'
import assert from 'node:assert/strict'
import { PLAYER_THEME_COLOR, themeColorOf, syncThemeColor } from '../src/web/player-theme-color.js'

const fakeDoc = (content) => {
  const attrs = { content }
  const meta = {
    dataset: {},
    getAttribute: (name) => attrs[name],
    setAttribute: (name, value) => { attrs[name] = value },
  }
  return { attrs, querySelector: () => meta }
}

test('themeColorOf uses black while the full player is open and the app colour otherwise', () => {
  assert.equal(themeColorOf({ playerOpen: true, appColor: '#0b1117' }), PLAYER_THEME_COLOR)
  assert.equal(themeColorOf({ playerOpen: false, appColor: '#0b1117' }), '#0b1117')
})

test('syncThemeColor switches to black and restores the original colour', () => {
  const doc = fakeDoc('#0b1117')
  syncThemeColor(false, doc)
  assert.equal(doc.attrs.content, '#0b1117')
  syncThemeColor(true, doc)
  assert.equal(doc.attrs.content, PLAYER_THEME_COLOR)
  syncThemeColor(true, doc)
  syncThemeColor(false, doc)
  assert.equal(doc.attrs.content, '#0b1117')
})

test('syncThemeColor does nothing without a theme-color meta', () => {
  assert.doesNotThrow(() => syncThemeColor(true, { querySelector: () => null }))
})

test('isViewportDebugOn reads the debug query switch', async () => {
  const { isViewportDebugOn } = await import('../src/web/viewport-debug.js')
  assert.equal(isViewportDebugOn('?debug=viewport'), true)
  assert.equal(isViewportDebugOn('?debug=other'), false)
  assert.equal(isViewportDebugOn(''), false)
})
