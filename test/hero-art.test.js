import { test } from 'node:test'
import assert from 'node:assert/strict'
import { artIdentityFrom, artUrlKeyOf, candidatesOf, isEpisodeSlide, pickDistinctArt, poolRequestsOf } from '../src/web/hero-art.js'

const LIBRARY = '/api/epg/show-image?title=The%20Block&w=768'
const bg = (n) => ({ url: `/api/library/shows/block/art-pool/bg${n}?w=768`, kind: 'background', source: 'plex' })
const ep = (id) => ({ url: `/api/recordings/${id}/image`, kind: 'episode', source: 'guide' })
const poster = { url: '/api/library/shows/block/art-pool/p1?w=768', kind: 'poster', source: 'tvmaze' }

const showSlide = ({ key = 1, ...over } = {}) => ({
  type: 'upcoming', key: `upcoming:${key}`, art: { image: LIBRARY, title: 'The Block' }, ...over,
})
const episodeSlide = (over) => ({
  type: 'new', key: `new:${over.recordingId}`, showKey: 'the-block', art: { image: LIBRARY, title: 'The Block' }, ...over,
})

const imagesOf = (result) => result.slides.map((slide) => slide.art.image)

const assertNoAdjacentRepeats = (images) => {
  images.forEach((image, at) => {
    if (images.length < 2) return
    assert.notEqual(artUrlKeyOf(image), artUrlKeyOf(images[(at + 1) % images.length]), `slides ${at} and next share art`)
  })
}

test('artUrlKeyOf ignores the width parameter, case, and query order', () => {
  assert.equal(artUrlKeyOf('/A?w=768&b=2&a=1'), artUrlKeyOf('/a?a=1&b=2&w=384'))
  assert.equal(artUrlKeyOf('/a?w=768'), '/a')
  assert.equal(artUrlKeyOf(null), '')
})

test('isEpisodeSlide covers recording-backed and episode slide types', () => {
  assert.equal(isEpisodeSlide({ type: 'continue' }), true)
  assert.equal(isEpisodeSlide({ type: 'recording' }), true)
  assert.equal(isEpisodeSlide({ type: 'upcoming' }), false)
  assert.equal(isEpisodeSlide({ type: 'watchlist', recordingId: 'r1' }), true)
})

test('one dominant show keeps every slide with different backgrounds', () => {
  const slides = [showSlide({ key: 1 }), showSlide({ key: 2 }), showSlide({ key: 3 })]
  const pools = { shows: { 'the-block': [bg(1), bg(2), bg(3)] } }
  const result = pickDistinctArt({ slides, pools })
  assert.equal(result.slides.length, 3)
  assert.deepEqual(result.unplaceable, [])
  assert.deepEqual(imagesOf(result), [bg(1).url, bg(2).url, bg(3).url])
})

test('episode slides prefer their own episode art over show backgrounds', () => {
  const slides = [episodeSlide({ recordingId: 'r1' }), episodeSlide({ recordingId: 'r2', type: 'continue' })]
  const pools = { shows: { 'the-block': [bg(1)] }, recordings: { r1: [ep('r1')], r2: [ep('r2')] } }
  assert.deepEqual(imagesOf(pickDistinctArt({ slides, pools })), [ep('r1').url, ep('r2').url])
})

test('show-level slides prefer backgrounds over their own image', () => {
  const slides = [showSlide({ art: { image: '/api/epg/image/46', title: 'The Block' } })]
  const pools = { shows: { 'the-block': [bg(1)] } }
  assert.deepEqual(imagesOf(pickDistinctArt({ slides, pools })), [bg(1).url])
})

test('falls back to the slide image when no pool is known', () => {
  const slides = [showSlide({ key: 1 }), { type: 'on-now', art: { image: '/api/epg/image/9', title: 'Big Wave Season' } }]
  assert.deepEqual(imagesOf(pickDistinctArt({ slides, pools: {} })), [LIBRARY, '/api/epg/image/9'])
})

