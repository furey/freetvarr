import { test } from 'node:test'
import assert from 'node:assert/strict'

import { dayAfterMidnightOf, dayLoadWritesOf } from '../src/web/guide-day-load.js'

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

test('dayAfterMidnightOf: at midnight a later day tab keeps showing the same calendar day', () => {
  assert.equal(dayAfterMidnightOf({ day: 2, todayBefore: 20400, todayNow: 20401 }), 1)
  assert.equal(dayAfterMidnightOf({ day: 1, todayBefore: 20400, todayNow: 20401 }), 0)
  assert.equal(dayAfterMidnightOf({ day: 0, todayBefore: 20400, todayNow: 20401 }), null)
  assert.equal(dayAfterMidnightOf({ day: 2, todayBefore: 20400, todayNow: 20400 }), null)
  assert.equal(dayAfterMidnightOf({ day: 2, todayBefore: undefined, todayNow: 20400 }), null)
})

test('guide view: re-reads the same calendar day when the date changes on a later day tab', async () => {
  const { readFile } = await import('node:fs/promises')
  const source = await readFile(new URL('../src/web/views/epg-view.js', import.meta.url), 'utf8')
  assert.match(source, /watch\(todayNumber, \(todayNow, todayBefore\) => \{\n\s+const sameDay = dayAfterMidnightOf\(\{ day: day\.value, todayBefore, todayNow \}\)/)
  assert.match(source, /guideByDay\.clear\(\)\n\s+day\.value = sameDay\n\s+loadDay\(sameDay, \{ force: true \}\)/)
})
