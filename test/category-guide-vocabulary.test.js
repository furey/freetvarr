import { test } from 'node:test'
import assert from 'node:assert/strict'

import { categoryOfProgramme, guideCategoriesOf, isRatingsLikely } from '../src/classification-labels.js'
import { createCategoryIndex, mostSpecificCategoryOf, formatOfTags, sportCodeOf, tagTitle } from '../src/for-you-categories.js'
import { lookupTitleOf } from '../src/genre-enrichment.js'

const factsOf = (overrides = {}) => ({
  key: 'quorrel', title: 'Quorrel', hashes: new Set(), genreTags: new Set(), channelNames: new Set(['WXYZ']), guideGenres: new Set(),
  genre: null, tvmazeType: null, tvmazeGenres: [], wikidataGenres: [], origin: null, override: null, labeller: null, film: false, kidsSlotsOnly: false,
  ...overrides,
})

test('every guide category is kept, in order, and readers split them again', () => {
  const xml = '<programme><title>Line</title><category lang="en">Series</category><category>Crime drama</category><category>Drama</category><category>Series</category></programme>'
  assert.equal(categoryOfProgramme(xml), 'series|crime drama|drama')
  assert.deepEqual(guideCategoriesOf('series|crime drama|drama'), ['series', 'crime drama', 'drama'])
  assert.deepEqual(guideCategoriesOf(null), [])
  assert.equal(isRatingsLikely({ kind: 'series', category: 'series|drama' }), true)
  assert.equal(isRatingsLikely({ kind: 'series', category: 'series|reality' }), false)
})

test('US guide words: crime drama, sitcom, competition reality, and game show give formats', () => {
  const us = createCategoryIndex({ country: 'us' })
  assert.equal(formatOfTags(tagTitle({ index: us, facts: factsOf({ guideGenres: new Set(['series', 'crime drama']) }) })), 'crime-drama')
  assert.equal(formatOfTags(tagTitle({ index: us, facts: factsOf({ guideGenres: new Set(['series', 'sitcom']) }) })), 'comedy')
  assert.equal(formatOfTags(tagTitle({ index: us, facts: factsOf({ guideGenres: new Set(['series', 'competition reality']) }) })), 'reality')
  assert.equal(formatOfTags(tagTitle({ index: us, facts: factsOf({ guideGenres: new Set(['series', 'game show']) }) })), 'quiz')
})

test('a guide sport code beats a title word, hockey means ice hockey only in the US and Canada, and racing alone is not horse racing', () => {
  assert.equal(sportCodeOf({ title: 'Sharks Pregame Live', guideGenres: ['series', 'hockey'], country: 'us' }), 'ice-hockey')
  assert.equal(sportCodeOf({ title: 'Racing Rewind', guideGenres: ['auto racing'], country: 'us' }), 'motorsport')
  assert.equal(sportCodeOf({ title: 'Hockey Night', guideGenres: ['hockey'], country: 'au' }), null)
  assert.equal(sportCodeOf({ title: 'NHRA Drag Racing', country: 'us' }), 'motorsport')
  assert.equal(sportCodeOf({ title: 'Sprint Car Racing', country: 'au' }), 'motorsport')
  assert.equal(sportCodeOf({ title: 'Saturday Racing', country: 'au' }), null)
  assert.equal(sportCodeOf({ title: 'Sky Racing Live', country: 'au' }), 'horse-racing')
  assert.equal(sportCodeOf({ title: 'Melbourne Cup Day', country: 'au' }), 'horse-racing')
  const sharks = tagTitle({ index: createCategoryIndex({ country: 'us' }), facts: factsOf({ title: 'Sharks Pregame Live', guideGenres: new Set(['series', 'hockey']) }) })
  assert.equal(mostSpecificCategoryOf(sharks), 'ice-hockey')
})

test('broadcast prefixes come off the lookup title only', () => {
  assert.equal(lookupTitleOf('Live: The Beat With Ari Melber'), 'The Beat With Ari Melber')
  assert.equal(lookupTitleOf('All New: Gruen'), 'Gruen')
  assert.equal(lookupTitleOf('New: '), 'New: ')
  assert.equal(lookupTitleOf('Newsline'), 'Newsline')
})

test('the known-shows list applies only to installs in Australia and New Zealand', () => {
  const today = factsOf({ key: 'today', title: 'Today' })
  assert.equal(mostSpecificCategoryOf(tagTitle({ index: createCategoryIndex({ country: 'au' }), facts: today })), 'local-life')
  assert.equal(createCategoryIndex({ country: 'nz' }).knownShows.shows.today !== undefined, true)
  assert.deepEqual(createCategoryIndex({ country: 'us' }).knownShows, { shows: {} })
  assert.notEqual(mostSpecificCategoryOf(tagTitle({ index: createCategoryIndex({ country: 'us' }), facts: today })), 'local-life')
})

test('a long single sport airing is not a film: sport words, event words, a Live: prefix, or a sport guide category', async () => {
  const { isMovieLike } = await import('../src/genre-enrichment.js')
  const { titleFactsOf } = await import('../src/for-you-categories.js')
  const long = (title) => ({ title, start: 0, end: 3 * 60 * 60 * 1000, genre: null })
  assert.equal(isMovieLike(long('Australian Superbike Championship')), false)
  assert.equal(isMovieLike(long('Live: Night Thunder')), false)
  assert.equal(isMovieLike(long('Speedway Round 4')), false)
  assert.equal(isMovieLike(long('The Quiet Girl')), true)
  const facts = titleFactsOf({
    programmes: [{ ...long('Night Thunder'), channel_id: '1' }],
    keyOf: (title) => title.toLowerCase().replace(/\s+/g, '-'),
    genreTagsOf: () => [],
    guideGenresOf: () => ['sport'],
    isFilm: () => true,
    hourOf: () => 20,
  })
  assert.equal(facts.get('night-thunder').film, false)
})
