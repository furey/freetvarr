import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  classificationOf,
  classificationToneOf,
  isSettledRatings,
  lastLineRightOf,
  linkFitsLastLine,
  ratingsKeyOf,
  ratingsUrlOf,
  retryDelayOf,
  reviewsLinkLabelOf,
  shownReviewOf,
  shownScoreOf,
  votesLineOf,
} from '../src/web/ratings-display.js'

const tmdbReady = {
  status: 'ready',
  score: 8.04,
  votes: 19595,
  source: 'tmdb',
  url: 'https://www.themoviedb.org/movie/24',
  reviews: { snippet: 'Tarantino at his best.', count: 6, url: 'https://www.themoviedb.org/movie/24/reviews' },
}

test('classification codes map to badge tones', () => {
  assert.equal(classificationToneOf('G'), 'g')
  assert.equal(classificationToneOf('PG'), 'pg')
  assert.equal(classificationToneOf('M'), 'm')
  assert.equal(classificationToneOf('MA15+'), 'ma')
  assert.equal(classificationToneOf('R18+'), 'r')
  assert.equal(classificationToneOf('P'), 'g')
  assert.equal(classificationToneOf('C'), 'g')
  assert.equal(classificationToneOf('AV15+'), 'ma')
})

test('classification codes normalise case and spaces, and reject unknown codes', () => {
  assert.equal(classificationOf(' ma 15+ '), 'MA15+')
  assert.equal(classificationOf('pg'), 'PG')
  assert.equal(classificationOf('X18+'), null)
  assert.equal(classificationOf(null), null)
  assert.equal(classificationToneOf(''), null)
})

test('ratings key and URL use movie only for films', () => {
  assert.equal(ratingsKeyOf({ title: 'Kill Bill: Vol. 1', kind: 'movie' }), 'movie|kill bill: vol. 1|')
  assert.equal(ratingsKeyOf({ title: 'Kill Bill: Vol. 1', kind: 'movie', year: 2003 }), 'movie|kill bill: vol. 1|2003')
  assert.equal(ratingsKeyOf({ title: 'MasterChef Australia', kind: 'series' }), '|masterchef australia|')
  assert.equal(ratingsKeyOf({ title: '  ' }), '')
  assert.equal(ratingsUrlOf({ title: 'Kill Bill: Vol. 1', kind: 'movie' }), '/api/epg/programme-ratings?title=Kill%20Bill%3A%20Vol.%201&kind=movie')
  assert.equal(ratingsUrlOf({ title: 'Bluey', kind: 'episode' }), '/api/epg/programme-ratings?title=Bluey&kind=')
  assert.equal(ratingsUrlOf({ title: 'Heat', kind: 'movie', year: '1995' }), '/api/epg/programme-ratings?title=Heat&kind=movie&year=1995')
  assert.equal(ratingsUrlOf({ title: 'Heat', kind: 'movie', year: 'n/a' }), '/api/epg/programme-ratings?title=Heat&kind=movie')
})

test('pending ratings retry after 4, 12, and 30 seconds, then stop', () => {
  assert.deepEqual([0, 1, 2, 3].map(retryDelayOf), [4000, 12000, 30000, null])
  assert.equal(isSettledRatings({ status: 'pending' }), false)
  assert.equal(isSettledRatings({ status: 'none' }), true)
  assert.equal(isSettledRatings(null), false)
})

test('score shows one decimal, votes, and an accessible label', () => {
  assert.deepEqual(shownScoreOf(tmdbReady), {
    label: '8.0',
    outOf: '8.0 out of 10',
    votesLine: 'TMDB users, 19,595 votes',
    ariaLabel: 'Rated 8.0 out of 10 by TMDB users',
    linkLabel: 'Open on TMDB',
    url: 'https://www.themoviedb.org/movie/24',
  })
})

test('TVmaze scores name no vote count', () => {
  const score = shownScoreOf({ status: 'ready', score: 7.1, votes: null, source: 'tvmaze', url: 'https://www.tvmaze.com/shows/1' })
  assert.equal(score.votesLine, 'TVmaze users')
  assert.equal(score.linkLabel, 'Open on TVmaze')
  assert.equal(votesLineOf({ source: 'tvmaze', votes: 120 }), 'TVmaze users')
})

test('score hides when not ready, missing, unknown source, or under 50 TMDB votes', () => {
  assert.equal(shownScoreOf({ ...tmdbReady, status: 'none' }), null)
  assert.equal(shownScoreOf({ ...tmdbReady, status: 'pending' }), null)
  assert.equal(shownScoreOf({ ...tmdbReady, score: null }), null)
  assert.equal(shownScoreOf({ ...tmdbReady, votes: 49 }), null)
  assert.equal(shownScoreOf({ ...tmdbReady, source: 'imdb' }), null)
  assert.equal(shownScoreOf(undefined), null)
})

test('score keeps the badge but drops a non-https link', () => {
  assert.equal(shownScoreOf({ ...tmdbReady, url: 'javascript:alert(1)' }).url, null)
})

test('review shows the snippet without outer quotes and a counted link', () => {
  assert.deepEqual(shownReviewOf({ ...tmdbReady, reviews: { ...tmdbReady.reviews, snippet: '“Tarantino at his best.”' } }), {
    snippet: 'Tarantino at his best.',
    linkLabel: 'Read 6 reviews',
    url: 'https://www.themoviedb.org/movie/24/reviews',
  })
  assert.equal(reviewsLinkLabelOf(1), 'Read 1 review')
  assert.equal(reviewsLinkLabelOf(1200), 'Read 1,200 reviews')
})

test('review hides without a snippet, a count, or a safe link', () => {
  assert.equal(shownReviewOf({ ...tmdbReady, reviews: null }), null)
  assert.equal(shownReviewOf({ ...tmdbReady, reviews: { ...tmdbReady.reviews, snippet: ' ' } }), null)
  assert.equal(shownReviewOf({ ...tmdbReady, reviews: { ...tmdbReady.reviews, count: 0 } }), null)
  assert.equal(shownReviewOf({ ...tmdbReady, reviews: { ...tmdbReady.reviews, url: 'http://x' } }), null)
  assert.equal(shownReviewOf({ ...tmdbReady, status: 'none' }), null)
})

test('the review link fits the last line only with room for the link and a gap', () => {
  const box = { boxLeft: 20, boxWidth: 300, linkWidth: 100 }
  assert.equal(linkFitsLastLine({ ...box, lastLineRight: 20 + 188 }), true)
  assert.equal(linkFitsLastLine({ ...box, lastLineRight: 20 + 189 }), false)
  assert.equal(linkFitsLastLine({ ...box, lastLineRight: null }), false)
  assert.equal(linkFitsLastLine({ ...box, linkWidth: 0, lastLineRight: 40 }), false)
})

test('the last line edge skips empty rects', () => {
  assert.equal(lastLineRightOf([{ width: 280, right: 300 }, { width: 90, right: 110 }, { width: 0, right: 110 }]), 110)
  assert.equal(lastLineRightOf([]), null)
})
