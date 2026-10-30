import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nicknameFrom, showCatalogueOf } from '../src/search-aliases.js'

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
