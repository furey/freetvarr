import { test } from 'node:test'
import assert from 'node:assert/strict'

import { clearedListMessage, restoredListMessage } from '../src/web/clear-list.js'

test('clearedListMessage and restoredListMessage pluralise rows', () => {
  assert.equal(clearedListMessage(1), 'Cleared 1 row from the list.')
  assert.equal(clearedListMessage(3), 'Cleared 3 rows from the list.')
  assert.equal(restoredListMessage(2), 'Put back 2 rows.')
})
