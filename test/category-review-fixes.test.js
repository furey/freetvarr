import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-category-review-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')
const { createGenreEnrichment, isFilmAiring, rememberTvmazeShow } = await import('../src/genre-enrichment.js')
const { hasEpisodeDetails } = await import('../src/episode-details.js')
const { displayKindOf } = await import('../src/display-kind.js')

const HOUR = 60 * 60 * 1000
const FILM_RECORD = { genreTags: ['movie', 'movie-action'], genres: [], source: 'wikidata:Q1' }
const DIE_HARD_BLURB = 'A New York cop takes on a gang of thieves who seize a Los Angeles office tower on Christmas Eve.'

before(async () => {
  await db.migrate.latest()
})

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

test('a film description in the episode title is not an episode, so the film stays a film', () => {
  const dieHard = { title: 'Die Hard', episode_title: DIE_HARD_BLURB, start: 0, end: 2.5 * HOUR }
  assert.equal(hasEpisodeDetails(dieHard), false)
  assert.equal(isFilmAiring({ programme: dieHard, record: FILM_RECORD }), true)
  assert.equal(displayKindOf({ programme: dieHard, record: FILM_RECORD }), 'movie')
})

test('Interview with the Vampire, with real episode titles, stays a series', () => {
  const episode = { title: 'Interview with the Vampire', episode_title: 'No Pain', start: 0, end: HOUR }
  assert.equal(hasEpisodeDetails(episode), true)
  assert.equal(isFilmAiring({ programme: episode, record: FILM_RECORD }), false)
  assert.equal(displayKindOf({ programme: episode, record: FILM_RECORD }), 'series')
})

test('a film record beats the live event words, so Easter Parade stays a film', () => {
  const parade = { title: 'Easter Parade', start: 0, end: 2 * HOUR }
  assert.equal(isFilmAiring({ programme: parade, record: FILM_RECORD }), true)
  assert.equal(isFilmAiring({ programme: { ...parade, title: 'Mardi Gras Parade' } }), false)
})

test('a Wikidata outage stops Wikidata after five failures in a row, keeps TVmaze going, and marks the rows to retry later', async () => {
  let wikidataCalls = 0
  const writes = []
  const enrichment = createGenreEnrichment({
    searchTvmaze: async (title) => [{ show: { id: 1, name: title, genres: ['Drama'], type: 'Scripted' } }],
    searchWikidata: async () => {
      wikidataCalls += 1
      throw new Error('Wikidata timed out')
    },
    cache: { freshKeys: async () => new Set(), write: async (row) => writes.push(row) },
    isEnabled: async () => true,
    now: () => 0,
    sleep: async () => {},
  })
  const result = await enrichment.run({ titles: Array.from({ length: 12 }, (_, i) => ({ title: `Show ${i}` })) })
  assert.equal(wikidataCalls, 5)
  assert.equal(result.looked, 12)
  assert.equal(writes.length, 12)
  assert.ok(writes.every((row) => row.genres.includes('lookup:partial') && !row.genres.includes('lookup:2')))
  assert.ok(writes.every((row) => row.expiresAt === 7 * 24 * HOUR))
})

test('a title TVmaze misses while Wikidata fails gets no negative cache entry', async () => {
  const writes = []
  const enrichment = createGenreEnrichment({
    searchTvmaze: async () => [],
    searchWikidata: async () => {
      throw new Error('Wikidata HTTP 503')
    },
    cache: { freshKeys: async () => new Set(), write: async (row) => writes.push(row) },
    isEnabled: async () => true,
    now: () => 0,
    sleep: async () => {},
  })
  await enrichment.run({ titles: [{ title: 'Unknown Show' }] })
  assert.deepEqual(writes, [])
})

test('a TVmaze show seen in the guide keeps the Wikidata, country and lookup tokens of the record', async () => {
  await db('title_genres').insert({
    title_key: 'upstart-crow',
    genres_json: JSON.stringify(['Comedy', 'type:Scripted', 'wd:sitcom', 'country:GB', 'lookup:2']),
    categories_json: '["comedy"]',
    source: 'tvmaze:7',
    expires_at: 1,
  })
  await rememberTvmazeShow({ title: 'Upstart Crow', show: { id: 7, name: 'Upstart Crow', genres: ['Comedy', 'History'], type: 'Scripted' }, nowMs: 0 })
  const row = await db('title_genres').where({ title_key: 'upstart-crow' }).first()
  assert.deepEqual(JSON.parse(row.genres_json), ['Comedy', 'History', 'type:Scripted', 'wd:sitcom', 'country:GB', 'lookup:2'])
})