test('an unused image wins over a reused one, even from a lower tier', () => {
  const slides = [showSlide({ key: 1 }), showSlide({ key: 2 }), showSlide({ key: 3 })]
  const pools = { shows: { 'the-block': [{ ...bg(1), url: LIBRARY, source: 'library' }, bg(2), poster] } }
  const images = imagesOf(pickDistinctArt({ slides, pools }))
  assert.deepEqual(images, [LIBRARY, bg(2).url, poster.url])
})

test('reuses an image only when the pool is exhausted and never next to itself', () => {
  const slides = [showSlide({ key: 1 }), showSlide({ key: 2 }), showSlide({ key: 3 }), showSlide({ key: 4 })]
  const pools = { shows: { 'the-block': [bg(1), bg(2)] } }
  const result = pickDistinctArt({ slides, pools })
  assert.equal(result.slides.length, 4)
  assertNoAdjacentRepeats(imagesOf(result))
})

test('repairs a clash between the last and the first slide', () => {
  const slides = [showSlide({ key: 1 }), { type: 'on-now', art: { image: '/x', title: 'Other' } }, showSlide({ key: 3 })]
  const pools = { shows: { 'the-block': [bg(1), bg(2)], other: [] } }
  const result = pickDistinctArt({ slides, pools })
  assert.equal(result.slides.length, 3)
  assertNoAdjacentRepeats(imagesOf(result))
})

test('reports a slide unplaceable only when every candidate clashes', () => {
  const slides = [showSlide({ key: 1 }), showSlide({ key: 2 })]
  const result = pickDistinctArt({ slides, pools: { shows: { 'the-block': [] } } })
  assert.equal(result.slides.length, 1)
  assert.deepEqual(result.unplaceable.map((slide) => slide.key), ['upcoming:2'])
})

test('drops the last slide when the wrap clash cannot be repaired', () => {
  const lone = (key, image) => ({ type: 'on-now', key, art: { image, title: key } })
  const slides = [lone('a', '/one'), lone('b', '/two'), lone('c', '/one')]
  const result = pickDistinctArt({ slides, pools: {} })
  assert.deepEqual(result.slides.map((slide) => slide.key), ['a', 'b'])
  assert.deepEqual(result.unplaceable.map((slide) => slide.key), ['c'])
})

test('candidatesOf removes duplicate urls that differ only by width', () => {
  const slide = showSlide({ art: { image: bg(1).url.replace('w=768', 'w=384'), title: 'The Block' } })
  assert.deepEqual(candidatesOf({ slide, pools: { shows: { 'the-block': [bg(1)] } } }), [bg(1).url])
})

test('keeps the rest of the slide unchanged', () => {
  const slide = showSlide({ key: 1, eyebrow: 'Next airing' })
  const [placed] = pickDistinctArt({ slides: [slide], pools: { shows: { 'the-block': [bg(1)] } } }).slides
  assert.equal(placed.eyebrow, 'Next airing')
  assert.equal(placed.art.title, 'The Block')
})

test('images with the same content key count as the same art', () => {
  const guide = (id) => ({ ...ep(id), contentKey: 'same-picture' })
  const slides = [episodeSlide({ recordingId: 'r1' }), episodeSlide({ recordingId: 'r2' })]
  const pools = { shows: { 'the-block': [bg(1)] }, recordings: { r1: [guide('r1')], r2: [guide('r2')] } }
  const images = imagesOf(pickDistinctArt({ slides, pools }))
  assert.deepEqual(images, [ep('r1').url, LIBRARY])
  const identityOf = artIdentityFrom(pools)
  assert.equal(identityOf(ep('r1').url), identityOf(ep('r2').url))
})

test('poolRequestsOf asks only for shows that repeat, and their episode recordings', () => {
  const slides = [
    episodeSlide({ recordingId: 'r1' }),
    showSlide({ key: 2 }),
    { type: 'on-now', key: 'x', art: { image: '/x', title: 'Big Wave Season' } },
    { type: 'movie', key: 'm', recordingId: 'm1', showKey: 'paddock', art: { image: '/m', title: 'Paddock' } },
  ]
  assert.deepEqual(poolRequestsOf(slides), { showKeys: ['the-block'], recordingIds: ['r1'] })
  assert.deepEqual(poolRequestsOf([]), { showKeys: [], recordingIds: [] })
})
