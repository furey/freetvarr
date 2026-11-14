import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import express from 'express'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-category-overrides-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')
const { categoryOverrideFrom, loadCategoryOverrides, mountCategoryOverrideRoutes, showCategoriesOf, withCategoryOverrides } = await import('../src/for-you-category-overrides.js')
const { createCategoryIndex } = await import('../src/for-you-categories.js')
const { loadTitleGenres } = await import('../src/genre-enrichment.js')
const { canSaveCategoriesOf, categoriesPathOf, originLineOf, toggledTopicsOf } = await import('../src/web/category-override.js')

const index = createCategoryIndex({ country: 'au' })
const changes = []
const tastes = new Map()
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

before(async () => {
  await db.migrate.latest()
  await db('title_genres').insert({
    title_key: 'bay-life',
    categories_json: JSON.stringify(['drama']),
    genres_json: JSON.stringify(['Drama', 'type:Scripted', 'country:AU', 'lookup:2']),
    source: 'tvmaze:1',
    expires_at: Date.now() + 60_000,
  })
  const app = express()
  app.use(express.json())
  mountCategoryOverrideRoutes({
    app,
    csrf: (req, res, next) => next(),
    onChange: () => changes.push(Date.now()),
    country: () => 'au',
    tasteTitleOf: async (showKey) => tastes.get(showKey) ?? null,
  })
  appServer = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => appServer.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${appServer.address().port}`
})

after(async () => {
  appServer?.close()
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

test('categoryOverrideFrom: accepts catalogue keys, at most two topics, and at least one label', () => {
  assert.deepEqual(categoryOverrideFrom({ body: { format: 'soaps', topics: ['dating'] }, index }), { override: { format: 'soaps', topics: ['dating'] } })
  assert.deepEqual(categoryOverrideFrom({ body: { format: null, topics: ['cooking', 'cooking'] }, index }), { override: { format: null, topics: ['cooking'] } })
  assert.match(categoryOverrideFrom({ body: { format: 'westerns' }, index }).error, /format/)
  assert.match(categoryOverrideFrom({ body: { topics: ['afl'] }, index }).error, /topic keys/)
  assert.match(categoryOverrideFrom({ body: { topics: ['shopping'] }, index }).error, /topic keys/)
  assert.match(categoryOverrideFrom({ body: { topics: 'cooking' }, index }).error, /topic keys/)
  assert.match(categoryOverrideFrom({ body: { topics: ['cooking', 'travel', 'history'] }, index }).error, /at most 2/)
  assert.match(categoryOverrideFrom({ body: { format: null, topics: [] }, index }).error, /format or a topic/)
})

test('choices: every format, and topics without sport codes or rowless topics', () => {
  const { choices } = showCategoriesOf({ showKey: 'x', index })
  const formats = choices.formats.map((choice) => choice.key)
  for (const key of ['soaps', 'panel-shows', 'lifestyle', 'sci-fi-fantasy', 'kids', 'news']) assert.ok(formats.includes(key), key)
  const topics = choices.topics.map((choice) => choice.key)
  assert.ok(topics.includes('dating'))
  assert.ok(topics.includes('motoring'))
  assert.ok(!topics.some((key) => ['afl', 'other-sport', 'shopping', 'religion', 'hobbies'].includes(key)))
  assert.equal(choices.topics.find((choice) => choice.key === 'health-and-lifestyle').title, 'Health')
  assert.equal(choices.topics.find((choice) => choice.key === 'local-life').title, 'Life in Australia')
})

test('GET: automatic labels from the taste, or from the stored record, with the origin and its source', async () => {
  tastes.set('quiet-quiz', { categories: [{ key: 'cooking' }, { key: 'quiz' }] })
  const fromTaste = await call('GET', '/api/for-you/categories/show/quiet-quiz')
  assert.equal(fromTaste.status, 200)
  assert.deepEqual([fromTaste.body.format, fromTaste.body.topics, fromTaste.body.custom], ['quiz', ['cooking'], false])
  assert.equal(fromTaste.body.origin, null)
  const fromRecord = await call('GET', '/api/for-you/categories/show/bay-life?title=Bay%20Life')
  assert.deepEqual([fromRecord.body.format, fromRecord.body.topics], ['drama', []])
  assert.deepEqual(fromRecord.body.origin, { code: 'au', name: 'Australia', source: 'TVmaze' })
  const listed = await call('GET', '/api/for-you/categories/show/shark-tank?title=Shark%20Tank')
  assert.deepEqual(listed.body.origin, { code: 'us', name: 'the United States', source: 'built-in list' })
  assert.equal((await call('GET', '/api/for-you/categories/show/Bad%20Key')).status, 400)
})

test('PUT: saves the override, clears the For you cache, and rejects bad keys', async () => {
  const before = changes.length
  const saved = await call('PUT', '/api/for-you/categories/show/bay-life', { title: 'Bay Life', format: 'soaps', topics: ['dating', 'travel'] })
  assert.equal(saved.status, 200)
  assert.deepEqual([saved.body.format, saved.body.topics, saved.body.custom], ['soaps', ['dating', 'travel'], true])
  assert.equal(changes.length, before + 1)
  const row = await db('programme_category_overrides').where({ show_key: 'bay-life' }).first()
  assert.deepEqual([row.format, JSON.parse(row.topics_json)], ['soaps', ['dating', 'travel']])
  const again = await call('PUT', '/api/for-you/categories/show/bay-life', { format: null, topics: ['history'] })
  assert.deepEqual([again.body.format, again.body.topics], [null, ['history']])
  assert.equal((await call('PUT', '/api/for-you/categories/show/bay-life', { topics: ['a', 'b', 'c'] })).status, 400)
  assert.equal((await call('PUT', '/api/for-you/categories/show/bay-life', { format: 'westerns' })).status, 400)
  assert.equal((await call('PUT', '/api/for-you/categories/show/Bad%20Key', { format: 'soaps' })).status, 400)
  assert.equal(changes.length, before + 2)
})

test('the saved override reaches loadTitleGenres, and a custom taste is not read as automatic', async () => {
  await call('PUT', '/api/for-you/categories/show/bay-life', { format: 'soaps', topics: [] })
  const records = await loadTitleGenres()
  assert.deepEqual(records.get('bay-life').categoryOverride, { format: 'soaps', topics: [] })
  assert.equal(records.get('bay-life').source, 'tvmaze:1')
  assert.deepEqual((await loadCategoryOverrides()).get('bay-life'), { format: 'soaps', topics: [] })
  tastes.set('bay-life', { categories: [{ key: 'soaps' }], custom: true })
  const removed = await call('DELETE', '/api/for-you/categories/show/bay-life?title=Bay%20Life')
  assert.equal(removed.status, 200)
  assert.deepEqual([removed.body.format, removed.body.custom], ['drama', false])
  assert.equal(await db('programme_category_overrides').where({ show_key: 'bay-life' }).first(), undefined)
  assert.equal((await loadTitleGenres()).get('bay-life').categoryOverride, undefined)
})

test('DELETE: clears the cache only when an override was removed', async () => {
  const before = changes.length
  await call('PUT', '/api/for-you/categories/show/quiet-show', { format: 'lifestyle', topics: [] })
  assert.equal((await call('DELETE', '/api/for-you/categories/show/quiet-show')).status, 200)
  assert.equal((await call('DELETE', '/api/for-you/categories/show/quiet-show')).status, 200)
  assert.equal(changes.length, before + 2)
  assert.equal((await call('DELETE', '/api/for-you/categories/show/Bad%20Key')).status, 400)
})

test('withCategoryOverrides: adds the override to known records and creates bare ones', () => {
  const merged = withCategoryOverrides({
    records: new Map([['known', { genreTags: ['drama'], genres: ['Drama'], source: 'tvmaze:2' }]]),
    overrides: new Map([['known', { format: 'soaps', topics: [] }], ['bare', { format: null, topics: ['dating'] }]]),
  })
  assert.deepEqual(merged.get('known'), { genreTags: ['drama'], genres: ['Drama'], source: 'tvmaze:2', categoryOverride: { format: 'soaps', topics: [] } })
  assert.deepEqual(merged.get('bare'), { genreTags: [], genres: [], source: null, categoryOverride: { format: null, topics: ['dating'] } })
})

test('sheet helpers: a third topic switches off the oldest, and the origin line names the source', () => {
  assert.deepEqual(toggledTopicsOf({ topics: ['cooking'], key: 'travel', on: true }), ['cooking', 'travel'])
  assert.deepEqual(toggledTopicsOf({ topics: ['cooking', 'travel'], key: 'history', on: true }), ['travel', 'history'])
  assert.deepEqual(toggledTopicsOf({ topics: ['cooking', 'travel'], key: 'cooking', on: false }), ['travel'])
  assert.deepEqual(toggledTopicsOf({ topics: ['cooking'], key: 'cooking', on: true }), ['cooking'])
  assert.equal(originLineOf({ code: 'au', name: 'Australia', source: 'TVmaze' }), 'Made in Australia (TVmaze)')
  assert.equal(originLineOf(null), 'Origin not known')
  assert.equal(categoriesPathOf('Home and Away'), '/api/for-you/categories/show/home-and-away')
  assert.equal(canSaveCategoriesOf({ format: '', topics: [] }), false)
  assert.equal(canSaveCategoriesOf({ format: 'soaps', topics: [] }), true)
})
