import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { enterOnlyClosesKeyboard, installTypeAheadEnter, touchKeyboardOf, KEYBOARD_DISMISS_EVENT, TOUCH_KEYBOARD_QUERY } from '../src/web/shared/type-ahead-enter.js'
import { currentKeyboardInset, editingAfter, installVisibleViewport, isTextEntry, keyboardInsetOf, visibleBottomOf, visibleViewportBottom } from '../src/web/shared/visible-viewport.js'

const fakeTarget = () => {
  const listeners = []
  return {
    listeners,
    addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }),
    removeEventListener: (type, fn) => listeners.splice(listeners.findIndex((l) => l.type === type && l.fn === fn), 1),
    fire: (event) => listeners.filter((l) => l.type === event.type).forEach((l) => l.fn(event)),
  }
}

const fakeField = () => {
  const field = { blurred: false, dispatched: [] }
  field.closest = (selector) => (selector === '[data-type-ahead]' ? field : null)
  field.blur = () => { field.blurred = true }
  field.dispatchEvent = (event) => field.dispatched.push(event.type)
  return field
}

const keyEvent = ({ key = 'Enter', target, isComposing = false }) => {
  const event = { type: 'keydown', key, target, isComposing, prevented: false, stopped: false }
  event.preventDefault = () => { event.prevented = true }
  event.stopImmediatePropagation = () => { event.stopped = true }
  return event
}

const textInput = (type) => ({ tagName: 'INPUT', getAttribute: (name) => (name === 'type' ? type : null) })

const KEYBOARD_UP = 344

test('enterOnlyClosesKeyboard: Enter from an on-screen keyboard only closes the keyboard', () => {
  assert.equal(enterOnlyClosesKeyboard({ key: 'Enter', touch: true, keyboardInset: KEYBOARD_UP }), true)
})

test('enterOnlyClosesKeyboard: Enter with a mouse and keyboard keeps its normal action', () => {
  assert.equal(enterOnlyClosesKeyboard({ key: 'Enter', touch: false, keyboardInset: KEYBOARD_UP }), false)
})

test('enterOnlyClosesKeyboard: a touch screen with a hardware keyboard and no on-screen keyboard keeps the normal action', () => {
  assert.equal(enterOnlyClosesKeyboard({ key: 'Enter', touch: true, keyboardInset: 0 }), false)
  assert.equal(enterOnlyClosesKeyboard({ key: 'Enter', touch: true, keyboardInset: 55 }), false)
  assert.equal(enterOnlyClosesKeyboard({ key: 'Enter', touch: true, keyboardInset: 80 }), true)
})

test('enterOnlyClosesKeyboard: other keys and Enter that finishes an IME word pass through', () => {
  assert.equal(enterOnlyClosesKeyboard({ key: 'ArrowDown', touch: true, keyboardInset: KEYBOARD_UP }), false)
  assert.equal(enterOnlyClosesKeyboard({ key: 'Enter', isComposing: true, touch: true, keyboardInset: KEYBOARD_UP }), false)
  assert.equal(enterOnlyClosesKeyboard({ key: 'Enter', keyCode: 229, touch: true, keyboardInset: KEYBOARD_UP }), false)
})

test('currentKeyboardInset: reads the window, and is 0 without a visual viewport', () => {
  assert.equal(currentKeyboardInset({ innerHeight: 844, visualViewport: { offsetTop: 0, height: 500 } }), 344)
  assert.equal(currentKeyboardInset({ innerHeight: 844 }), 0)
})

test('touchKeyboardOf: reads the coarse, no-hover media query', () => {
  const asked = []
  const win = { matchMedia: (query) => { asked.push(query); return { matches: true } } }
  assert.equal(touchKeyboardOf(win)(), true)
  assert.deepEqual(asked, [TOUCH_KEYBOARD_QUERY])
  assert.equal(touchKeyboardOf({})(), false)
})

