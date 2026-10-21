import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import express from 'express'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-artwork-choices-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')
const {
  artworkChoiceKindFrom, choiceStampOf, createArtworkChoices, isCandidateId, isShowKey, plexSourceOf,
} = await import('../src/artwork-choices.js')
const {
  artworkCandidatesOf, candidateIdOf, createArtworkCandidates, mountArtworkChoiceRoutes, plexEntryOf, withChosenOf,
} = await import('../src/artwork-choice-routes.js')

const passThrough = (req, res, next) => next()
const PLEX = 'http://plex:32400'
const rows = [
  { recording_id: 'r1', title: 'The Block', season: 22, episode: 45, episode_title: 'Room reveals', image_path: 'x', aired_at: 2 },
  { recording_id: 'r2', title: 'The Block', season: 22, episode: 44, image_path: null, aired_at: 1 },
]
const sources = {
  title: 'The Block',
  rows,
  plex: { found: true, entries: [{ origin: 'plex:/photo/a', kind: 'background', source: 'plex', selected: true }] },
  tvmaze: [
    { origin: 'https://static.tvmaze.com/b.jpg', kind: 'background', source: 'tvmaze' },
    { origin: 'https://static.tvmaze.com/p.jpg', kind: 'poster', source: 'tvmaze' },
  ],
}
const automatic = {
  library: [`${PLEX}/library/metadata/5/art/1?X-Plex-Token=secret`, `${PLEX}/library/metadata/5/thumb/1?X-Plex-Token=secret`],
  fallback: ['https://image.tmdb.org/t/p/w1280/back.jpg', 'https://image.tmdb.org/t/p/w780/post.jpg', 'https://evil.example/x.jpg'],
}

let appServer
let baseUrl
let loaded = []
const choices = createArtworkChoices({ now: () => 1000 })

const call = async (method, url, body) => {
  const res = await fetch(`${baseUrl}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const type = res.headers.get('content-type') || ''
  return { status: res.status, body: type.includes('json') ? await res.json() : await res.text(), headers: res.headers }
}

before(async () => {
  await db.migrate.latest()
  const app = express()
  app.use(express.json())
  mountArtworkChoiceRoutes({
    app,
    csrf: passThrough,
    readLimiter: passThrough,
    writeLimiter: passThrough,
    candidates: createArtworkCandidates({
      showSources: async (key) => (key === 'the-block' ? sources : null),
      automaticSources: async () => automatic,
      plexUrl: async () => PLEX,
      hasTmdbKey: async () => false,
    }),
    choices,
    loadImage: async ({ origin, kind, width }) => {
      loaded.push({ origin, kind, width })
      return { body: Buffer.from('img'), contentType: 'image/webp' }
    },
  })
  appServer = app.listen(0)
  await new Promise((resolve) => appServer.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${appServer.address().port}`
})

