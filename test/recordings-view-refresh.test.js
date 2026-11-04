import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { clearListConfirm } from '../src/web/recording-confirm.js'
import { latestOnly } from '../src/web/response-order.js'

const view = readFileSync(new URL('../src/web/views/recordings-view.js', import.meta.url), 'utf8')

const deferred = () => {
  let resolve = null
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

test('latestOnly: when two refreshes answer in reverse order, only the newer one is applied', async () => {
  const refresh = latestOnly()
  const older = deferred()
  const newer = deferred()
  const first = refresh(() => older.promise)
  const second = refresh(() => newer.promise)
  newer.resolve({ recordings: ['new'] })
  older.resolve({ recordings: ['old'] })
  assert.deepEqual(await second, { latest: true, result: { recordings: ['new'] } })
  assert.deepEqual(await first, { latest: false, result: null })
})

test('recording log: the refresh goes through latestOnly and the poll through createPoll', () => {
  assert.match(view, /latestOnly\(\)/)
  assert.match(view, /createPoll\(/)
})

test('recording log: the info card and the clear dialog state the same 30-day rule', () => {
  assert.match(view, /Without a clear, imported rows stay\. Other rows leave 30 days after TVHeadend removed them\./)
  const dialog = clearListConfirm({ count: 2, undoSeconds: 10 }).body.join(' ')
  assert.match(dialog, /Without a clear, imported rows stay in this list, and other rows leave it 30 days after TVHeadend removed them\./)
})
