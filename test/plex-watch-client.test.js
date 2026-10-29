import assert from 'node:assert/strict'
import test from 'node:test'

import { createPlexWatchClient, METADATA_BATCH, PAGE_SIZE } from '../src/plex-watch-client.js'
import { plexWatchStatusOf, togglePatchFrom } from '../src/plex-watch-routes.js'

const page = (count, start = 0, totalSize = null) => ({
  status: 200,
  data: { MediaContainer: { ...(totalSize != null ? { totalSize } : {}), Metadata: Array.from({ length: count }, (_, i) => ({ ratingKey: String(start + i) })) } },
})

test('listItems pages through a large section with container headers', async () => {
  const calls = []
  const client = createPlexWatchClient({
    url: 'http://plex:32400/',
    token: 'tok',
    request: async (options) => {
      calls.push(options)
      const start = Number(options.headers['X-Plex-Container-Start'])
      return start === 0 ? page(PAGE_SIZE, 0, PAGE_SIZE + 3) : page(3, PAGE_SIZE, PAGE_SIZE + 3)
    },
  })
  const items = await client.listItems({ section: { id: '2', type: 'show' } })
  assert.equal(items.length, PAGE_SIZE + 3)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].url, 'http://plex:32400/library/sections/2/all')
  assert.deepEqual(calls[0].params, { type: 4, 'X-Plex-Token': 'tok' })
  assert.equal(calls[1].headers['X-Plex-Container-Start'], String(PAGE_SIZE))
  assert.equal(calls[0].maxBytes, 20 * 1024 * 1024)
  assert.equal(calls[0].timeoutMs, 15_000)
})

test('listItems asks only for items viewed since a time, and movies use type 1', async () => {
  const calls = []
  const client = createPlexWatchClient({ url: 'http://plex:32400', token: 'tok', request: async (options) => { calls.push(options); return page(1) } })
  await client.listItems({ section: { id: '5', type: 'movie' }, viewedSinceS: 1_793_000_000 })
  assert.deepEqual(calls[0].params, { type: 1, 'lastViewedAt>>': 1_793_000_000, 'X-Plex-Token': 'tok' })
})

test('a 401 is a token error, other failures are unreachable', async () => {
  const rejected = createPlexWatchClient({ url: 'http://plex', token: 'x', request: async () => ({ status: 401 }) })
  await assert.rejects(rejected.listItems({ section: { id: '2', type: 'show' } }), (err) => err.kind === 'token')
  const down = createPlexWatchClient({ url: 'http://plex', token: 'x', request: async () => { throw Object.assign(new Error('x'), { code: 'ECONNREFUSED' }) } })
  await assert.rejects(down.listItems({ section: { id: '2', type: 'show' } }), (err) => err.kind === 'unreachable' && /ECONNREFUSED/.test(err.message))
  const broken = createPlexWatchClient({ url: 'http://plex', token: 'x', request: async () => ({ status: 503 }) })
  await assert.rejects(broken.write({ action: 'scrobble', ratingKey: '1' }), (err) => err.kind === 'unreachable' && err.status === 503)
})

test('metadata asks for rating keys in batches', async () => {
  const calls = []
  const client = createPlexWatchClient({ url: 'http://plex', token: 'x', request: async (options) => { calls.push(options.url); return page(1) } })
  const keys = Array.from({ length: METADATA_BATCH + 1 }, (_, i) => String(i))
  await client.metadata(keys)
  assert.equal(calls.length, 2)
  assert.ok(calls[0].endsWith(`/library/metadata/${keys.slice(0, METADATA_BATCH).join(',')}`))
})

test('writes use scrobble, unscrobble, and progress with the library identifier', async () => {
  const calls = []
  const client = createPlexWatchClient({ url: 'http://plex', token: 'x', request: async (options) => { calls.push(options); return { status: 200 } } })
  await client.write({ action: 'scrobble', ratingKey: '7' })
  await client.write({ action: 'unscrobble', ratingKey: '7' })
  await client.write({ action: 'progress', ratingKey: '7', seconds: 90 })
  assert.deepEqual(calls.map((c) => c.url), ['http://plex/:/scrobble', 'http://plex/:/unscrobble', 'http://plex/:/progress'])
  assert.deepEqual(calls[2].params, { key: '7', identifier: 'com.plexapp.plugins.library', time: 90_000, state: 'stopped', 'X-Plex-Token': 'x' })
  assert.equal(calls[0].timeoutMs, 10_000)
})

test('the toggle body accepts true or false for each direction', () => {
  assert.deepEqual(togglePatchFrom({ from_plex: false }), { fromPlex: false })
  assert.deepEqual(togglePatchFrom({ from_plex: true, to_plex: false }), { fromPlex: true, toPlex: false })
  assert.match(togglePatchFrom({ to_plex: 'yes' }).error, /to_plex/)
  assert.match(togglePatchFrom({}).error, /send/)
})

test('the status answer has every field the Settings row reads', () => {
  const status = plexWatchStatusOf({ configured: true, toggles: { fromPlex: true, toPlex: false }, status: { lastRunAt: 5, unmatched: 2 }, running: false })
  assert.deepEqual(status, {
    configured: true, fromPlex: true, toPlex: false, running: false, lastRunAt: 5, lastFullAt: null, matched: null,
    unmatched: 2, ambiguous: null, error: null, errorKind: null, lastErrorAt: null, nextAttemptAt: null,
  })
})
