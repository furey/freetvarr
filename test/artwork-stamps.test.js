import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ARTWORK_STAMPS_KEY, SERIES_MATCH_VERSION, createArtworkStamps, isShowImageUrl, showImageUrlOf, withChoiceStamp } from '../src/web/artwork-stamps.js'

const memoryStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial))
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), values }
}

test('stampUrl adds, replaces, and falls back to the match version on show-image URLs only', () => {
  const stamps = createArtworkStamps({ storage: memoryStorage() })
  const url = showImageUrlOf({ title: 'The Block', width: 384 })
  const automatic = `${url}&c=${SERIES_MATCH_VERSION}`
  assert.equal(stamps.stampUrl(url), automatic)
  stamps.setStamp({ key: 'the-block', kind: 'background', stamp: 'k1' })
  assert.equal(stamps.stampUrl(url), '/api/epg/show-image?title=The%20Block&w=384&c=k1')
  assert.equal(stamps.stampUrl(`${url}&c=old`), '/api/epg/show-image?title=The%20Block&w=384&c=k1')
  assert.equal(stamps.stampUrl(showImageUrlOf({ title: 'The Block', shape: 'poster' })), '/api/epg/show-image?title=The%20Block&shape=poster&c=series-v2')
  stamps.setStamp({ key: 'the-block', kind: 'background', stamp: null })
  assert.equal(stamps.stampUrl(`${url}&c=old`), automatic)
  assert.equal(stamps.stampUrl('/api/recordings/a/image?w=384'), '/api/recordings/a/image?w=384')
  assert.equal(stamps.stampUrl(null), null)
})

test('stamps persist to storage, load back, and tell listeners', () => {
  const storage = memoryStorage()
  const stamps = createArtworkStamps({ storage })
  let calls = 0
  stamps.subscribe(() => { calls += 1 })
  stamps.replaceAll({ bluey: { background: null, poster: 'p1' } })
  assert.equal(calls, 1)
  assert.deepEqual(JSON.parse(storage.values.get(ARTWORK_STAMPS_KEY)), { bluey: { background: null, poster: 'p1' } })
  const reloaded = createArtworkStamps({ storage })
  assert.equal(reloaded.stampOf({ title: 'Bluey', kind: 'poster' }), 'p1')
  assert.equal(createArtworkStamps({ storage: memoryStorage({ [ARTWORK_STAMPS_KEY]: 'not json' }) }).stampOf({ title: 'Bluey' }), null)
})

test('withChoiceStamp and isShowImageUrl handle bare paths', () => {
  assert.equal(withChoiceStamp({ url: '/a', stamp: 'x y' }), '/a?c=x%20y')
  assert.equal(withChoiceStamp({ url: '/a?c=1', stamp: null }), '/a')
  assert.equal(isShowImageUrl('/api/epg/show-image?title=x'), true)
  assert.equal(isShowImageUrl('/api/epg/show-imagex'), false)
})
