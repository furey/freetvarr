import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import http from 'node:http'

import { createPlexLibraries, listPlexSections, planPlexLibraries, plexLibraryLocale } from '../src/plex.js'

const TOKEN = 'test-token'

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/plex/${name}.json`, import.meta.url), 'utf8'))

const sectionsWith = (titles) => {
  const sections = fixture('library-sections')
  const directory = sections.MediaContainer.Directory.filter((d) => titles.includes(d.title))
  return { MediaContainer: { ...sections.MediaContainer, size: directory.length, Directory: directory } }
}

const createdSection = ({ key, params }) => {
  const created = fixture('create-section')
  const [section] = created.MediaContainer.Directory
  return {
    MediaContainer: {
      ...created.MediaContainer,
      Directory: [{
        ...section,
        key,
        title: params.get('name'),
        type: params.get('type'),
        agent: params.get('agent'),
        scanner: params.get('scanner'),
        Location: [{ id: Number(key), path: params.get('location') }],
      }],
    },
  }
}

const withPlex = async (run, { titles = ['TV Shows'] } = {}) => {
  const posts = []
  const server = http.createServer((req, res) => {
    const { pathname, searchParams } = new URL(req.url, 'http://plex')
    const reply = (body, code = 200) => {
      res.writeHead(code, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    if (searchParams.get('X-Plex-Token') !== TOKEN) return reply({}, 401)
    if (req.method === 'GET' && pathname === '/library/sections') return reply(sectionsWith(titles))
    if (req.method === 'GET' && pathname.startsWith('/services/browse/')) {
      const folder = Buffer.from(pathname.split('/').at(-1), 'base64').toString()
      return reply(folder === '/data/media' ? fixture('browse-media') : { MediaContainer: { size: 0 } })
    }
    if (req.method === 'POST' && pathname === '/library/sections') {
      posts.push(searchParams)
      return reply(createdSection({ key: String(10 + posts.length), params: searchParams }), 201)
    }
    reply({}, 404)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    await run({ url: `http://127.0.0.1:${server.address().port}`, posts })
  } finally {
    server.close()
  }
}

const ROOTS = { tv: '/data/media/tv', oneoff: '/data/media/one-offs', movies: '' }

test('planPlexLibraries: marks a library Plex already has and drops kinds with no folder', async () => {
  await withPlex(async ({ url }) => {
    const sections = await listPlexSections({ url, token: TOKEN })
    assert.deepEqual(planPlexLibraries({ sections, roots: ROOTS }), [
      { kind: 'tv', name: 'TV Shows', location: '/data/media/tv', existing: { key: '1', title: 'TV Shows' } },
      { kind: 'oneoff', name: 'One-offs', location: '/data/media/one-offs', existing: null },
    ])
  })
})

test('planPlexLibraries: matches a folder with a trailing slash', () => {
  const sections = [{ key: '7', title: 'Telly', type: 'show', locations: ['/data/media/tv/'] }]
  const [tv] = planPlexLibraries({ sections, roots: { tv: '/data/media/tv' } })
  assert.deepEqual(tv.existing, { key: '7', title: 'Telly' })
})

test('createPlexLibraries: sends the Plex agent and scanner for each kind', async () => {
  await withPlex(async ({ url, posts }) => {
    const results = await createPlexLibraries({
      url,
      token: TOKEN,
      timeZone: 'America/New_York',
      libraries: [
        { kind: 'tv', name: 'TV Shows', location: '/data/media/tv' },
        { kind: 'oneoff', name: 'One-offs', location: '/data/media/one-offs/' },
        { kind: 'movies', name: 'Movies', location: '/data/media/movies' },
      ],
    })
    assert.deepEqual(results.map(({ kind, status, key }) => ({ kind, status, key })), [
      { kind: 'tv', status: 'created', key: '11' },
      { kind: 'oneoff', status: 'created', key: '12' },
      { kind: 'movies', status: 'created', key: '13' },
    ])
    assert.deepEqual(posts.map((p) => Object.fromEntries([...p].filter(([k]) => k !== 'X-Plex-Token'))), [
      { name: 'TV Shows', type: 'show', agent: 'tv.plex.agents.series', scanner: 'Plex TV Series', language: 'en-US', 'prefs[country]': 'US', location: '/data/media/tv' },
      { name: 'One-offs', type: 'movie', agent: 'tv.plex.agents.none', scanner: 'Plex Video Files', language: 'en-US', 'prefs[country]': 'US', location: '/data/media/one-offs' },
      { name: 'Movies', type: 'movie', agent: 'tv.plex.agents.movie', scanner: 'Plex Movie', language: 'en-US', 'prefs[country]': 'US', location: '/data/media/movies' },
    ])
  }, { titles: [] })
})

