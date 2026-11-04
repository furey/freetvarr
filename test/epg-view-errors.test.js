import { test } from 'node:test'
import assert from 'node:assert/strict'

import { dayLoadWritesOf } from '../src/web/guide-day-load.js'

test('dayLoadWritesOf: a slow failing day 3 load writes nothing once the user is on day 0', () => {
  assert.deepEqual(dayLoadWritesOf({ requestedDay: 3, shownDay: 0, outcome: { kind: 'failed', message: 'HTTP 502' } }), {})
  assert.deepEqual(dayLoadWritesOf({ requestedDay: 3, shownDay: 0, outcome: { kind: 'done' } }), {})
  assert.deepEqual(dayLoadWritesOf({ requestedDay: 3, shownDay: 0, outcome: { kind: 'no-url' } }), {})
})

test('dayLoadWritesOf: the shown day gets its error, its no-url state, and the end of loading', () => {
  assert.deepEqual(dayLoadWritesOf({ requestedDay: 3, shownDay: 3, outcome: { kind: 'failed', message: 'HTTP 502', code: 'tvh' } }), {
    error: 'TV guide load failed: HTTP 502',
    errorCode: 'tvh',
    loading: false,
  })
  assert.deepEqual(dayLoadWritesOf({ requestedDay: 0, shownDay: 0, outcome: { kind: 'no-url' } }), { errorCode: 'no-url', loading: false })
  assert.deepEqual(dayLoadWritesOf({ requestedDay: 0, shownDay: 0, outcome: { kind: 'done' } }), { loading: false })
})
