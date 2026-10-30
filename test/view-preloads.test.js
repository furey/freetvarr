import { test } from 'node:test'
import assert from 'node:assert/strict'
import { viewPreloadsOf } from '../scripts/generate-view-preloads.mjs'
import { VIEW_ENTRIES, VIEW_FIRST_REQUESTS } from '../src/web/view-modules.js'
import { VIEW_PRELOADS } from '../src/web/view-preloads.js'

test('VIEW_PRELOADS: lists every module each view needs beyond the boot graph', async () => {
  assert.deepEqual(VIEW_PRELOADS, await viewPreloadsOf(), 'run node scripts/generate-view-preloads.mjs')
})

test('VIEW_PRELOADS: each view preloads its own entry module', () => {
  for (const [key, { url }] of Object.entries(VIEW_ENTRIES)) assert.ok(VIEW_PRELOADS[key].includes(url), key)
})

test('VIEW_FIRST_REQUESTS: only names views that exist and GET API paths', () => {
  for (const [key, urls] of Object.entries(VIEW_FIRST_REQUESTS)) {
    assert.ok(VIEW_ENTRIES[key], key)
    urls.forEach((url) => assert.match(url, /^\/api\//))
  }
})
