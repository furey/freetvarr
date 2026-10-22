import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import express from 'express'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-programme-kind-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')
const {
  kindOverrideFrom,
  libraryKindWith,
  loadKindOverrides,
  mountProgrammeKindRoutes,
  showKeyFrom,
  withKindOverrides,
} = await import('../src/programme-kind.js')
const { isFilmAiring, loadTitleGenres, movieChoiceOf } = await import('../src/genre-enrichment.js')
const { kindOf } = await import('../src/library.js')

const MINUTE_MS = 60_000
const passThrough = (req, res, next) => next()
const changes = []
let appServer
let baseUrl

const call = async (method, url, body) => {
  const res = await fetch(`${baseUrl}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

const airing = ({ minutes, ...rest }) => ({
  title: 'Heron', genre: null, series_no: null, episode_no: null, episode_title: null, start: 0, end: minutes * MINUTE_MS, ...rest,
})

before(async () => {
  await db.migrate.latest()
  const app = express()
  app.use(express.json())
  mountProgrammeKindRoutes({ app, csrf: passThrough, onChange: () => changes.push(Date.now()) })
  appServer = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => appServer.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${appServer.address().port}`
})

after(async () => {
  appServer?.close()
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

test('showKeyFrom: accepts show keys only', () => {
  assert.equal(showKeyFrom('alick-albert'), 'alick-albert')
  assert.equal(showKeyFrom('Alick'), null)
  assert.equal(showKeyFrom('-alick'), null)
  assert.equal(showKeyFrom('alick--albert'), null)
  assert.equal(showKeyFrom('a'.repeat(201)), null)
  assert.equal(showKeyFrom(''), null)
})

test('kindOverrideFrom: accepts movie or not-movie', () => {
  assert.equal(kindOverrideFrom({ kind: 'movie' }), 'movie')
  assert.equal(kindOverrideFrom({ kind: 'not-movie' }), 'not-movie')
  assert.equal(kindOverrideFrom({ kind: 'series' }), null)
  assert.equal(kindOverrideFrom(undefined), null)
})

test('withKindOverrides: adds the override to known records and creates bare ones', () => {
  const merged = withKindOverrides({
    records: new Map([['heron', { categories: ['drama'], genres: [], source: 'wikidata:Q1' }]]),
    overrides: new Map([['heron', 'movie'], ['alick-albert', 'not-movie']]),
  })
  assert.deepEqual(merged.get('heron'), { categories: ['drama'], genres: [], source: 'wikidata:Q1', kindOverride: 'movie' })
  assert.deepEqual(merged.get('alick-albert'), { categories: [], genres: [], source: null, kindOverride: 'not-movie' })
})

test('isFilmAiring: an override wins over records, genres, and airing counts', () => {
  const long = airing({ minutes: 100 })
  assert.equal(isFilmAiring({ programme: long, airingsInWeek: 5, record: { kindOverride: 'movie' } }), true)
  assert.equal(isFilmAiring({ programme: long, record: { categories: ['movie'], kindOverride: 'not-movie' } }), false)
  assert.equal(isFilmAiring({ programme: airing({ minutes: 100, genre: 0x10 }), record: { kindOverride: 'not-movie' } }), false)
})

test('movieChoiceOf: offers Not a movie on films and This is a movie on long one-offs, never on episodes', () => {
  assert.equal(movieChoiceOf({ programme: airing({ minutes: 100 }), film: true }), 'not-movie')
  assert.equal(movieChoiceOf({ programme: airing({ minutes: 100, genre: 0x40 }), film: true }), 'not-movie')
  assert.equal(movieChoiceOf({ programme: airing({ minutes: 100 }), film: false }), 'movie')
  assert.equal(movieChoiceOf({ programme: airing({ minutes: 100, episode_no: 3 }), film: true }), null)
  assert.equal(movieChoiceOf({ programme: airing({ minutes: 60 }), film: false }), null)
  assert.equal(movieChoiceOf({ programme: airing({ minutes: 100, episode_title: 'Part 1' }), film: false }), null)
  assert.equal(movieChoiceOf({ programme: airing({ minutes: 100, series_no: 2 }), film: false }), null)
  assert.equal(movieChoiceOf({ programme: airing({ minutes: 100, genre: 0x40 }), film: false }), null)
  assert.equal(movieChoiceOf({ programme: airing({ minutes: 100, title: 'Seven News' }), film: false }), null)
})

test('libraryKindWith and kindOf: the Movies shelf follows the override', () => {
  assert.equal(libraryKindWith({ kind: 'movie', override: 'not-movie' }), 'oneoff')
  assert.equal(libraryKindWith({ kind: 'show', override: 'not-movie' }), 'show')
  assert.equal(libraryKindWith({ kind: 'oneoff', override: 'movie' }), 'movie')
  assert.equal(libraryKindWith({ kind: 'oneoff', override: null }), 'oneoff')
  const film = { status: 'done', season: null, episode: null, duration_s: 6000, file_path: '/movies/Heron/Heron.ts' }
  assert.equal(kindOf({ rows: [film], moviesRoot: '/movies' }), 'movie')
  assert.equal(kindOf({ rows: [film], moviesRoot: '/movies', override: 'not-movie' }), 'oneoff')
  assert.equal(kindOf({ rows: [film, film], override: 'movie' }), 'movie')
})

test('PUT and DELETE /api/programme-kind/:showKey store and clear the override', async () => {
  changes.length = 0
  assert.equal((await call('PUT', '/api/programme-kind/alick-albert', { kind: 'not-movie' })).status, 200)
  assert.deepEqual([...(await loadKindOverrides())], [['alick-albert', 'not-movie']])
  assert.equal((await loadTitleGenres()).get('alick-albert').kindOverride, 'not-movie')
  assert.deepEqual((await call('PUT', '/api/programme-kind/alick-albert', { kind: 'movie' })).body, { ok: true, showKey: 'alick-albert', kind: 'movie' })
  assert.deepEqual([...(await loadKindOverrides())], [['alick-albert', 'movie']])
  assert.equal((await call('DELETE', '/api/programme-kind/alick-albert')).status, 200)
  assert.equal((await loadKindOverrides()).size, 0)
  assert.equal((await call('DELETE', '/api/programme-kind/alick-albert')).status, 200)
  assert.equal(changes.length, 3)
})

test('PUT and DELETE /api/programme-kind reject bad keys and kinds', async () => {
  assert.equal((await call('PUT', '/api/programme-kind/Alick%20Albert', { kind: 'movie' })).status, 400)
  assert.equal((await call('PUT', '/api/programme-kind/alick-albert', { kind: 'series' })).status, 400)
  assert.equal((await call('PUT', '/api/programme-kind/alick-albert', {})).status, 400)
  assert.equal((await call('DELETE', '/api/programme-kind/..%2Fsettings')).status, 400)
  assert.equal((await loadKindOverrides()).size, 0)
})
