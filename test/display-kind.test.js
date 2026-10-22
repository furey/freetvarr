import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDisplayKinds, displayKindOf, guideMovieChoiceOf, withDisplayKinds } from '../src/display-kind.js'
import { FILM_MIN_MS, looksLikeFilm } from '../src/film-rule.js'
import { savedWithKinds } from '../src/epg.js'

const MINUTE_MS = 60_000
const airing = ({ title, minutes, genre = null, ...rest }) => ({
  title, genre, series_no: null, episode_no: null, episode_title: null, start: 0, end: minutes * MINUTE_MS, ...rest,
})

const downsizing = airing({ title: 'Downsizing', minutes: 150 })
const pianist = airing({ title: 'The Pianist', minutes: 170 })
const goodfellas = airing({ title: 'Goodfellas', minutes: 175 })
const londonHasFallen = airing({ title: 'London Has Fallen', minutes: 120 })
const masterCheng = airing({ title: 'Master Cheng', minutes: 125, genre: 0x10 })
const lifeOnOurPlanet = airing({ title: 'David Attenborough: A Life On Our Planet', minutes: 90 })
const grandFinal = airing({ title: 'AFL Grand Final', minutes: 240, genre: 0x40 })
const electionNight = airing({ title: 'Australia Votes', minutes: 300, genre: 0x20 })
const mediaWatch = airing({ title: 'Media Watch', minutes: 30, series_no: 37, episode_no: 30 })
const murdoch = airing({ title: 'Murdoch Mysteries', minutes: 60, episode_title: 'Murdoch and the Undead' })
const happysPlace = airing({ title: "Happy's Place", minutes: 30 })
const carols = airing({ title: 'Carols By Candlelight', minutes: 70 })

test('displayKindOf: long programmes with no episode details are movies without the ETSI movie genre', () => {
  for (const programme of [downsizing, pianist, goodfellas, londonHasFallen, masterCheng]) {
    assert.equal(displayKindOf({ programme }), 'movie', programme.title)
  }
})

test('displayKindOf: a long documentary special with no numbers counts as a movie, unless listed as current affairs', () => {
  assert.equal(displayKindOf({ programme: lifeOnOurPlanet }), 'movie')
  assert.equal(displayKindOf({ programme: { ...lifeOnOurPlanet, genre: 0x90 } }), 'movie')
  assert.equal(displayKindOf({ programme: { ...lifeOnOurPlanet, genre: 0x23 } }), 'one-off')
})

test('displayKindOf: long news and sport stay one-off unless the enrichment calls them a film', () => {
  assert.equal(displayKindOf({ programme: grandFinal }), 'one-off')
  assert.equal(displayKindOf({ programme: electionNight }), 'one-off')
  assert.equal(displayKindOf({ programme: grandFinal, record: { categories: ['movie'] } }), 'movie')
})

test('displayKindOf: 5 airings in the week make a series unless the guide lists a movie', () => {
  assert.equal(displayKindOf({ programme: downsizing, airingsInWeek: 4 }), 'movie')
  assert.equal(displayKindOf({ programme: downsizing, airingsInWeek: 5 }), 'series')
  assert.equal(displayKindOf({ programme: masterCheng, airingsInWeek: 5 }), 'movie')
  assert.equal(displayKindOf({ programme: happysPlace, airingsInWeek: 3 }), 'series')
})

test('displayKindOf: TVmaze shows and episode details are series, short specials are one-offs', () => {
  assert.equal(displayKindOf({ programme: downsizing, record: { source: 'tvmaze:1', categories: [] } }), 'series')
  assert.equal(displayKindOf({ programme: mediaWatch }), 'series')
  assert.equal(displayKindOf({ programme: murdoch }), 'series')
  assert.equal(displayKindOf({ programme: happysPlace }), 'one-off')
  assert.equal(displayKindOf({ programme: carols }), 'one-off')
  assert.equal(displayKindOf({ programme: airing({ title: 'Short Film', minutes: FILM_MIN_MS / MINUTE_MS - 1, genre: 0x10 }) }), 'one-off')
})

