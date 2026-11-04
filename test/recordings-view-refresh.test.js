import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { clearListConfirm } from '../src/web/recording-confirm.js'

const view = readFileSync(new URL('../src/web/views/recordings-view.js', import.meta.url), 'utf8')

test('recording log: a response for an older filter tap is dropped, so the list shows the newest request', () => {
  assert.match(view, /const refreshes = createResponseOrder\(\)\n\s*const refresh = async \(\) => \{\n\s*const ticket = refreshes\.issue\(\)/)
  assert.match(view, /const r = await api\('GET', `\/api\/recordings\?\$\{params\}`\)\n\s*if \(!refreshes\.isLatest\(ticket\)\) return\n\s*recordings\.value = r\.recordings/)
})

test('recording log: leaving the page mid-load stops the poll loop', () => {
  assert.match(view, /const scheduleNextPoll = \(\) => \{\n\s*if \(stopped\) return/)
  assert.match(view, /onUnmounted\(\(\) => \{\n\s*stopped = true\n\s*if \(pollTimer\) clearTimeout\(pollTimer\)/)
})

test('recording log: the info card and the clear dialog state the same 30-day rule', () => {
  assert.match(view, /Without a clear, imported rows stay\. Other rows leave 30 days after TVHeadend removed them\./)
  assert.doesNotMatch(view, /Rows also leave by themselves after 30 days/)
  const dialog = clearListConfirm({ count: 2, undoSeconds: 10 }).body.join(' ')
  assert.match(dialog, /Without a clear, imported rows stay in this list, and other rows leave it 30 days after TVHeadend removed them\./)
})
