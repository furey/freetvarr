import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { createClearTimer } from '../src/web/status-timer.js'

const WEB_ROOT = fileURLToPath(new URL('../src/web', import.meta.url))
const VUE = fileURLToPath(new URL('../node_modules/vue/dist/vue.esm-browser.prod.js', import.meta.url))
const FLASH_DEFAULT_MS = 4500
const stub = (code) => `data:text/javascript,${encodeURIComponent(code)}`
const STUBS = {
  '/shared/api.js': stub('export const api = async () => ({})'),
  '/shared/composables.js': stub(`export const FLASH_DEFAULT_MS = ${FLASH_DEFAULT_MS}`),
}

registerHooks({
  resolve: (specifier, context, nextResolve) => {
    const fromWeb = context.parentURL?.startsWith(pathToFileURL(WEB_ROOT).href)
    if (!fromWeb || !specifier.startsWith('/')) return nextResolve(specifier, context)
    if (specifier === '/vendor/vue.esm-browser.prod.js') return nextResolve(pathToFileURL(VUE).href, context)
    if (STUBS[specifier]) return nextResolve(STUBS[specifier], context)
    return nextResolve(pathToFileURL(`${WEB_ROOT}${specifier}`).href, context)
  },
})

const { makeStatus } = await import('../src/web/shared/path-check.js')

test('createClearTimer: a newer message keeps its own time, and the older timer no longer clears it', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let text = ''
  const clearLater = createClearTimer({ clear: () => { text = '' } })
  const show = (msg, ms) => {
    text = msg
    clearLater(ms)
  }
  show('A', 4500)
  t.mock.timers.tick(3000)
  show('B', 5000)
  t.mock.timers.tick(2000)
  assert.equal(text, 'B')
  t.mock.timers.tick(3000)
  assert.equal(text, '')
})

test('createClearTimer: a message with no time stays, even after an earlier timed one', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let text = ''
  const clearLater = createClearTimer({ clear: () => { text = '' } })
  text = 'Auto-discover failed'
  clearLater(8000)
  text = 'Scanning this host'
  clearLater(0)
  t.mock.timers.tick(9000)
  assert.equal(text, 'Scanning this host')
})

test('makeStatus: a timed message clears after its time, and a newer message keeps its own time', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const [text, kind, set] = makeStatus()
  set('Saved', 'ok', 4500)
  t.mock.timers.tick(3000)
  set('Could not save', 'err', 5000)
  t.mock.timers.tick(2000)
  assert.deepEqual([text.value, kind.value], ['Could not save', 'err'])
  t.mock.timers.tick(3000)
  assert.equal(text.value, '')
})

test('makeStatus: a message with no time stays, and clear removes it and cancels an earlier timer', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const [text, , set, clear] = makeStatus()
  set('Saved', 'ok', 4500)
  set('Checking…', 'busy', 0)
  t.mock.timers.tick(9000)
  assert.equal(text.value, 'Checking…')
  set('Saved', 'ok', 4500)
  clear()
  assert.equal(text.value, '')
  set('Checking…', 'busy', 0)
  t.mock.timers.tick(9000)
  assert.equal(text.value, 'Checking…')
})

test('makeStatus: a message with no time given clears after the default flash time', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const [text, , set] = makeStatus()
  set('Saved')
  t.mock.timers.tick(FLASH_DEFAULT_MS - 1)
  assert.equal(text.value, 'Saved')
  t.mock.timers.tick(1)
  assert.equal(text.value, '')
})
