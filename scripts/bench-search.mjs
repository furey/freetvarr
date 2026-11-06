import fs from 'node:fs'
import { buildSearchIndex, searchIndex } from '../src/web/search-index.js'
import { buildGuideSearch, searchGuideListings } from '../src/guide-search.js'

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

const HOUR_MS = 60 * 60 * 1000
const GUIDE_CHANNELS = 60
const AIRINGS_PER_CHANNEL = 300
const guideNow = Date.now()
const guideChannels = Array.from({ length: GUIDE_CHANNELS }, (_, i) => ({ id: `c${i}`, epgId: i, name: `Channel ${i}` }))
const programsByChannel = Object.fromEntries(guideChannels.map((channel, c) => [channel.epgId,
  Array.from({ length: AIRINGS_PER_CHANNEL }, (_, a) => {
    const start = guideNow + a * 0.5 * HOUR_MS
    return {
      title: titles[(c * 31 + a) % titles.length],
      program_id: c * AIRINGS_PER_CHANNEL + a,
      start,
      end: start + 0.5 * HOUR_MS,
      series_link: a % 7 === 0 ? `link${a % 40}` : null,
      dvr_uuid: a % 53 === 0 ? `dvr${a}` : null,
    }
  })]))
const built = buildGuideSearch({ guide: { programsByChannel }, curated })
const seriesLinks = new Set(Array.from({ length: 40 }, (_, i) => `link${i}`))
const forYouIds = new Set(Array.from({ length: 60 }, (_, i) => String(i * 97)))
const GUIDE_QUERIES = ['big', 'chase', 'news', 'the', 'mas', 'kitchen']
const runGuideQueries = () => GUIDE_QUERIES.forEach((query) => searchGuideListings({ built, channels: guideChannels, query, nowMs: guideNow, seriesLinks, forYouIds }))
runGuideQueries()
const GUIDE_ROUNDS = 20
const guideTotal = timeMs(() => { for (let round = 0; round < GUIDE_ROUNDS; round += 1) runGuideQueries() })
console.log(`guide search: ${(guideTotal / (GUIDE_ROUNDS * GUIDE_QUERIES.length)).toFixed(2)} ms each over ${GUIDE_CHANNELS * AIRINGS_PER_CHANNEL} airings`)
