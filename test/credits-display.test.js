import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_CAST,
  creditsKeyOf,
  creditsUrlOf,
  crewLinesOf,
  initialsOf,
  isSettledCredits,
  newestSynopsisOf,
  overviewOf,
  shownCastOf,
} from '../src/web/credits-display.js'

test('creditsKeyOf keys by kind, year, and lower-case title, and skips a blank title', () => {
  assert.equal(creditsKeyOf({ title: ' Kill Bill: Vol. 1 ', kind: 'movie', year: 2003 }), 'movie|2003|kill bill: vol. 1')
  assert.equal(creditsKeyOf({ title: 'Survivor', kind: 'series' }), '||survivor')
  assert.equal(creditsKeyOf({ title: '  ' }), '')
})

test('creditsUrlOf sends title and kind, and the year only when it is a real year', () => {
  assert.equal(creditsUrlOf({ title: 'Kill Bill: Vol. 1', kind: 'movie', year: '2003' }),
    '/api/epg/programme-credits?title=Kill+Bill%3A+Vol.+1&kind=movie&year=2003')
  assert.equal(creditsUrlOf({ title: 'Survivor', kind: 'series', year: 'soon' }), '/api/epg/programme-credits?title=Survivor&kind=')
})

test('isSettledCredits accepts ready and none only', () => {
  assert.equal(isSettledCredits({ status: 'ready' }), true)
  assert.equal(isSettledCredits({ status: 'none' }), true)
  assert.equal(isSettledCredits({ status: 'pending' }), false)
  assert.equal(isSettledCredits(null), false)
})

test('shownCastOf keeps named people, drops unsafe links and outside images, adds initials, and caps the list', () => {
  const cast = shownCastOf({
    status: 'ready',
    cast: [
      { name: 'Uma Thurman', character: 'The Bride', image: '/api/epg/person-image?src=a&w=192', url: 'https://www.themoviedb.org/person/139' },
      { name: '', character: 'Nobody' },
      { name: 'Lucy Liu', image: 'https://image.tmdb.org/t/p/w185/b.jpg' },
      { name: 'Jonathan LaPaglia', character: null, image: 'http://insecure.test/b.jpg', url: 'javascript:alert(1)' },
    ],
  })
  assert.deepEqual(cast, [
    { name: 'Uma Thurman', character: 'The Bride', image: '/api/epg/person-image?src=a&w=192', url: 'https://www.themoviedb.org/person/139', initials: 'UT' },
    { name: 'Lucy Liu', character: '', image: null, url: null, initials: 'LL' },
    { name: 'Jonathan LaPaglia', character: '', image: null, url: null, initials: 'JL' },
  ])
  const many = Array.from({ length: 20 }, (_, i) => ({ name: `Person ${i}` }))
  assert.equal(shownCastOf({ status: 'ready', cast: many }).length, MAX_CAST)
  assert.deepEqual(shownCastOf({ status: 'pending', cast: many }), [])
})

test('crewLinesOf groups names by job in first-seen order', () => {
  const lines = crewLinesOf({
    status: 'ready',
    crew: [
      { name: 'Quentin Tarantino', job: 'Director' },
      { name: 'Quentin Tarantino', job: 'Writer' },
      { name: 'Lawrence Bender', job: 'Producer' },
      { name: 'Quentin Tarantino', job: 'Director' },
      { name: 'Uma Thurman', job: 'Writer' },
      { name: '', job: 'Producer' },
    ],
  })
  assert.deepEqual(lines.map((line) => line.text), [
    'Director: Quentin Tarantino',
    'Writer: Quentin Tarantino, Uma Thurman',
    'Producer: Lawrence Bender',
  ])
  assert.deepEqual(lines[1], { job: 'Writer', names: 'Quentin Tarantino, Uma Thurman', text: 'Writer: Quentin Tarantino, Uma Thurman' })
  assert.deepEqual(crewLinesOf({ status: 'none' }), [])
})

test('overviewOf reads a ready overview only', () => {
  assert.equal(overviewOf({ status: 'ready', overview: '  The Bride  wakes. ' }), 'The Bride wakes.')
  assert.equal(overviewOf({ status: 'pending', overview: 'x' }), '')
})

test('newestSynopsisOf picks the newest episode that has a synopsis', () => {
  const show = {
    seasons: [
      { season: 2, episodes: [{ airedAt: 300, synopsis: '' }, { airedAt: 200, synopsis: 'Second.' }] },
      { season: 1, episodes: [{ airedAt: 100, synopsis: 'First.' }, { airedAt: null, synopsis: 'Undated.' }] },
    ],
  }
  assert.equal(newestSynopsisOf(show), 'Second.')
  assert.equal(newestSynopsisOf({ seasons: [] }), '')
  assert.equal(newestSynopsisOf(null), '')
  assert.equal(newestSynopsisOf({ seasons: [], nextAiring: { synopsis: ' Housemates  compete. ' } }), 'Housemates compete.')
})

test('initialsOf takes the first and last word, skipping punctuation', () => {
  assert.equal(initialsOf('Uma Thurman'), 'UT')
  assert.equal(initialsOf('Samuel L. Jackson'), 'SJ')
  assert.equal(initialsOf('Cher'), 'C')
  assert.equal(initialsOf('"Weird Al" Yankovic'), 'WY')
  assert.equal(initialsOf('  '), '')
  assert.equal(initialsOf('élodie bouchez'), 'ÉB')
})
