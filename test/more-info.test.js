import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  MORE_INFO_CLOSED,
  MORE_INFO_MIN_MS,
  MORE_INFO_SKELETON_AFTER_MS,
  guideDetailsOf,
  loadMoreInfoCredits,
  looksUpCreditsFor,
  moreInfoOf,
  moreInfoRequestOf,
  moreInfoSkeletonOf,
  moreInfoToggledOf,
  moreInfoAfterLoadOf,
  UNKNOWN_KIND,
} from '../src/web/more-info.js'
import { episodeInfoOf, showInfoOf } from '../src/web/library-menus.js'

test('More info starts closed with nothing asked, and asks only on the first open', () => {
  assert.deepEqual(MORE_INFO_CLOSED, { opened: false, load: false })
  const closedToggle = moreInfoToggledOf({ isOpen: false, opened: MORE_INFO_CLOSED.opened })
  assert.deepEqual(closedToggle, { opened: false, load: false })
  const firstOpen = moreInfoToggledOf({ isOpen: true, opened: false })
  assert.deepEqual(firstOpen, { opened: true, load: true })
  const closedAgain = moreInfoToggledOf({ isOpen: false, opened: firstOpen.opened })
  assert.deepEqual(closedAgain, { opened: true, load: false })
  assert.deepEqual(moreInfoToggledOf({ isOpen: true, opened: closedAgain.opened }), { opened: true, load: false })
})

test('an unknown kind asks nothing and shows only guide details', async () => {
  const time = fakeTime()
  const asked = []
  const request = moreInfoRequestOf({ title: 'Mystery', kind: UNKNOWN_KIND })
  const answer = await loadMoreInfoCredits({ request, fetchCredits: async () => { asked.push(1); return { status: 'ready' } }, clock: time.now, wait: time.wait })
  assert.equal(answer, null)
  assert.deepEqual(asked, [])
  assert.deepEqual(time.clock.waits, [])
  assert.deepEqual(moreInfoOf({ credits: answer, guide: { genres: 'Drama' } }).rows, [{ label: 'Genres', value: 'Drama' }])
})

test('the loading skeleton has a full cast row, three crew rows for a film, two for a series, and five details rows', () => {
  assert.deepEqual(moreInfoSkeletonOf('movie'), { cast: 12, crew: 3, details: 5 })
  assert.deepEqual(moreInfoSkeletonOf(''), { cast: 12, crew: 2, details: 5 })
})

test('only films and series are looked up, so an unknown kind shows its answer with no skeleton', () => {
  assert.equal(looksUpCreditsFor(moreInfoRequestOf({ title: 'Heat', kind: 'movie' })), true)
  assert.equal(looksUpCreditsFor(moreInfoRequestOf({ title: 'NCIS' })), true)
  assert.equal(looksUpCreditsFor(moreInfoRequestOf({ title: 'Mystery', kind: UNKNOWN_KIND })), false)
  assert.equal(looksUpCreditsFor(null), false)
})

const fakeTime = () => {
  const clock = { ms: 0, waits: [] }
  return {
    clock,
    now: () => clock.ms,
    wait: async (ms) => {
      clock.waits.push(ms)
      clock.ms += ms
    },
  }
}

const READY = {
  status: 'ready',
  overview: null,
  cast: [
    { name: 'Sean Murray', character: 'Timothy McGee', image: '/api/epg/person-image?src=x&w=192', url: 'https://www.tvmaze.com/people/1/sean-murray' },
    { name: 'Mark Harmon', character: 'Leroy Jethro Gibbs', image: null, url: null },
  ],
  crew: [{ name: 'Donald P. Bellisario', job: 'Creator' }, { name: 'Don McGill', job: 'Creator' }],
  details: { company: 'CBS', year: 2003, genres: ['Drama', 'Action', 'Crime'], minutes: 60, language: 'English' },
  source: 'tvmaze',
  url: 'https://www.tvmaze.com/shows/60/ncis',
}

