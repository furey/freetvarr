import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { installWindowPinning, isInnerPageScroll, maxScrollTopOf, pageScrollRoot, pageScroller } from '../src/web/shared/page-scroll.js'

const MODE_SCRIPT = readFileSync(new URL('../src/web/page-scroll-mode.js', import.meta.url), 'utf8')

const modeOf = ({ search = '', standalone = false, touchCallout = false, displayStandalone = false }) => {
  const root = { dataset: {} }
  vm.runInNewContext(MODE_SCRIPT, {
    URLSearchParams,
    location: { search },
    navigator: { standalone },
    matchMedia: () => ({ matches: displayStandalone }),
    CSS: { supports: () => touchCallout },
    document: { documentElement: root },
  })
  return root.dataset.pageScroll
}

const fakeDoc = (mode) => {
  const app = { id: 'app' }
  const scrollingElement = { id: 'document' }
  return {
    app,
    scrollingElement,
    documentElement: { dataset: { pageScroll: mode } },
    getElementById: (id) => (id === 'app' ? app : null),
  }
}

test('page scroll mode: iOS Safari tabs scroll inside the app', () => {
  assert.equal(modeOf({ touchCallout: true }), 'inner')
})

test('page scroll mode: the Home Screen app and other browsers keep document scrolling', () => {
  assert.equal(modeOf({ touchCallout: true, standalone: true }), 'document')
  assert.equal(modeOf({ touchCallout: true, displayStandalone: true }), 'document')
  assert.equal(modeOf({ touchCallout: false }), 'document')
})

test('page scroll mode: a page-scroll query forces either mode', () => {
  assert.equal(modeOf({ search: '?page-scroll=inner' }), 'inner')
  assert.equal(modeOf({ search: '?page-scroll=document', touchCallout: true }), 'document')
  assert.equal(modeOf({ search: '?page-scroll=other' }), 'document')
})

test('pageScroller is the app element in inner mode and the document otherwise', () => {
  const inner = fakeDoc('inner')
  assert.equal(isInnerPageScroll(inner), true)
  assert.equal(pageScroller(inner), inner.app)
  assert.equal(pageScrollRoot(inner), inner.app)
  const outer = fakeDoc('document')
  assert.equal(isInnerPageScroll(outer), false)
  assert.equal(pageScroller(outer), outer.scrollingElement)
  assert.equal(pageScrollRoot(outer), null)
})

test('maxScrollTopOf never goes below zero', () => {
  assert.equal(maxScrollTopOf({ scrollHeight: 2000, clientHeight: 645 }), 1355)
  assert.equal(maxScrollTopOf({ scrollHeight: 500, clientHeight: 645 }), 0)
})

const pinningDocOf = ({ mode, scrollY }) => {
  const listeners = {}
  const win = { scrollY, scrollTo: (x, y) => { win.scrollY = y } }
  const doc = {
    defaultView: win,
    documentElement: { dataset: mode ? { pageScroll: mode } : {} },
    addEventListener: (type, fn) => { listeners[type] = fn },
    removeEventListener: (type) => { delete listeners[type] },
  }
  return { doc, win, listeners }
}

test('inner mode puts a shifted window back after the keyboard closes', () => {
  const { doc, win, listeners } = pinningDocOf({ mode: 'inner', scrollY: 120 })
  installWindowPinning(doc)
  listeners.focusout()
  assert.equal(win.scrollY, 0)
})

test('document mode leaves the window scroll alone after focus leaves', () => {
  const { doc, win, listeners } = pinningDocOf({ scrollY: 120 })
  installWindowPinning(doc)
  listeners.focusout()
  assert.equal(win.scrollY, 120)
})
