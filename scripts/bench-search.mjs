import fs from 'node:fs'
import { buildSearchIndex, searchIndex } from '../src/web/search-index.js'

const curated = JSON.parse(fs.readFileSync(new URL('../src/data/show-aliases.json', import.meta.url)))
const guideTitles = JSON.parse(fs.readFileSync(new URL('../test/fixtures/guide-titles.json', import.meta.url)))
const TITLE_COUNT = 2000
const BUILD_RUNS = 25
const QUERY_ROUNDS = 20
const QUERIES = ['MKR', 'Gogglbox', 'AFL', 'SAS', 'kitchen', 'law and order', 'Big Bang Theroy', 'news', 'ab', 'zzxqv']

const titles = [...guideTitles, ...guideTitles.slice(0, TITLE_COUNT - guideTitles.length).map((title) => `${title} Extra`)]
const entries = titles.map((title) => (typeof title === 'string' ? { title } : title))

const timeMs = (run) => {
  const started = performance.now()
  run()
  return performance.now() - started
}

buildSearchIndex({ entries, curated })
const builds = Array.from({ length: BUILD_RUNS }, () => timeMs(() => buildSearchIndex({ entries, curated })))
const index = buildSearchIndex({ entries, curated })
QUERIES.forEach((query) => searchIndex({ index, query }))
const queryTotal = timeMs(() => {
  for (let round = 0; round < QUERY_ROUNDS; round += 1) QUERIES.forEach((query) => searchIndex({ index, query }))
})

console.log(`build (best of ${BUILD_RUNS}): ${Math.min(...builds).toFixed(1)} ms for ${titles.length} titles`)
console.log(`query: ${(queryTotal / (QUERY_ROUNDS * QUERIES.length)).toFixed(2)} ms each`)
