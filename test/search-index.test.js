import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildSearchIndex, initialsOf, isInitialsQuery, searchIndex, typoDistance } from '../src/web/search-index.js'
import { foldText, normaliseSearchText, withoutRegionWords } from '../src/web/search-text.js'
import { showKeyOf } from '../src/web/show-key.js'

const curated = JSON.parse(fs.readFileSync(new URL('../src/data/show-aliases.json', import.meta.url)))
const guideTitles = JSON.parse(fs.readFileSync(new URL('./fixtures/guide-titles.json', import.meta.url)))

const entriesOf = (titles) => titles.map((title) => (typeof title === 'string' ? { title } : title))
  .map((entry) => ({ key: showKeyOf(entry.title), ...entry }))

const search = ({ titles, query, aliases = [], limit }) => searchIndex({
  index: buildSearchIndex({ entries: entriesOf(titles), curated, aliases }),
  query,
  limit,
})

const titlesOf = (matches) => matches.map((match) => match.entry.title)

test('normaliseSearchText: folds accents, treats & + and alike, drops punctuation', () => {
  assert.equal(normaliseSearchText('Café Sydney'), 'cafe sydney')
  assert.equal(normaliseSearchText('Law & Order: SVU'), 'law and order svu')
  assert.equal(normaliseSearchText('Q+A'), normaliseSearchText('Q and A'))
  assert.equal(normaliseSearchText("James Martin's Spanish Adventure"), 'james martins spanish adventure')
  assert.equal(foldText('Grüen'), 'gruen')
  assert.equal(withoutRegionWords('gogglebox au'), 'gogglebox')
})

test('title words starting with the query score 100', () => {
  const [match] = search({ titles: ['My Kitchen Rules', 'Kitchen Cabinet'], query: 'kitchen ru' })
  assert.deepEqual([match.entry.title, match.score, match.reason], ['My Kitchen Rules', 100, 'title'])
})

test('a substring inside a word scores 90, with AU and Australia stripped from the query', () => {
  assert.deepEqual(search({ titles: ['Rainbow Ruby'], query: 'bow' }).map((m) => [m.score, m.reason]), [[90, 'contains']])
  const [goggle] = search({ titles: ['Gogglebox Australia'], query: 'ogglebox AU' })
  assert.deepEqual([goggle.entry.title, goggle.score], ['Gogglebox Australia', 90])
  const [survivor] = search({ titles: ['Australian Survivor'], query: 'Survivor Australia' })
  assert.deepEqual([survivor.entry.title, survivor.matchedName], ['Australian Survivor', 'Survivor Australia'])
})

test('café finds Cafe and & finds and', () => {
  assert.deepEqual(titlesOf(search({ titles: ['Cafe Sydney', 'Sydney Weekender'], query: 'café' })), ['Cafe Sydney'])
  assert.deepEqual(titlesOf(search({ titles: ['Café Sydney'], query: 'cafe' })), ['Café Sydney'])
  assert.deepEqual(titlesOf(search({ titles: ['Law & Order', 'Lawless'], query: 'law and order' })), ['Law & Order'])
  assert.deepEqual(titlesOf(search({ titles: ['Mittens and Pants'], query: 'mittens & pants' })), ['Mittens and Pants'])
})

test('curated aliases: MKR finds My Kitchen Rules first and names the alias', () => {
  const matches = search({ titles: guideTitles, query: 'MKR' })
  assert.equal(matches[0].entry.title, 'My Kitchen Rules')
  assert.equal(matches[0].reason, 'alias')
  assert.equal(matches[0].matchedName, 'MKR')
})

test('curated aliases: an exact nickname outranks words that merely start with it', () => {
  const matches = search({ titles: guideTitles, query: 'ACA' })
  assert.equal(matches[0].entry.title, 'A Current Affair')
  assert.ok(matches.slice(1).some((match) => match.entry.title === 'Dream Academy'))
})

test('curated aliases: a region in brackets matches the title with or without it', () => {
  assert.equal(search({ titles: ['Married At First Sight'], query: 'MAFS' })[0]?.matchedName, 'MAFS')
  assert.equal(search({ titles: ['Married At First Sight Australia'], query: 'mafs' })[0]?.matchedName, 'MAFS')
  assert.ok(search({ titles: ['Married At First Sight UK'], query: 'mafs' }).every((match) => match.reason !== 'alias'))
})

test('user nicknames score 85 and known-as names score 80', () => {
  const aliases = [
    { key: 'the-front-bar', name: 'Footy bar', source: 'user' },
    { key: 'the-front-bar', name: 'Front bar footy', source: 'tvmaze' },
    { key: 'landline', name: 'Country hour', source: 'tvmaze' },
  ]
  const matches = search({ titles: ['The Front Bar', 'Landline'], query: 'footy', aliases })
  assert.deepEqual(matches.map((m) => [m.entry.title, m.score, m.reason, m.matchedName]), [['The Front Bar', 85, 'yours', 'Footy bar']])
  const [landline] = search({ titles: ['The Front Bar', 'Landline'], query: 'country', aliases })
  assert.deepEqual([landline.score, landline.reason], [80, 'known-as'])
})

