import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const view = readFileSync(new URL('../src/web/views/epg-view.js', import.meta.url), 'utf8')

const loadDayBody = () => {
  const start = view.indexOf('const loadDay = async (d, { force = false } = {}) => {')
  return view.slice(start, view.indexOf('\n    }\n', start))
}

test('guide: a slow failing day load does not show its error or end loading on the day the user moved to', () => {
  const body = loadDayBody()
  assert.match(body, /if \(!force && guideByDay\.has\(d\)\) \{\n\s*loading\.value = false/)
  assert.match(body, /const isShownDay = \(\) => day\.value === d/)
  assert.match(body, /catch \(err\) \{\n\s*if \(!isShownDay\(\)\) return\n\s*error\.value = `TV guide load failed/)
  assert.match(body, /finally \{\n\s*if \(isShownDay\(\)\) loading\.value = false/)
  assert.match(body, /if \(isShownDay\(\)\) errorCode\.value = 'no-url'/)
})

test('guide search: a failed search says so and offers no watchlist entry', () => {
  assert.match(view, /<p v-if="searchFailure" class="status-readout err" role="status">Could not search the guide: \{\{ searchFailure \}\}<\/p>/)
  assert.match(view, /<p v-else-if="!searching && !searchFailure" class="ui-meta">Nothing in the next 7 days matches/)
  assert.match(view, /failed: Boolean\(searchFailure\.value\)/)
  assert.match(view, /catch \(err\) \{\n\s*if \(!searches\.isLatest\(ticket\)\) return\n\s*searchResults\.value = \[\]\n\s*searchFailure\.value = err\.message/)
})