test('installTypeAheadEnter: on touch, Enter blurs the field, tells it why, and stops every other handler', () => {
  const target = fakeTarget()
  installTypeAheadEnter({ target, isTouch: () => true, keyboardInset: () => KEYBOARD_UP })
  assert.equal(target.listeners[0].capture, true)
  const field = fakeField()
  const event = keyEvent({ target: field })
  target.fire(event)
  assert.equal(field.blurred, true)
  assert.deepEqual(field.dispatched, [KEYBOARD_DISMISS_EVENT])
  assert.equal(event.prevented, true)
  assert.equal(event.stopped, true)
})

test('installTypeAheadEnter: on desktop, Enter reaches the field handlers untouched', () => {
  const target = fakeTarget()
  installTypeAheadEnter({ target, isTouch: () => false, keyboardInset: () => KEYBOARD_UP })
  const field = fakeField()
  const event = keyEvent({ target: field })
  target.fire(event)
  assert.equal(field.blurred, false)
  assert.equal(event.stopped, false)
})

test('installTypeAheadEnter: ignores fields without data-type-ahead, and removes its listener', () => {
  const target = fakeTarget()
  const stop = installTypeAheadEnter({ target, isTouch: () => true, keyboardInset: () => KEYBOARD_UP })
  const event = keyEvent({ target: { closest: () => null } })
  target.fire(event)
  assert.equal(event.stopped, false)
  stop()
  assert.equal(target.listeners.length, 0)
})

test('keyboardInsetOf: the keyboard covers the layout viewport below the visible bottom', () => {
  assert.equal(keyboardInsetOf({ layoutHeight: 844, viewport: { offsetTop: 0, height: 500 } }), 344)
})

test('keyboardInsetOf: panning the visible viewport down shrinks the covered part', () => {
  assert.equal(keyboardInsetOf({ layoutHeight: 844, viewport: { offsetTop: 100, height: 500 } }), 244)
})

test('keyboardInsetOf: no keyboard, collapsed toolbars, and pinch zoom give no inset', () => {
  assert.equal(keyboardInsetOf({ layoutHeight: 844, viewport: { offsetTop: 0, height: 844 } }), 0)
  assert.equal(keyboardInsetOf({ layoutHeight: 760, viewport: { offsetTop: 0, height: 844 } }), 0)
  assert.equal(keyboardInsetOf({ layoutHeight: 844, viewport: { offsetTop: 0, height: 422, scale: 2 } }), 0)
})

test('visibleBottomOf and visibleViewportBottom: use the visual viewport, else the window height', () => {
  assert.equal(visibleBottomOf({ offsetTop: 12.4, height: 500 }), 512)
  assert.equal(visibleViewportBottom({ visualViewport: { offsetTop: 0, height: 500 }, innerHeight: 844 }), 500)
  assert.equal(visibleViewportBottom({ innerHeight: 844 }), 844)
})

test('isTextEntry: text-like inputs, text areas, and editable regions bring up a keyboard', () => {
  assert.equal(isTextEntry(textInput('search')), true)
  assert.equal(isTextEntry(textInput(null)), true)
  assert.equal(isTextEntry({ tagName: 'TEXTAREA' }), true)
  assert.equal(isTextEntry({ tagName: 'DIV', isContentEditable: true }), true)
  assert.equal(isTextEntry(textInput('checkbox')), false)
  assert.equal(isTextEntry({ tagName: 'BUTTON' }), false)
  assert.equal(isTextEntry(null), false)
})

test('editingAfter: focus moving into a text field starts tracking, moving out to a button stops it', () => {
  assert.equal(editingAfter({ type: 'focusin', target: textInput('search') }), true)
  assert.equal(editingAfter({ type: 'focusout', target: textInput('search'), relatedTarget: { tagName: 'BUTTON' } }), false)
  assert.equal(editingAfter({ type: 'focusout', target: textInput('search'), relatedTarget: textInput('text') }), true)
  assert.equal(editingAfter({ type: 'focusout', target: textInput('search'), relatedTarget: null }), false)
})

const sourceOf = (path) => readFileSync(new URL(`../src/web/${path}`, import.meta.url), 'utf8')

