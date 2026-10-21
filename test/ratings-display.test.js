import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  classificationOf,
  hoverClosesCard,
  hoverOpensCard,
  classificationToneOf,
  isSettledRatings,
  pressKeepsCardOpen,
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

test('pending ratings retry after 1, 2, 4, 8, and 15 seconds, then stop', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(retryDelayOf), [1000, 2000, 4000, 8000, 15000, null])
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

test('hoverOpensCard opens a closed card only for a mouse on a hover-capable fine pointer', () => {
  assert.equal(hoverOpensCard({ pointerType: 'mouse', hoverPointer: true, open: false }), true)
  assert.equal(hoverOpensCard({ pointerType: 'mouse', hoverPointer: true, open: true }), false)
  assert.equal(hoverOpensCard({ pointerType: 'mouse', hoverPointer: false, open: false }), false)
  assert.equal(hoverOpensCard({ pointerType: 'touch', hoverPointer: true, open: false }), false)
  assert.equal(hoverOpensCard({ pointerType: 'pen', hoverPointer: true, open: false }), false)
})

test('hoverClosesCard closes only a card the mouse opened by hover', () => {
  assert.equal(hoverClosesCard({ pointerType: 'mouse', openedByHover: true, open: true }), true)
  assert.equal(hoverClosesCard({ pointerType: 'mouse', openedByHover: false, open: true }), false)
  assert.equal(hoverClosesCard({ pointerType: 'mouse', openedByHover: true, open: false }), false)
  assert.equal(hoverClosesCard({ pointerType: 'touch', openedByHover: true, open: true }), false)
})

test('pressKeepsCardOpen pins a hover-opened card and toggles a pressed one', () => {
  assert.equal(pressKeepsCardOpen({ openedByHover: true, open: true }), true)
  assert.equal(pressKeepsCardOpen({ openedByHover: false, open: false }), true)
  assert.equal(pressKeepsCardOpen({ openedByHover: false, open: true }), false)
})