test('a panel builds a request only when it has a title, and only films keep the movie kind', () => {
  assert.equal(moreInfoRequestOf({ title: '  ' }), null)
  assert.deepEqual(moreInfoRequestOf({ title: 'NCIS', kind: 'series' }), { title: 'NCIS', kind: '', year: null })
  assert.deepEqual(moreInfoRequestOf({ title: 'The Avengers', kind: 'movie', year: 2012 }), { title: 'The Avengers', kind: 'movie', year: 2012 })
})

test('the Info sheet carries the show title and kind for More info, for episodes and shows', () => {
  const episode = { title: 'NCIS', episodeTitle: 'Empty Nest', season: 22, episode: 1, source: 'tvh', otherVersions: [], filePath: '/tv/ncis.ts' }
  assert.deepEqual(episodeInfoOf({ episode, showTitle: 'NCIS', timeZone: 'Australia/Sydney' }).more, { title: 'NCIS', kind: '', year: null })
  const film = { title: 'Heat', kind: 'movie', year: 1995, seasons: [] }
  assert.deepEqual(showInfoOf({ show: film, timeZone: 'Australia/Sydney' }).more, { title: 'Heat', kind: 'movie', year: 1995 })
})

test('opening More info asks once, and a fast answer shows at once with no skeleton', async () => {
  const time = fakeTime()
  const asked = []
  const slow = []
  const answer = await loadMoreInfoCredits({
    request: { title: 'NCIS', kind: '' },
    fetchCredits: async (request) => { asked.push(request.title); return READY },
    onSlow: () => slow.push(time.now()),
    clock: time.now,
    wait: time.wait,
    after: neverFires,
  })
  assert.equal(answer, READY)
  assert.deepEqual(asked, ['NCIS'])
  assert.deepEqual(slow, [])
  assert.deepEqual(time.clock.waits, [])
})

test('an answer slower than 200 ms shows the skeleton, which stays at least 900 ms', async () => {
  const time = fakeTime()
  const slow = []
  const answer = await loadMoreInfoCredits({
    request: { title: 'NCIS', kind: '' },
    fetchCredits: async () => { time.clock.ms += 300; return READY },
    onSlow: () => slow.push(time.now()),
    clock: time.now,
    wait: time.wait,
    after: firesAt({ time, atMs: 200 }),
  })
  assert.equal(answer, READY)
  assert.equal(MORE_INFO_SKELETON_AFTER_MS, 200)
  assert.equal(MORE_INFO_MIN_MS, 900)
  assert.deepEqual(slow, [200])
  assert.deepEqual(time.clock.waits, [600])
})

test('a skeleton shown longer than the minimum is not held any longer', async () => {
  const time = fakeTime()
  await loadMoreInfoCredits({
    request: { title: 'NCIS', kind: '' },
    fetchCredits: async () => { time.clock.ms += 1500; return READY },
    clock: time.now,
    wait: time.wait,
    after: firesAt({ time, atMs: 200 }),
  })
  assert.deepEqual(time.clock.waits, [])
})

const neverFires = () => () => {}

const firesAt = ({ time, atMs }) => (ms, run) => {
  assert.equal(ms, atMs)
  time.clock.ms = atMs
  run()
  return () => {}
}

test('a pending answer is asked again until it settles', async () => {
  const time = fakeTime()
  const answers = [{ status: 'pending' }, { status: 'pending' }, READY]
  const answer = await loadMoreInfoCredits({ request: { title: 'NCIS' }, fetchCredits: async () => answers.shift(), clock: time.now, wait: time.wait })
  assert.equal(answer, READY)
  assert.deepEqual(time.clock.waits, [1000, 2000])
})

