import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { createClearTimer } from '../src/web/status-timer.js'

const pathCheck = readFileSync(new URL('../src/web/shared/path-check.js', import.meta.url), 'utf8')
const settings = readFileSync(new URL('../src/web/views/settings-view.js', import.meta.url), 'utf8')

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

test('status helpers: makeStatus and the Settings flashes use one clear timer each', () => {
  assert.match(pathCheck, /const clearLater = createClearTimer\(\{ clear: \(\) => \(text\.value = ''\) \}\)/)
  assert.doesNotMatch(pathCheck, /setTimeout\(\(\) => \(text\.value = ''\), ms\)/)
  assert.doesNotMatch(settings, /if \(ms > 0\) setTimeout\(/)
  assert.match(settings, /const clearStatusLater = createClearTimer\(\{ clear: \(\) => \(status\.value = ''\) \}\)/)
  assert.match(settings, /const clearPlexStatusLater = createClearTimer\(\{ clear: \(\) => \(plexStatus\.value = ''\) \}\)/)
  assert.match(settings, /const clearPlexTokenStatusLater = createClearTimer\(\{ clear: \(\) => \(plexTokenStatus\.value = ''\) \}\)/)
})