test('initials: AFL puts AFLW above A Football Life', () => {
  const matches = search({ titles: guideTitles, query: 'AFL' })
  assert.deepEqual(titlesOf(matches).slice(0, 2), ['AFLW', 'A Football Life'])
  assert.equal(matches[1].reason, 'initials')
  assert.equal(matches[1].score, 70)
})

test('initials: SAS does not put Spicks and Specks first when SAS Australia is there', () => {
  const matches = search({ titles: ['Spicks and Specks', 'SAS Australia', 'Sea Patrol'], query: 'SAS' })
  assert.equal(matches[0].entry.title, 'SAS Australia')
  assert.equal(matches[1].entry.title, 'Spicks and Specks')
  assert.equal(matches[1].reason, 'initials')
})

test('initials: only for single words of three or more letters, only below three hits, at most three', () => {
  assert.equal(isInitialsQuery('MKR'), true)
  assert.equal(isInitialsQuery('MK'), false)
  assert.equal(isInitialsQuery('M K R'), false)
  assert.deepEqual(initialsOf('NCIS: Los Angeles'), ['NLA', 'NCISLA'])
  assert.ok(initialsOf('Gogglebox Australia').every((variant) => variant !== 'G'))
  const many = ['Big Brown Bear', 'Big Blue Boat', 'Bad Bold Bat', 'Brave Busy Bee', 'Bright Bay Ball']
  assert.equal(search({ titles: many, query: 'BBB' }).length, 3)
  const withHits = ['Bbb One', 'Bbb Two', 'Bbb Three', 'Big Brown Bear']
  assert.deepEqual(search({ titles: withHits, query: 'BBB' }).map((m) => m.reason), ['title', 'title', 'title'])
})

test('fuzzy: Gogglbox suggests Gogglebox Australia only when nothing else matched', () => {
  const matches = search({ titles: guideTitles, query: 'Gogglbox' })
  assert.equal(matches[0].entry.title, 'Gogglebox Australia')
  assert.equal(matches[0].reason, 'fuzzy')
  assert.ok(matches[0].score > 36 && matches[0].score < 60)
  assert.ok(matches.length <= 3)
  assert.ok(search({ titles: guideTitles, query: 'Gogglebox' }).every((m) => m.reason !== 'fuzzy'))
})

test('fuzzy: word typos within one edit for 4–5 letters and two for 6 or more', () => {
  assert.equal(typoDistance('theroy', 'theory'), 1)
  assert.equal(search({ titles: guideTitles, query: 'Big Bang Theroy' })[0]?.entry.title, 'The Big Bang Theory')
  assert.equal(search({ titles: guideTitles, query: 'My Kitchin Rules' })[0]?.entry.title, 'My Kitchen Rules')
  assert.deepEqual(search({ titles: guideTitles, query: 'zzxqv' }), [])
})

test('ties: airing soon first, then more recordings', () => {
  const titles = [
    { title: 'Bluey Minisodes', recordingCount: 9 },
    { title: 'Bluey', nextStart: 2000 },
    { title: 'Bluey Shorts', nextStart: 1000 },
  ]
  assert.deepEqual(titlesOf(search({ titles, query: 'bluey' })), ['Bluey Shorts', 'Bluey', 'Bluey Minisodes'])
  const recorded = [{ title: 'Bluey Minisodes', recordingCount: 1 }, { title: 'Bluey', recordingCount: 4 }]
  assert.deepEqual(titlesOf(search({ titles: recorded, query: 'bluey' })), ['Bluey', 'Bluey Minisodes'])
})

test('limit caps the ranked results', () => {
  assert.equal(search({ titles: guideTitles, query: 'news', limit: 5 }).length, 5)
})

test('performance: index build under 20 ms for 2,000 titles and queries under 2 ms', () => {
  const titles = [...guideTitles, ...guideTitles.slice(0, 2000 - guideTitles.length).map((title) => `${title} Extra`)]
  const entries = entriesOf(titles)
  buildSearchIndex({ entries, curated })
  const builds = Array.from({ length: 25 }, () => {
    const started = performance.now()
    buildSearchIndex({ entries, curated })
    return performance.now() - started
  })
  const index = buildSearchIndex({ entries, curated })
  const queries = ['MKR', 'Gogglbox', 'AFL', 'SAS', 'kitchen', 'law and order', 'Big Bang Theroy', 'news', 'ab', 'zzxqv']
  queries.forEach((query) => searchIndex({ index, query }))
  const started = performance.now()
  const rounds = 20
  for (let round = 0; round < rounds; round += 1) queries.forEach((query) => searchIndex({ index, query }))
  const perQuery = (performance.now() - started) / (rounds * queries.length)
  assert.ok(Math.min(...builds) < 20, `build took ${Math.min(...builds).toFixed(1)} ms`)
  assert.ok(perQuery < 2, `query took ${perQuery.toFixed(2)} ms`)
})
