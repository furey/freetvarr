import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nicknameFrom, searchCatalogueOf, showCatalogueOf } from '../src/search-aliases.js'

test('nicknameFrom trims, limits length, and needs two searchable characters', () => {
  assert.deepEqual(nicknameFrom('  MKR '), { name: 'MKR', nameKey: 'mkr' })
  assert.deepEqual(nicknameFrom('Q&A'), { name: 'Q&A', nameKey: 'q and a' })
  assert.equal(nicknameFrom('!'), null)
  assert.equal(nicknameFrom(''), null)
  assert.equal(nicknameFrom('x'.repeat(61)), null)
})

test('showCatalogueOf merges titles that share a show key', () => {
  assert.deepEqual(showCatalogueOf([
    { title: 'Spicks and Specks', count: 3 },
    { title: 'Spicks And Specks', count: 2 },
    { title: 'Gruen', count: 1 },
    { title: null, count: 4 },
  ]), [
    { key: 'spicks-and-specks', title: 'Spicks and Specks', recordingCount: 5 },
    { key: 'gruen', title: 'Gruen', recordingCount: 1 },
  ])
})

test('searchCatalogueOf adds library films, one-offs, and series that have no recordings row', () => {
  const libraryShows = [
    { key: 'ali-g-who-iz-i', title: 'Ali G: Who Iz I?', kind: 'movie', counts: { total: 1 } },
    { key: 'carols-in-the-domain', title: 'Carols in the Domain', kind: 'oneoff', counts: { total: 1 } },
    { key: 'dexter-resurrection', title: 'Dexter: Resurrection', kind: 'show', counts: { total: 4 } },
  ]
  assert.deepEqual(searchCatalogueOf({ rows: [{ title: 'Gruen', count: 2 }], libraryShows }), [
    { key: 'gruen', title: 'Gruen', recordingCount: 2 },
    { key: 'ali-g-who-iz-i', title: 'Ali G: Who Iz I?', recordingCount: 1, kind: 'movie' },
    { key: 'carols-in-the-domain', title: 'Carols in the Domain', recordingCount: 1, kind: 'oneoff' },
    { key: 'dexter-resurrection', title: 'Dexter: Resurrection', recordingCount: 4 },
  ])
})

test('searchCatalogueOf keeps one entry per show key and the larger recording count', () => {
  const libraryShows = [{ key: 'big-brother', title: 'Big Brother', kind: 'show', counts: { total: 20 } }]
  assert.deepEqual(searchCatalogueOf({ rows: [{ title: 'Big Brother', count: 23 }], libraryShows }), [
    { key: 'big-brother', title: 'Big Brother', recordingCount: 23 },
  ])
})

test('searchCatalogueOf leaves out library entries that are only scheduled, because the guide search lists those', () => {
  const libraryShows = [{ key: 'wallace-gromit', title: 'Wallace & Gromit', kind: 'movie', counts: { total: 0 } }]
  assert.deepEqual(searchCatalogueOf({ libraryShows }), [])
})