test('plexLibraryLocale: maps the time zone country to a Plex language and certification country', () => {
  const locale = (zone) => plexLibraryLocale(zone)
  assert.deepEqual(locale('Australia/Sydney'), { language: 'en-AU', country: 'AU' })
  assert.deepEqual(locale('Pacific/Auckland'), { language: 'en-AU', country: 'NZ' })
  assert.deepEqual(locale('America/Toronto'), { language: 'en-CA', country: 'CA' })
  assert.deepEqual(locale('Europe/London'), { language: 'en-GB', country: 'GB' })
  assert.deepEqual(locale('Europe/Dublin'), { language: 'en-GB', country: 'IE' })
  assert.deepEqual(locale('America/New_York'), { language: 'en-US', country: 'US' })
  assert.deepEqual(locale('Europe/Paris'), { language: 'en-US', country: 'FR' })
  assert.deepEqual(locale('UTC'), { language: 'en-US', country: '' })
})

test('createPlexLibraries: sends language and prefs[country] from the time zone', async () => {
  await withPlex(async ({ url, posts }) => {
    await createPlexLibraries({
      url,
      token: TOKEN,
      timeZone: 'Australia/Melbourne',
      libraries: [{ kind: 'oneoff', name: 'One-offs', location: '/data/media/one-offs' }],
    })
    assert.equal(posts[0].get('language'), 'en-AU')
    assert.equal(posts[0].get('prefs[country]'), 'AU')
  }, { titles: [] })
})

test('createPlexLibraries: omits prefs[country] when the time zone has no country', async () => {
  await withPlex(async ({ url, posts }) => {
    await createPlexLibraries({
      url,
      token: TOKEN,
      timeZone: 'UTC',
      libraries: [{ kind: 'tv', name: 'TV Shows', location: '/data/media/tv' }],
    })
    assert.equal(posts[0].get('language'), 'en-US')
    assert.equal(posts[0].has('prefs[country]'), false)
  }, { titles: [] })
})

test('createPlexLibraries: skips a folder Plex already has and returns its section', async () => {
  await withPlex(async ({ url, posts }) => {
    const [tv] = await createPlexLibraries({
      url,
      token: TOKEN,
      libraries: [{ kind: 'tv', name: 'TV Shows', location: '/data/media/tv' }],
    })
    assert.equal(tv.status, 'exists')
    assert.equal(tv.key, '1')
    assert.equal(posts.length, 0)
  })
})

test('createPlexLibraries: refuses a folder Plex cannot see', async () => {
  await withPlex(async ({ url, posts }) => {
    const [result] = await createPlexLibraries({
      url,
      token: TOKEN,
      libraries: [{ kind: 'oneoff', name: 'One-offs', location: '/data/media/sport' }],
    })
    assert.equal(result.status, 'failed')
    assert.match(result.error, /Plex cannot see \/data\/media\/sport/)
    assert.equal(posts.length, 0)
  })
})

test('createPlexLibraries: rejects a relative folder, an empty name, and an unknown kind', async () => {
  await withPlex(async ({ url, posts }) => {
    const results = await createPlexLibraries({
      url,
      token: TOKEN,
      libraries: [
        { kind: 'tv', name: 'TV Shows', location: 'media/tv' },
        { kind: 'oneoff', name: ' ', location: '/data/media/one-offs' },
        { kind: 'music', name: 'Music', location: '/data/media/music' },
      ],
    })
    assert.deepEqual(results.map((r) => r.status), ['failed', 'failed', 'failed'])
    assert.equal(posts.length, 0)
  })
})

test('createPlexLibraries: a rejected token stops before any library is made', async () => {
  await withPlex(async ({ url }) => {
    await assert.rejects(
      createPlexLibraries({ url, token: 'wrong', libraries: [{ kind: 'tv', name: 'TV', location: '/data/media/tv' }] }),
      /Plex rejected the token \(401\)/,
    )
  })
})
