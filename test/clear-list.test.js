import { test } from 'node:test'
import assert from 'node:assert/strict'

import { clearListPrompt, clearedListMessage, restoredListMessage } from '../src/web/clear-list.js'

test('clearListPrompt: says why, where the files stay, and how to delete them', () => {
  assert.equal(
    clearListPrompt(12),
    'Hide 12 recordings that TVHeadend no longer has from this list?\n\n'
      + 'The recording files stay in your media library. Your media player (e.g. Plex or Kodi) still shows them.\n\n'
      + 'To delete them for good, delete them in your media player or from your library folder.',
  )
})

test('clearListPrompt: singular wording', () => {
  assert.equal(
    clearListPrompt(1),
    'Hide 1 recording that TVHeadend no longer has from this list?\n\n'
      + 'The recording file stays in your media library. Your media player (e.g. Plex or Kodi) still shows it.\n\n'
      + 'To delete it for good, delete it in your media player or from your library folder.',
  )
})

test('clearedListMessage and restoredListMessage pluralise rows', () => {
  assert.equal(clearedListMessage(1), 'Cleared 1 row from the list.')
  assert.equal(clearedListMessage(3), 'Cleared 3 rows from the list.')
  assert.equal(restoredListMessage(2), 'Put back 2 rows.')
})
