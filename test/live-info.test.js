import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  channelNumberLabel,
  seasonEpisodeOf,
  ratingLabel,
  genreLabel,
  programmeProgress,
  airingBoundary,
  airingCovers,
  watchRowLabel,
} from '../src/web/live-info.js'

const program = { title: 'News', start: 1_000, end: 2_000 }

test('channelNumberLabel pads to two digits and leaves longer numbers alone', () => {
  assert.equal(channelNumberLabel(2), '02')
  assert.equal(channelNumberLabel(22), '22')
  assert.equal(channelNumberLabel(301), '301')
  assert.equal(channelNumberLabel(null), '')
  assert.equal(channelNumberLabel(undefined), '')
})

test('seasonEpisodeOf formats season and episode numbers', () => {
  assert.equal(seasonEpisodeOf({ series_no: 1, episode_no: 2 }), 'S01E02')
  assert.equal(seasonEpisodeOf({ series_no: null, episode_no: 14 }), 'E14')
  assert.equal(seasonEpisodeOf({ series_no: 3, episode_no: null }), 'S03')
  assert.equal(seasonEpisodeOf({ series_no: null, episode_no: null }), '')
})

test('ratingLabel shows the programme classification', () => {
  assert.equal(ratingLabel({ classification: 'PG' }), 'PG')
  assert.equal(ratingLabel({ classification: 'MA15+' }), 'MA15+')
  assert.equal(ratingLabel({ classification: 'ma 15+' }), 'MA15+')
  assert.equal(ratingLabel({ classification: 'R18+', rating: '18' }), 'R18+')
  assert.equal(ratingLabel({ rating: '15' }), '')
  assert.equal(ratingLabel({ classification: 'X' }), '')
  assert.equal(ratingLabel({ classification: null }), '')
  assert.equal(ratingLabel(null), '')
})

test('genreLabel names the DVB content group', () => {
  assert.equal(genreLabel(0x10), 'Movie / drama')
  assert.equal(genreLabel(0x23), 'News / current affairs')
  assert.equal(genreLabel(0x40), 'Sport')
  assert.equal(genreLabel(null), '')
  assert.equal(genreLabel(0xf0), '')
})

test('programmeProgress is the share of the programme played at a time', () => {
  assert.equal(programmeProgress({ program, atMs: 1_500 }), 50)
  assert.equal(programmeProgress({ program, atMs: 500 }), 0)
  assert.equal(programmeProgress({ program, atMs: 2_500 }), 100)
  assert.equal(programmeProgress({ program: { start: 1_000, end: 1_000 }, atMs: 1_000 }), 0)
})

test('airingBoundary is the end of now, else the start of next', () => {
  assert.equal(airingBoundary({ now: program, next: { start: 2_000 } }), 2_000)
  assert.equal(airingBoundary({ now: null, next: { start: 5_000 } }), 5_000)
  assert.equal(airingBoundary({ now: null, next: null }), null)
})

test('airingCovers is true while the time stays inside the fetched programme', () => {
  const airing = { now: program, next: null, atMs: 1_200 }
  assert.equal(airingCovers({ airing, atMs: 1_000 }), true)
  assert.equal(airingCovers({ airing, atMs: 1_999 }), true)
  assert.equal(airingCovers({ airing, atMs: 2_000 }), false)
  assert.equal(airingCovers({ airing, atMs: 999 }), false)
  assert.equal(airingCovers({ airing: null, atMs: 1_000 }), false)
})

test('airingCovers spans a gap from the fetch time to the next start', () => {
  const airing = { now: null, next: { start: 5_000 }, atMs: 3_000 }
  assert.equal(airingCovers({ airing, atMs: 4_999 }), true)
  assert.equal(airingCovers({ airing, atMs: 5_000 }), false)
  assert.equal(airingCovers({ airing, atMs: 2_999 }), false)
  assert.equal(airingCovers({ airing: { now: null, next: null, atMs: 3_000 }, atMs: 9e12 }), true)
})

test('watchRowLabel names the channel and the programme on now', () => {
  const channel = { name: 'ABC TV' }
  assert.equal(watchRowLabel({ channel, now: { title: 'Gruen' } }), 'Watch ABC TV live, Gruen on now')
  assert.equal(watchRowLabel({ channel, now: null }), 'Watch ABC TV live')
})
