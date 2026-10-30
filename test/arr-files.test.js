import assert from 'node:assert/strict'
import test from 'node:test'

import { appsForKind, createArrLookup } from '../src/arr-files.js'
import { createPathIndex, findInPathIndex } from '../src/plex-library.js'

const sonarrWith = ({ calls, files }) => ({
  series: async () => {
    calls.push('series')
    return [{ id: 3, path: '/tv/The Block' }, { id: 4, path: '/tv/Other Show' }]
  },
  episodeFiles: async (seriesId) => {
    calls.push(`files:${seriesId}`)
    return files.filter((file) => file.seriesId === seriesId)
  },
})

test('createArrLookup: finds a Sonarr file by its show folder and asks Sonarr once per pass', async () => {
  const calls = []
  const sonarr = sonarrWith({ calls, files: [{ id: 41, seriesId: 3, relativePath: 'Season 22/The Block S22E01.ts' }] })
  const lookup = createArrLookup({ clientFor: async (app) => (app === 'sonarr' ? sonarr : null) })
  const first = await lookup.managerOf({ filePath: '/data/media/tv/The Block/Season 22/The Block S22E01.ts', apps: ['sonarr'] })
  assert.deepEqual(first, { found: { manager: 'sonarr', path: '/tv/The Block/Season 22/The Block S22E01.ts', fileId: 41, itemId: null, seriesId: 3 }, checked: ['sonarr'] })
  const second = await lookup.managerOf({ filePath: '/data/media/tv/The Block/Season 22/The Block S22E02.ts', apps: ['sonarr'] })
  assert.equal(second.found, null)
  assert.deepEqual(calls, ['series', 'files:3'])
})

test('createArrLookup: finds a Radarr movie file; an app with no client is not checked', async () => {
  const radarr = { movies: async () => [{ id: 7, path: '/movies/Heat (1995)', movieFile: { id: 70, relativePath: 'Heat.mkv' } }] }
  const lookup = createArrLookup({ clientFor: async (app) => (app === 'radarr' ? radarr : null) })
  const result = await lookup.managerOf({ filePath: '/data/media/movies/Heat (1995)/Heat.mkv' })
  assert.equal(result.found.itemId, 7)
  assert.deepEqual(result.checked, ['radarr'])
  assert.equal(await lookup.anyConnected(), true)
})

test('createArrLookup: an unreachable app throws, so callers can refuse instead of guessing', async () => {
  const sonarr = { series: async () => { throw Object.assign(new Error('Sonarr did not answer (ECONNREFUSED)'), { app: 'sonarr' }) } }
  const lookup = createArrLookup({ clientFor: async () => sonarr })
  await assert.rejects(lookup.managerOf({ filePath: '/tv/The Block/Season 22/x.ts', apps: ['sonarr'] }), /did not answer/)
})

test('appsForKind: episodes ask Sonarr, movies ask Radarr, one-offs ask both', () => {
  assert.deepEqual(appsForKind('episode'), ['sonarr'])
  assert.deepEqual(appsForKind('film'), ['radarr'])
  assert.deepEqual(appsForKind('oneOff'), ['sonarr', 'radarr'])
})

test('findInPathIndex: matches the exact path, then the same file in another container by its last folders', () => {
  const index = createPathIndex([{ path: '/tv/Show/Season 01/x.mkv', id: 1 }, { path: '/tv/Other/Season 01/x.mkv', id: 2 }])
  assert.equal(findInPathIndex({ index, filePath: '/tv/Show/Season 01/x.mkv' }).id, 1)
  assert.equal(findInPathIndex({ index, filePath: '/data/media/tv/Other/Season 01/x.mkv' }).id, 2)
  assert.equal(findInPathIndex({ index, filePath: '/data/media/tv/Missing/Season 01/x.mkv' }), null)
})
