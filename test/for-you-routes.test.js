import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import express from 'express'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-for-you-routes-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')
const { limitFrom, mountForYou, picksFrom, publicResultOf, settingsChangesFrom } = await import('../src/for-you-routes.js')
const { bm25VectorsOf, denseCosine, meanVectorOf, nearestLikedOf, sparseCosine, tokensOf } = await import('../src/for-you-similarity.js')

const passThrough = (req, res, next) => next()
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
  const app = express()
  app.use(express.json())
  mountForYou({ app, csrf: passThrough, start: false })
  appServer = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => appServer.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${appServer.address().port}`
})

after(async () => {
  appServer?.close()
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

test('limit is a whole number from 1 to 20', () => {
  assert.equal(limitFrom(undefined), 10)
  assert.equal(limitFrom('3'), 3)
  assert.equal(limitFrom('0'), 10)
  assert.equal(limitFrom('500'), 20)
})

test('picks need 1 to 30 show keys', () => {
  assert.deepEqual(picksFrom({ seriesKeys: ['the-block', 'the-block', 'mkr'] }), { seriesKeys: ['the-block', 'mkr'] })
  assert.match(picksFrom({ seriesKeys: [] }).error, /1 to 30/)
  assert.match(picksFrom({ seriesKeys: ['The Block'] }).error, /show key/)
})

test('settings changes are validated', () => {
  assert.deepEqual(settingsChangesFrom({ enabled: false, tierOverride: 'basic' }), { changes: { enabled: false, tierOverride: 'basic' } })
  assert.match(settingsChangesFrom({ tierOverride: 'turbo' }).error, /tierOverride/)
  assert.match(settingsChangesFrom({ genreLookup: 'yes' }).error, /genreLookup/)
  assert.match(settingsChangesFrom({ ollamaUrl: 'ftp://x' }).error, /ollamaUrl/)
  assert.deepEqual(settingsChangesFrom({ ollamaUrl: 'http://nas:11434/' }), { changes: { ollamaUrl: 'http://nas:11434' } })
})

test('public results trim sections and internal fields', () => {
  const item = { id: '1', title: 'A', categories: ['drama'], seasonNumber: 1, episodeNumber: 2 }
  const result = { tier: 'basic', coldStart: false, generatedAt: 1, sections: [{ key: 'might-like', title: 'You might like', items: [item, { ...item, id: '2' }] }], topPick: item }
  const shown = publicResultOf({ result, limit: 1 })
  assert.equal(shown.sections[0].items.length, 1)
  assert.deepEqual(shown.sections[0].items[0], { id: '1', title: 'A' })
  assert.deepEqual(shown.topPick, { id: '1', title: 'A' })
})

test('settings round-trip through the API', async () => {
  const initial = await call('GET', '/api/for-you/settings')
  assert.equal(initial.status, 200)
  assert.equal(initial.body.enabled, true)
  assert.equal(initial.body.genreLookup, true)
  assert.equal(initial.body.tier, 'basic')
  assert.equal(initial.body.tierOverride, 'auto')
  assert.equal(initial.body.historyEnabled, true)
  const updated = await call('PUT', '/api/for-you/settings', { genreLookup: false, tierOverride: 'basic', enabled: false })
  assert.equal(updated.body.genreLookup, false)
  assert.equal(updated.body.tierOverride, 'basic')
  assert.equal(updated.body.enabled, false)
  const off = await call('GET', '/api/for-you')
  assert.deepEqual(off.body.sections, [])
  assert.equal(off.body.enabled, false)
  assert.equal((await call('PUT', '/api/for-you/settings', { tierOverride: 'x' })).status, 400)
})

test('picks are refused with bad keys', async () => {
  assert.equal((await call('POST', '/api/for-you/picks', { seriesKeys: 'the-block' })).status, 400)
})

test('tokens drop stop words and short words', () => {
  assert.deepEqual(tokensOf('The couples renovate a house in Melbourne'), ['couples', 'renovate', 'house', 'melbourne'])
})

test('BM25 vectors rank shared rare words above common ones', () => {
  const vectors = bm25VectorsOf({ docs: new Map([
    ['a', 'couples renovate apartments auction'],
    ['b', 'couples renovate houses contest'],
    ['c', 'cricket batting averages panel'],
  ]) })
  assert.ok(sparseCosine(vectors.get('a'), vectors.get('b')) > sparseCosine(vectors.get('a'), vectors.get('c')))
})

test('dense helpers average and rank anchors', () => {
  const mean = meanVectorOf([Float32Array.from([1, 0]), Float32Array.from([0, 1])])
  assert.deepEqual([...mean], [0.5, 0.5])
  assert.ok(Math.abs(denseCosine(Float32Array.from([1, 0]), Float32Array.from([1, 1])) - Math.SQRT1_2) < 1e-6)
  const anchors = [
    { key: 'x', title: 'X', affinity: 1, vector: Float32Array.from([1, 0]) },
    { key: 'y', title: 'Y', affinity: 1, vector: Float32Array.from([0, 1]) },
  ]
  assert.equal(nearestLikedOf({ vector: Float32Array.from([0.9, 0.1]), anchors })[0].title, 'X')
  assert.equal(nearestLikedOf({ vector: Float32Array.from([0.9, 0.1]), anchors, excludeKey: 'x' })[0].title, 'Y')
})
