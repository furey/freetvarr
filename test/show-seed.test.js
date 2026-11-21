import { test } from 'node:test'
import assert from 'node:assert/strict'
import { heroMetaOf, pageShapeOf, playButtonLabel, seedDetailOf } from '../src/web/show-page.js'

const filmSummary = (overrides = {}) => ({
  key: 'rocky',
  title: 'Rocky',
  kind: 'movie',
  classification: 'M',
  year: 1976,
  poster: '/api/epg/show-image?title=Rocky&shape=poster',
  image: '/api/epg/show-image?title=Rocky&w=384',
  artworkStamps: { background: null, poster: null },
  counts: { total: 1, unwatched: 1, failed: 0, inProgress: 0 },
  recordingNow: false,
  inProgress: null,
  nextAiring: null,
  rule: null,
  latest: { recordingId: 'plex-1', episodeTitle: null, season: null, episode: null, airedAt: 1, durationS: 7200, channelName: null, watched: false, positionS: null },
  ...overrides,
})

test('seedDetailOf: a single recorded film opens in its final shape from the shelf summary', () => {
  const seed = seedDetailOf(filmSummary())
  assert.equal(pageShapeOf(seed), 'single')
  assert.equal(heroMetaOf({ show: seed }), '1976 · 2 hrs')
  assert.equal(playButtonLabel({ show: seed }), 'Play')
})

test('seedDetailOf: a part-watched film seeds the Resume button and the time left', () => {
  const seed = seedDetailOf(filmSummary({ latest: { ...filmSummary().latest, positionS: 3600 } }))
  assert.equal(playButtonLabel({ show: seed }), 'Resume')
  assert.equal(heroMetaOf({ show: seed }), '1976 · 2 hrs · 60 mins left')
})

test('seedDetailOf: no seed when the shelf summary cannot predict the page', () => {
  assert.equal(seedDetailOf(null), null)
  assert.equal(seedDetailOf(filmSummary({ kind: 'show' })), null)
  assert.equal(seedDetailOf(filmSummary({ counts: { total: 2, unwatched: 2, failed: 0, inProgress: 0 } })), null)
  assert.equal(seedDetailOf(filmSummary({ counts: { total: 1, unwatched: 0, failed: 1, inProgress: 0 } })), null)
  assert.equal(seedDetailOf(filmSummary({ recordingNow: true })), null)
  assert.equal(seedDetailOf(filmSummary({ rule: { recording: true } })), null)
  assert.equal(seedDetailOf(filmSummary({ nextAiring: { startDate: 2 } })), null)
  assert.equal(seedDetailOf(filmSummary({ latest: null })), null)
})
