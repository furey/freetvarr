import { test } from 'node:test'
import assert from 'node:assert/strict'

import { replaceUrlKeepingEntry } from '../src/web/back-target.js'
import { createScrollMemory } from '../src/web/scroll-memory.js'

const fakeHistory = (state) => {
  const entries = [{ state, url: '#/settings/system/activity/123' }]
  return {
    get state() { return entries.at(-1).state },
    get url() { return entries.at(-1).url },
    replaceState: (next, title, url) => { entries[entries.length - 1] = { state: next, url } },
  }
}

test('replaceUrlKeepingEntry: collapsing a linked sync changes the URL and keeps the entry key and origin', () => {
  const history = fakeHistory({ entryKey: 'e7', cameFrom: '#/home' })
  replaceUrlKeepingEntry({ history, hash: '#/settings/system/activity/syncs' })
  assert.equal(history.url, '#/settings/system/activity/syncs')
  assert.deepEqual(history.state, { entryKey: 'e7', cameFrom: '#/home' })
})

test('replaceUrlKeepingEntry: with the key kept, Back finds the saved scroll position', () => {
  const memory = createScrollMemory()
  const history = fakeHistory({ entryKey: 'e7' })
  memory.leave({ key: 'e7', scrollY: 640 })
  replaceUrlKeepingEntry({ history, hash: '#/settings/system/activity/syncs' })
  assert.equal(memory.arrive(history.state).top, 640)
})