test('createDisplayKinds: counts airings by show title and reads cached enrichment records', () => {
  const programmes = [happysPlace, { ...happysPlace, title: "HAPPY'S PLACE" }, { ...happysPlace, title: 'Happy’s Place' }, carols, goodfellas]
  const kindOf = createDisplayKinds({ programmes, recordsByKey: new Map([['carols-by-candlelight', { source: 'tvmaze:9', categories: [] }]]) })
  assert.deepEqual(withDisplayKinds({ programmes, kindOf }).map((p) => p.kind), ['series', 'series', 'series', 'series', 'movie'])
})

test('savedWithKinds: history copies kept from earlier today get a kind from the current guide', () => {
  const kindOf = createDisplayKinds({ programmes: [mediaWatch, murdoch] })
  const saved = savedWithKinds({ guide: { kindOf }, saved: [{ ...mediaWatch, kind: undefined }, happysPlace, goodfellas] })
  assert.deepEqual(saved.map((p) => p.kind), ['series', 'one-off', 'movie'])
  assert.deepEqual(savedWithKinds({ guide: {}, saved: [happysPlace] }), [happysPlace])
  assert.deepEqual(savedWithKinds({ guide: { kindOf } }), [])
})

test('looksLikeFilm: the library filing rule still needs the ETSI movie genre', () => {
  const facts = ({ genre, start, end }) => ({ genres: genre == null ? [] : [genre], start, end })
  assert.equal(looksLikeFilm(facts(goodfellas)), false)
  assert.equal(looksLikeFilm(facts(masterCheng)), true)
})

test('displayKindOf: a kind override wins over the automatic rule', () => {
  assert.equal(displayKindOf({ programme: downsizing, record: { kindOverride: 'not-movie' } }), 'one-off')
  assert.equal(displayKindOf({ programme: downsizing, record: { kindOverride: 'not-movie' }, airingsInWeek: 3 }), 'series')
  assert.equal(displayKindOf({ programme: downsizing, record: { kindOverride: 'movie' }, airingsInWeek: 3 }), 'movie')
  assert.equal(displayKindOf({ programme: masterCheng, record: { kindOverride: 'not-movie', categories: ['movie'] } }), 'one-off')
  assert.equal(displayKindOf({ programme: carols, record: { kindOverride: 'movie', source: 'tvmaze:1' } }), 'movie')
})

test('createDisplayKinds: reads kind overrides from the records by show key', () => {
  const kindOf = createDisplayKinds({
    programmes: [goodfellas, happysPlace],
    recordsByKey: new Map([['goodfellas', { categories: [], kindOverride: 'not-movie' }]]),
  })
  assert.equal(kindOf(goodfellas), 'one-off')
})

test('guideMovieChoiceOf: films offer Not a movie, long one-offs offer This is a movie, series never', () => {
  assert.equal(guideMovieChoiceOf({ programme: downsizing, kind: 'movie' }), 'not-movie')
  assert.equal(guideMovieChoiceOf({ programme: downsizing, kind: 'one-off' }), 'movie')
  assert.equal(guideMovieChoiceOf({ programme: downsizing, kind: 'series' }), null)
  assert.equal(guideMovieChoiceOf({ programme: airing({ title: 'Heron', minutes: 30 }), kind: 'one-off' }), null)
  assert.equal(guideMovieChoiceOf({ programme: airing({ title: 'Heron', minutes: 100, episode_no: 2 }), kind: 'movie' }), null)
})

test('withDisplayKinds: adds movieChoice only when there is one', () => {
  const [film, short] = withDisplayKinds({
    programmes: [downsizing, airing({ title: 'Heron', minutes: 30 })],
    kindOf: (programme) => (programme === downsizing ? 'movie' : 'one-off'),
  })
  assert.equal(film.movieChoice, 'not-movie')
  assert.equal('movieChoice' in short, false)
})
