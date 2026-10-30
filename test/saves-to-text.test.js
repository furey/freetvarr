import { test } from 'node:test'
import assert from 'node:assert/strict'

import { unfiledShowText } from '../src/web/saves-to-text.js'

test('unfiledShowText: a series with no folder gets a new folder on the next import', () => {
  assert.equal(
    unfiledShowText({ kind: 'newFolder', path: '/media/tv/Bluey' }),
    'This show has no folder in your TV library yet. The next import makes a new folder for it: /media/tv/Bluey.',
  )
})

test('unfiledShowText: a show moved to One-offs names the one-off folder', () => {
  assert.equal(
    unfiledShowText({ kind: 'oneOff', path: '/media/one-offs/Bluey' }),
    'This show is in One-offs, so its episodes save to /media/one-offs/Bluey.',
  )
})

test('unfiledShowText: with nowhere to save, episodes wait in the recording log', () => {
  assert.match(unfiledShowText({ kind: 'held', path: null }), /wait in the recording log/)
  assert.match(unfiledShowText(null), /wait in the recording log/)
})
