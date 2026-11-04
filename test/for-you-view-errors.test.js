import { test } from 'node:test'
import assert from 'node:assert/strict'

import { forYouLoadFailureOf, picksErrorOf } from '../src/web/for-you.js'
import { OFFLINE_MESSAGE, responseErrorOf } from '../src/web/shared/request-errors.js'

test('forYouLoadFailureOf: a failed reload keeps the last suggestions with a note, and "not ready yet" needs nothing loaded', () => {
  assert.deepEqual(forYouLoadFailureOf({ hasPayload: true }), { missing: false, refreshFailed: true })
  assert.deepEqual(forYouLoadFailureOf({ hasPayload: false }), { missing: true, refreshFailed: false })
})

test('picksErrorOf: the history-off 409 says why and links to For you settings', () => {
  const err = responseErrorOf({ status: 409, data: { error: 'Turn on viewing history to save picks.' } })
  assert.deepEqual(picksErrorOf(err), { text: 'Could not save your picks: Turn on viewing history to save picks.', needsSettings: true })
})

test('picksErrorOf: offline shows the offline message alone, with no settings link', () => {
  assert.deepEqual(picksErrorOf({ message: OFFLINE_MESSAGE, code: 'offline', status: 0 }), { text: OFFLINE_MESSAGE, needsSettings: false })
})
