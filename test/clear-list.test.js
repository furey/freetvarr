import { test } from 'node:test'
import assert from 'node:assert/strict'

import { clearListPrompt, clearedListMessage, restoredListMessage } from '../src/web/clear-list.js'

test('clearListPrompt: gives the full count and names Plex when set up', () => {
  assert.equal(
    clearListPrompt({ count: 12, plexConfigured: true }),
    'Hide 12 recordings from this list?\n\n'
      + 'TVHeadend deleted its copies. The files stay in your library, and Plex still shows them.',
  )
})

test('clearListPrompt: singular wording and no Plex clause without Plex', () => {
  assert.equal(
    clearListPrompt({ count: 1, plexConfigured: false }),
    'Hide 1 recording from this list?\n\nTVHeadend deleted its copy. The file stays in your library.',
  )
})

test('clearedListMessage and restoredListMessage pluralise rows', () => {
  assert.equal(clearedListMessage(1), 'Cleared 1 row from the list.')
  assert.equal(clearedListMessage(3), 'Cleared 3 rows from the list.')
  assert.equal(restoredListMessage(2), 'Put back 2 rows.')
})
