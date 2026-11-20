import { test } from 'node:test'
import assert from 'node:assert/strict'

import { clearedListMessage, restoredListMessage } from '../src/web/clear-list.js'

test('clearedListMessage and restoredListMessage pluralise rows', () => {
  assert.match(clearedListMessage(1), /\b1 row\b/)
  assert.match(clearedListMessage(3), /\b3 rows\b/)
  assert.match(restoredListMessage(2), /\b2 rows\b/)
})
