import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createKnownAs, isLatinName, knownNamesOf, tvmazeNamesOf, wikidataAliasQueryOf, wikidataNamesOf } from '../src/known-as.js'

test('tvmazeNamesOf keeps Latin-script akas only', () => {
  const akas = [
    { name: 'MKR', country: { code: 'AU' } },
    { name: 'Мои кухонные правила', country: { code: 'RU' } },
    { name: 'Cuisine à la française', country: null },
    { name: '我的厨房规则', country: { code: 'CN' } },
  ]
  assert.deepEqual(tvmazeNamesOf(akas), ['MKR', 'Cuisine à la française'])
  assert.equal(isLatinName('7.30'), false)
  assert.deepEqual(tvmazeNamesOf(null), [])
})

test('wikidataNamesOf keeps English aliases for English-speaking or unknown countries', () => {
  const binding = (alias, lang, country) => ({
    alias: { value: alias, 'xml:lang': lang },
    ...(country ? { country: { value: `http://www.wikidata.org/entity/${country}` } } : {}),
  })
  assert.deepEqual(wikidataNamesOf({ results: { bindings: [binding('Crocodile Dundee 1', 'en', 'Q408')] } }), ['Crocodile Dundee 1'])
  assert.deepEqual(wikidataNamesOf({ results: { bindings: [binding('Amelie', 'en', 'Q142'), binding('Amélie AU', 'en-au', 'Q142')] } }), ['Amélie AU'])
  assert.deepEqual(wikidataNamesOf({ results: { bindings: [binding('Untitled film', 'en')] } }), ['Untitled film'])
  assert.match(wikidataAliasQueryOf('Q42'), /wd:Q42 skos:altLabel/)
})

test('knownNamesOf drops the title itself, duplicates, and long names', () => {
  assert.deepEqual(knownNamesOf({ title: 'My Kitchen Rules', names: ['my kitchen rules', 'MKR', 'mkr', ' My  Kitchen ', 'x'.repeat(90)] }), ['MKR', 'My Kitchen'])
})

test('createKnownAs caches per show, spaces requests, and reports new names', async () => {
  const written = []
  const fresh = new Set()
  let fetches = 0
  let changes = 0
  const sleeps = []
  const knownAs = createKnownAs({
    fetchAkas: async () => { fetches += 1; return [{ name: 'MKR' }] },
    queryWikidata: async () => ({ results: { bindings: [{ alias: { value: 'Mad Max 1', 'xml:lang': 'en' } }] } }),
    cache: {
      isFresh: async ({ key }) => fresh.has(key),
      write: async (row) => { written.push(row); fresh.add(row.key) },
    },
    onChange: () => { changes += 1 },
    now: () => 1000,
    sleep: async (ms) => { sleeps.push(ms) },
  })
  await knownAs.fromTvmazeShow({ title: 'My Kitchen Rules', show: { id: 7 } })
  await knownAs.fromTvmazeShow({ title: 'My Kitchen Rules', show: { id: 7 } })
  await knownAs.fromWikidataFilm({ title: 'Mad Max', id: 'Q1' })
  assert.equal(fetches, 1)
  assert.equal(changes, 2)
  assert.deepEqual(written.map((row) => [row.key, row.names, row.source]), [
    ['my-kitchen-rules', ['MKR'], 'tvmaze:7'],
    ['mad-max', ['Mad Max 1'], 'wikidata:Q1'],
  ])
  assert.equal(written[0].expiresAt, 1000 + 30 * 24 * 60 * 60 * 1000)
  assert.deepEqual(sleeps, [700, 700])
  assert.equal(await knownAs.fromWikidataFilm({ title: 'Bad id', id: 'nope' }), false)
})
