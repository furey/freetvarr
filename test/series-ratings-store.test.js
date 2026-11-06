import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-series-ratings-store-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db, setSetting } = await import('../src/db.js')
const { createSeriesRatings, hasSavedSeriesRatings, loadSeriesRatings, seriesRatingStamp } = await import('../src/series-ratings.js')

const NOW = Date.UTC(2026, 10, 6, 3)
const DAY = 24 * 60 * 60 * 1000

before(async () => {
  await db.migrate.latest()
  assert.equal(await hasSavedSeriesRatings(), false)
  await db('programme_ratings').insert([
    { lookup_key: 'tvmaze:series:the-newsreader', found_json: '{"score":8.4,"weight":95,"type":"Scripted","url":null}', expires_at: NOW - DAY },
    { lookup_key: 'tvmaze:series:ghosts', found_json: 'null', expires_at: NOW + DAY },
    { lookup_key: 'tmdb:movie:the-castle', found_json: '{"score":7.1}', expires_at: NOW + DAY },
  ])
})

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

test('expired ratings stay readable after a failed refresh, and misses are never shown', async () => {
  const asked = []
  const ratings = createSeriesRatings({
    searchShows: async (title) => { asked.push(title); throw new Error('timeout') },
    isEnabled: async () => true,
    countryOfZone: () => 'AU',
    now: () => NOW,
    sleep: async () => {},
  })
  const result = await ratings.run({ titles: ['The Newsreader', 'Ghosts'] })
  assert.deepEqual(asked, ['The Newsreader'])
  assert.equal(result.failed, 1)
  const saved = await loadSeriesRatings()
  assert.deepEqual([...saved.keys()], ['the-newsreader'])
  assert.equal(saved.get('the-newsreader').score, 8.4)
  assert.equal(Number((await seriesRatingStamp()).count), 1)
  assert.equal(await hasSavedSeriesRatings(), true)
})

test('with ratings turned off, no TVmaze score requests and no saved scores reach For you', async () => {
  await setSetting('ratings_lookup_enabled', 'false')
  const asked = []
  const ratings = createSeriesRatings({ searchShows: async (title) => { asked.push(title); return [] }, now: () => NOW, sleep: async () => {} })
  assert.equal((await ratings.run({ titles: ['Utopia'] })).skipped, true)
  assert.deepEqual(asked, [])
  assert.equal((await loadSeriesRatings()).size, 0)
  assert.deepEqual(await seriesRatingStamp(), { count: 0, latest: 0 })
  await setSetting('ratings_lookup_enabled', 'true')
  assert.equal((await loadSeriesRatings()).size, 1)
})
