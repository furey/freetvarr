import { test } from 'node:test'
import assert from 'node:assert/strict'

import { byteLabelOf, genreLabelsOf, guideGenreKeysOf, hasStrongDocumentaryEvidence, isLiveEventTitle, ruleLabelsOf } from '../src/for-you-label-rules.js'
import { KNOWN_SHOWS, knownShowOf } from '../src/for-you-known-shows.js'

const list = {
  shows: {
    'shark-tank': { format: 'reality', topics: ['business-and-money'], origin: 'us' },
    ghosts: [
      { format: 'comedy', origin: 'gb', channels: ['abc'] },
      { format: 'comedy', origin: 'us', channels: ['10'] },
    ],
  },
}

test('known shows: exact keys only, so Shark Tank never matches Shark Tank Australia', () => {
  assert.equal(knownShowOf({ keys: ['shark-tank'], list }).origin, 'us')
  assert.equal(knownShowOf({ keys: ['shark-tank-australia'], list }), null)
})

test('known shows: two versions of one title pick by TVmaze country, then channel word, then install country', () => {
  assert.equal(knownShowOf({ keys: ['ghosts'], tvmazeCountry: 'US', channelNames: ['ABC TV'], list }).origin, 'us')
  assert.equal(knownShowOf({ keys: ['ghosts'], channelNames: ['ABC TV HD'], list }).origin, 'gb')
  assert.equal(knownShowOf({ keys: ['ghosts'], channelNames: ['SBS'], country: 'us', list }).origin, 'us')
  assert.equal(knownShowOf({ keys: ['ghosts'], channelNames: ['SBS'], country: 'nz', list }), null)
})

test('known shows: the shipped list has labels only, with no descriptions', () => {
  const entries = Object.values(KNOWN_SHOWS.shows).flat()
  assert.ok(entries.length > 500)
  assert.ok(entries.every((entry) => Object.keys(entry).every((field) => ['format', 'topics', 'origin', 'channels'].includes(field))))
})

test('guide genres fold case, decode &amp; and split on a slash', () => {
  assert.deepEqual(guideGenreKeysOf(['CRIME/LAW &amp; ORDER SERIES', 'News/Current Affairs']), ['crime', 'law & order series', 'news', 'current affairs'])
})

test('AU nibble table: 0xC comedy, 0xD drama, 0xE documentaries in Australia only, 0x8 politics everywhere', () => {
  assert.deepEqual(byteLabelOf({ genre: 0xc0, country: 'au' }), { format: 'comedy' })
  assert.deepEqual(byteLabelOf({ genre: 0xd0, country: 'au' }), { format: 'drama' })
  assert.deepEqual(byteLabelOf({ genre: 0xe0, country: 'au' }), { format: 'documentaries' })
  assert.deepEqual(byteLabelOf({ genre: 0xe0, country: 'gb' }), {})
  assert.deepEqual(byteLabelOf({ genre: 0x80, country: 'gb' }), { topic: 'politics' })
})

test('documentaries need a strong source; the TVmaze type alone is not one', () => {
  assert.equal(hasStrongDocumentaryEvidence({ wikidataGenres: ['documentary television series'] }), true)
  assert.equal(hasStrongDocumentaryEvidence({ guideGenres: ['Documentary'] }), true)
  assert.equal(hasStrongDocumentaryEvidence({ genre: 0xe0, country: 'au' }), true)
  assert.equal(hasStrongDocumentaryEvidence({ guideGenres: ['documentary & factual'] }), false)
  assert.equal(genreLabelsOf({ kind: 'factual', tvmazeType: 'Documentary' }).format, null)
})

test('exact genres: comedy beats a talk show or game show type, and crime genres make a crime drama', () => {
  assert.equal(genreLabelsOf({ kind: 'factual', tvmazeType: 'Talk Show', tvmazeGenres: ['Comedy'] }).format, 'comedy')
  assert.equal(genreLabelsOf({ kind: 'factual', tvmazeType: 'Talk Show' }).format, 'talk-shows')
  assert.equal(genreLabelsOf({ kind: 'fiction', tvmazeGenres: ['Comedy', 'Family'] }).format, 'comedy')
  assert.equal(genreLabelsOf({ kind: 'fiction', tvmazeGenres: ['Drama', 'Crime'] }).format, 'crime-drama')
  assert.equal(genreLabelsOf({ kind: 'fiction', wikidataGenres: ['sitcom'] }).format, 'comedy')
  assert.deepEqual(genreLabelsOf({ kind: 'fiction', tvmazeGenres: ['Drama', 'Medical'] }).topics, [])
  assert.deepEqual(genreLabelsOf({ kind: 'factual', tvmazeGenres: ['Nature', 'Medical'] }).topics, ['nature', 'medical'])
})

test('keyword rules: new categories and the narrowed Motoring rule', () => {
  const topicsOf = (title) => ruleLabelsOf({ kind: 'factual', title }).titleTopics
  assert.deepEqual(topicsOf('Medical Emergency'), ['medical'])
  assert.deepEqual(topicsOf('Gardening Australia'), ['gardening'])
  assert.deepEqual(topicsOf('Small Business Secrets'), ['business-and-money'])
  assert.deepEqual(topicsOf('Engineering Disasters'), ['engineering-and-machines'])
  assert.deepEqual(topicsOf('The UnXplained'), ['mystery-and-paranormal'])
  assert.deepEqual(topicsOf('Garage Sale Mystery'), [])
  assert.deepEqual(ruleLabelsOf({ kind: 'fiction', title: 'Kitchen Nightmares Sitcom' }).titleTopics, [])
  assert.equal(ruleLabelsOf({ kind: 'factual', title: 'The Morning Show' }).format, 'talk-shows')
  assert.equal(ruleLabelsOf({ kind: 'factual', title: '9News', guideGenres: ['news'] }).format, 'news')
  assert.equal(ruleLabelsOf({ kind: 'factual', title: 'Married at First Sight' }).formatFacet, 'reality-dating')
})

test('live events are awards, contests, ceremonies and concerts', () => {
  assert.equal(isLiveEventTitle('ARIA Awards 2026'), true)
  assert.equal(isLiveEventTitle('Eurovision Song Contest Asia'), true)
  assert.equal(isLiveEventTitle('Interview with the Vampire'), false)
})