const TYPE_AHEAD_FIELDS = [
  ['components/search-overlay.js', 1],
  ['components/settings-search.js', 1],
  ['components/move-to-show-sheet.js', 1],
  ['components/guide-combobox.js', 1],
  ['views/live-view.js', 1],
  ['views/epg-view.js', 3],
  ['views/series-view.js', 2],
]

test('every live-list search or filter field is a type-ahead field with a Done key', () => {
  TYPE_AHEAD_FIELDS.forEach(([path, count]) => {
    const source = sourceOf(path)
    assert.equal(source.match(/data-type-ahead/g)?.length, count, path)
    assert.equal(source.match(/enterkeyhint="done" data-type-ahead/g)?.length, count, path)
  })
})

test('app start installs the touch Enter rule and the viewport tracking', () => {
  const app = sourceOf('app.js')
  assert.match(app, /installVisibleViewport\(\)\ninstallTypeAheadEnter\(\)/)
})

test('guide combobox: keeps its list open when Enter only closed the keyboard, and fits the list above the keyboard', () => {
  const source = sourceOf('components/guide-combobox.js')
  assert.match(source, /@keyboard-dismiss="keepListAfterKeyboard"/)
  assert.match(source, /if \(!heldOpen\.value\) close\(\)/)
  assert.match(source, /visibleViewportBottom\(\) - box\.bottom/)
})

test('guide grid: the keyboard inset adds scroll room under the last channel', () => {
  const css = readFileSync(new URL('../src/web/styles/guide.css', import.meta.url), 'utf8')
  assert.match(css, /padding-bottom: var\(--keyboard-inset, 0px\)/)
  assert.match(css, /padding-bottom: max\(0px, calc\(var\(--keyboard-inset, 0px\) - var\(--app-tabbar-h\) - var\(--guide-legend-h, 0px\)\)\)/)
})

const trackingRig = () => {
  const frames = []
  globalThis.requestAnimationFrame = (fn) => frames.push(fn)
  globalThis.cancelAnimationFrame = () => {}
  globalThis.MutationObserver = class { observe() {} disconnect() {} }
  const vars = new Map()
  const root = { style: { setProperty: (name, value) => vars.set(name, value), removeProperty: (name) => vars.delete(name) } }
  const body = { ...fakeTarget(), classList: { contains: () => false }, ownerDocument: { activeElement: null } }
  const viewport = { ...fakeTarget(), offsetTop: 0, height: 844, scale: 1 }
  installVisibleViewport({ body, root, viewport, win: { innerHeight: 844 } })
  const flush = () => frames.splice(0).forEach((fn) => fn())
  const resize = (height) => {
    viewport.height = height
    viewport.fire({ type: 'resize' })
    flush()
  }
  return { vars, body, viewport, resize }
}

test('installVisibleViewport: a blur before the keyboard closes keeps the inset, so a tap does not shift the list', () => {
  const { vars, body, viewport, resize } = trackingRig()
  body.fire({ type: 'focusin', target: textInput('search') })
  resize(500)
  assert.equal(vars.get('--keyboard-inset'), '344px')
  body.fire({ type: 'focusout', target: textInput('search'), relatedTarget: null })
  assert.equal(vars.get('--keyboard-inset'), '344px')
  resize(700)
  assert.equal(vars.get('--keyboard-inset'), '144px')
  resize(844)
  assert.equal(vars.has('--keyboard-inset'), false)
  assert.equal(vars.has('--visible-viewport-bottom'), false)
  assert.equal(viewport.listeners.length, 0)
})

test('installVisibleViewport: a blur with no keyboard showing stops tracking at once', () => {
  const { vars, body, viewport } = trackingRig()
  body.fire({ type: 'focusin', target: textInput('search') })
  assert.equal(vars.get('--keyboard-inset'), '0px')
  body.fire({ type: 'focusout', target: textInput('search'), relatedTarget: null })
  assert.equal(vars.has('--keyboard-inset'), false)
  assert.equal(viewport.listeners.length, 0)
})
