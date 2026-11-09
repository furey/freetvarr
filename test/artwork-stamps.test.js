import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ARTWORK_STAMPS_KEY, SERIES_MATCH_VERSION, createArtworkStamps, isShowImageUrl, pictureOfShowImageUrl, showImageUrlOf, unstampedUrl, withChoiceStamp } from '../src/web/artwork-stamps.js'

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

test('setStamps saves a batch once, skips unchanged and unknown kinds, and keeps other stamps', () => {
  const storage = memoryStorage()
  const stamps = createArtworkStamps({ storage })
  stamps.setStamp({ key: 'bluey', kind: 'background', stamp: 'choice1' })
  let calls = 0
  stamps.subscribe(() => { calls += 1 })
  stamps.setStamps([
    { key: 'bluey', kind: 'poster', stamp: 'r1' },
    { key: 'heat', kind: 'background', stamp: 'r2' },
    { key: 'heat', kind: 'banner', stamp: 'r3' },
  ])
  assert.equal(calls, 1)
  assert.deepEqual(JSON.parse(storage.values.get(ARTWORK_STAMPS_KEY)), { bluey: { background: 'choice1', poster: 'r1' }, heat: { background: 'r2' } })
  stamps.setStamps([{ key: 'heat', kind: 'background', stamp: 'r2' }])
  assert.equal(calls, 1)
})

test('pictureOfShowImageUrl and unstampedUrl read and strip show-image URLs only', () => {
  assert.deepEqual(pictureOfShowImageUrl('/api/epg/show-image?title=The%20Block&shape=poster&c=x'), { key: 'the-block', kind: 'poster' })
  assert.equal(pictureOfShowImageUrl('/api/epg/image/12'), null)
  assert.equal(unstampedUrl('/api/epg/show-image?title=A&c=x&w=384'), '/api/epg/show-image?title=A&w=384')
  assert.equal(unstampedUrl('/api/recordings/r1/image?c=x'), '/api/recordings/r1/image?c=x')
})