test('a lookup still pending after every retry says so, and the next open asks again', async () => {
  const time = fakeTime()
  const answer = await loadMoreInfoCredits({ request: { title: 'NCIS' }, fetchCredits: async () => ({ status: 'pending' }), clock: time.now, wait: time.wait })
  assert.equal(answer.status, 'pending')
  assert.deepEqual(time.clock.waits, [1000, 2000, 4000, 8000, 15000])
  const shown = moreInfoOf({ credits: answer, guide: { genres: 'Drama' } })
  assert.equal(shown.emptyText, 'Still looking up cast and crew. Close and open More info to try again.')
  assert.deepEqual(shown.rows, [{ label: 'Genres', value: 'Drama' }])
  const after = moreInfoAfterLoadOf(answer)
  assert.deepEqual(after, { opened: false })
  assert.deepEqual(moreInfoToggledOf({ isOpen: true, opened: after.opened }), { opened: true, load: true })
  assert.deepEqual(moreInfoAfterLoadOf({ status: 'ready' }), { opened: true })
})

test('a lookup that errors or answers nonsense gives no credits', async () => {
  const time = fakeTime()
  assert.equal(await loadMoreInfoCredits({ request: { title: 'NCIS' }, fetchCredits: async () => { throw new Error('offline') }, clock: time.now, wait: time.wait }), null)
  assert.equal(await loadMoreInfoCredits({ request: { title: 'NCIS' }, fetchCredits: () => 'oops', clock: time.now, wait: time.wait }), null)
})

test('closing the panel while it waits drops the answer', async () => {
  const time = fakeTime()
  let current = true
  const answer = await loadMoreInfoCredits({
    request: { title: 'NCIS' },
    fetchCredits: async () => { current = false; return READY },
    isCurrent: () => current,
    clock: time.now,
    wait: time.wait,
  })
  assert.equal(answer, null)
})

test('a series answer shows cast, crew lines, and the series details rows in order', () => {
  const shown = moreInfoOf({ credits: READY, kind: '' })
  assert.deepEqual(shown.cast.map((person) => person.name), ['Sean Murray', 'Mark Harmon'])
  assert.deepEqual(shown.crew.map((line) => line.text), ['Creator: Donald P. Bellisario, Don McGill'])
  assert.deepEqual(shown.rows, [
    { label: 'Network', value: 'CBS' },
    { label: 'First aired', value: '2003' },
    { label: 'Genres', value: 'Drama, Action, Crime' },
    { label: 'Episode length', value: '1 hr' },
    { label: 'Language', value: 'English' },
  ])
  assert.equal(shown.emptyText, '')
})

test('a film uses film labels and leaves out rows with no value', () => {
  const film = { ...READY, details: { company: 'Marvel Studios', year: 2012, genres: [], minutes: 142, language: null } }
  assert.deepEqual(moreInfoOf({ credits: film, kind: 'movie' }).rows, [
    { label: 'Studio', value: 'Marvel Studios' },
    { label: 'Released', value: '2012' },
    { label: 'Length', value: '2 hrs 22 mins' },
  ])
})

test('a failed or empty lookup leaves out Cast and Crew and keeps the guide details', () => {
  const guide = guideDetailsOf({ genre: 0x10 })
  for (const credits of [null, { status: 'none', cast: [], crew: [] }]) {
    const shown = moreInfoOf({ credits, kind: '', guide })
    assert.deepEqual(shown.cast, [])
    assert.deepEqual(shown.crew, [])
    assert.deepEqual(shown.rows, [{ label: 'Genres', value: guide.genres }])
    assert.equal(shown.emptyText, '')
  }
  assert.ok(guide.genres)
})

test('nothing to show says so, and says why when lookups are off', () => {
  assert.equal(moreInfoOf({ credits: null }).emptyText, 'No cast, crew, or details found for this programme.')
  assert.equal(moreInfoOf({ credits: { status: 'none', off: true, cast: [], crew: [] } }).emptyText,
    'Cast and crew lookups are off. Turn them on in Settings, under Film and TV info.')
})