after(async () => {
  appServer.close()
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

test('validators accept only show keys, artwork kinds, and candidate ids', () => {
  assert.equal(isShowKey('the-block'), true)
  for (const bad of ['', 'The-Block', '../x', 'a--b', '-a', 'a b', 'x'.repeat(201), null]) assert.equal(isShowKey(bad), false, bad)
  assert.equal(artworkChoiceKindFrom('poster'), 'poster')
  assert.equal(artworkChoiceKindFrom('banner'), null)
  assert.equal(isCandidateId('0123456789abcdef'), true)
  assert.equal(isCandidateId('https://evil.example/x.jpg'), false)
})

test('plexSourceOf adds the server and token at fetch time', () => {
  assert.equal(plexSourceOf({ origin: 'plex:/a?x=1', url: PLEX, token: 't k' }), `${PLEX}/a?x=1&X-Plex-Token=t%20k`)
})

test('plexEntryOf strips the token and reads the kind from the Plex path', () => {
  assert.deepEqual(plexEntryOf({ source: automatic.library[0], plexUrl: PLEX }), { origin: 'plex:/library/metadata/5/art/1', kind: 'background' })
  assert.deepEqual(plexEntryOf({ source: automatic.library[1], plexUrl: PLEX }), { origin: 'plex:/library/metadata/5/thumb/1', kind: 'poster' })
  assert.equal(plexEntryOf({ source: 'https://static.tvmaze.com/b.jpg', plexUrl: PLEX }), null)
  assert.equal(plexEntryOf({ source: automatic.library[0], plexUrl: null }), null)
})

test('artworkCandidatesOf offers Plex, TVmaze, TMDB, and guide pictures and nothing from other hosts', () => {
  const candidates = artworkCandidatesOf({ rows, plex: sources.plex.entries, tvmaze: sources.tvmaze, automatic, plexUrl: PLEX })
  assert.deepEqual(candidates.map((c) => [c.source, c.kind, c.origin]), [
    ['plex', 'background', 'plex:/photo/a'],
    ['plex', 'poster', 'plex:/library/metadata/5/thumb/1'],
    ['tvmaze', 'background', 'https://static.tvmaze.com/b.jpg'],
    ['tvmaze', 'poster', 'https://static.tvmaze.com/p.jpg'],
    ['tmdb', 'background', 'https://image.tmdb.org/t/p/w1280/back.jpg'],
    ['tmdb', 'poster', 'https://image.tmdb.org/t/p/w780/post.jpg'],
    ['guide', 'background', 'recording:r1'],
  ])
  assert.equal(candidates.at(-1).caption, 'E45 · Room reveals')
  assert.ok(candidates.every((c) => !c.origin.includes('secret')))
})

test('artworkCandidatesOf offers upcoming guide pictures for a show with no recordings', () => {
  const guide = Array.from({ length: 8 }, (_, at) => `http://tvh:9981/imagecache/${at}`)
  const candidates = artworkCandidatesOf({ automatic: { library: [], fallback: [], guide } })
  assert.deepEqual(candidates.map((c) => [c.source, c.kind, c.origin]), guide.slice(0, 6).map((origin) => ['guide', 'background', origin]))
})

test('artworkCandidatesOf uses the listed Plex background only when Plex has no art list', () => {
  const candidates = artworkCandidatesOf({ automatic: { library: automatic.library, fallback: [] }, plexUrl: PLEX })
  assert.deepEqual(candidates.map((c) => c.kind), ['background', 'poster'])
})

test('withChosenOf keeps a chosen picture on offer after it leaves the sources', () => {
  const chosen = { poster: { origin: 'https://static.tvmaze.com/old.jpg', source: 'tvmaze' } }
  const offered = withChosenOf({ candidates: [], chosen })
  assert.equal(offered[0].id, candidateIdOf({ kind: 'poster', origin: 'https://static.tvmaze.com/old.jpg' }))
})

test('createArtworkChoices keeps the latest choice per show and kind and stamps it', async () => {
  const store = { rows: [], readAll: async () => store.rows, write: async () => {}, remove: async () => {} }
  let clock = 5
  const memory = createArtworkChoices({ store, now: () => clock })
  await memory.choose({ key: 'a', kind: 'poster', origin: 'o1', source: 'tvmaze' })
  const second = await memory.choose({ key: 'a', kind: 'poster', origin: 'o2', source: 'tvmaze' })
  assert.equal(second.chosenAt, 6)
  assert.equal((await memory.chosenFor({ key: 'a', kind: 'poster' })).origin, 'o2')
  assert.deepEqual((await memory.stampsByKey()).get('a'), { background: null, poster: choiceStampOf(second) })
  clock = 100
  await memory.clear({ key: 'a', kind: 'poster' })
  assert.equal(await memory.chosenFor({ key: 'a', kind: 'poster' }), null)
  assert.equal((await memory.stampsByKey()).has('a'), false)
})

test('GET artwork-candidates lists tiles by id without origins or tokens', async () => {
  const { status, body } = await call('GET', '/api/library/shows/the-block/artwork-candidates')
  assert.equal(status, 200)
  assert.equal(body.title, 'The Block')
  assert.equal(body.tmdbKey, false)
  assert.deepEqual(body.chosen, { background: null, poster: null })
  assert.equal(body.candidates.length, 7)
  const text = JSON.stringify(body)
  assert.ok(!text.includes('secret') && !text.includes('plex:') && !text.includes('recording:'))
  assert.match(body.candidates[0].url, /^\/api\/library\/shows\/the-block\/artwork-candidates\/[0-9a-f]{16}\?w=384$/)
})

test('GET artwork-candidates rejects bad keys and unknown shows', async () => {
  assert.equal((await call('GET', '/api/library/shows/..%2Fetc/artwork-candidates')).status, 400)
  assert.equal((await call('GET', '/api/library/shows/nothing/artwork-candidates')).status, 404)
})

test('GET a candidate tile loads it by the server-side origin', async () => {
  loaded = []
  const id = candidateIdOf({ kind: 'background', origin: 'recording:r1' })
  const { status, headers } = await call('GET', `/api/library/shows/the-block/artwork-candidates/${id}?w=192`)
  assert.equal(status, 200)
  assert.equal(headers.get('content-type'), 'image/webp')
  assert.deepEqual(loaded, [{ origin: 'recording:r1', kind: 'background', width: 192 }])
  assert.equal((await call('GET', `/api/library/shows/the-block/artwork-candidates/${id}?w=999`)).status, 400)
  assert.equal((await call('GET', '/api/library/shows/the-block/artwork-candidates/ffffffffffffffff')).status, 404)
})

test('PUT and DELETE artwork store only offered pictures and persist them', async () => {
  const poster = candidateIdOf({ kind: 'poster', origin: 'https://static.tvmaze.com/p.jpg' })
  assert.equal((await call('PUT', '/api/library/shows/the-block/artwork/banner', { id: poster })).status, 400)
  assert.equal((await call('PUT', '/api/library/shows/the-block/artwork/poster', { id: 'https://evil.example/x.jpg' })).status, 400)
  assert.equal((await call('PUT', '/api/library/shows/the-block/artwork/background', { id: poster })).status, 404)
  assert.equal((await call('PUT', '/api/library/shows/nothing/artwork/poster', { id: poster })).status, 404)

  const put = await call('PUT', '/api/library/shows/the-block/artwork/poster', { id: poster })
  assert.equal(put.status, 200)
  assert.equal(put.body.chosen, poster)
  assert.equal(put.body.stamp, choiceStampOf({ chosenAt: 1000 }))
  const row = await db('show_artwork_choices').where({ show_key: 'the-block', kind: 'poster' }).first()
  assert.equal(row.origin, 'https://static.tvmaze.com/p.jpg')
  assert.equal(row.source, 'tvmaze')
  assert.equal((await call('GET', '/api/library/shows/the-block/artwork-candidates')).body.chosen.poster, poster)

  const removed = await call('DELETE', '/api/library/shows/the-block/artwork/poster')
  assert.equal(removed.status, 200)
  assert.equal(removed.body.removed, poster)
  assert.equal(await db('show_artwork_choices').where({ show_key: 'the-block' }).first(), undefined)
})

test('the database store reloads saved choices', async () => {
  const first = createArtworkChoices({ now: () => 42 })
  await first.choose({ key: 'bluey', kind: 'background', origin: 'plex:/photo/b', source: 'plex' })
  const fresh = createArtworkChoices()
  assert.deepEqual(await fresh.chosenFor({ key: 'bluey', kind: 'background' }), { origin: 'plex:/photo/b', source: 'plex', chosenAt: 42 })
  await fresh.clear({ key: 'bluey', kind: 'background' })
})

test('GET artwork-stamps lists the stamps of every show with a pick', async () => {
  const poster = candidateIdOf({ kind: 'poster', origin: 'https://static.tvmaze.com/p.jpg' })
  await call('PUT', '/api/library/shows/the-block/artwork/poster', { id: poster })
  const { status, body } = await call('GET', '/api/library/artwork-stamps')
  assert.equal(status, 200)
  assert.deepEqual(body.stamps['the-block'], { background: null, poster: choiceStampOf({ chosenAt: 1000 }) })
  await call('DELETE', '/api/library/shows/the-block/artwork/poster')
})

test('artworkCandidatesOf offers every TMDB background and poster the lookup found', () => {
  const base = 'https://image.tmdb.org/t/p'
  const backgrounds = Array.from({ length: 8 }, (_, at) => `${base}/w1280/b${at}.jpg`)
  const posters = Array.from({ length: 8 }, (_, at) => `${base}/w780/p${at}.jpg`)
  const fallback = [backgrounds[0], posters[0], ...backgrounds.slice(1), ...posters.slice(1)]
  const candidates = artworkCandidatesOf({ automatic: { library: [], fallback, guide: [] } })
  assert.deepEqual(candidates.filter((c) => c.kind === 'background').map((c) => c.origin), backgrounds)
  assert.deepEqual(candidates.filter((c) => c.kind === 'poster').map((c) => c.origin), posters)
  assert.ok(candidates.every((c) => c.source === 'tmdb'))
})
