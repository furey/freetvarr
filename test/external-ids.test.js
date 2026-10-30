import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-external-ids-')))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')
const { loadExternalIds, saveExternalIds } = await import('../src/external-ids-store.js')
const {
  externalIdsKeyOf,
  externalIdsOfGuids,
  externalIdsOfSeries,
  idKeyedCacheKeyOf,
  plexExternalIdEntriesOf,
  sonarrExternalIdEntriesOf,
  tmdbIdOfExternalIds,
} = await import('../src/external-ids.js')

before(async () => {
  await db.migrate.latest()
})

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

beforeEach(async () => {
  await db('external_ids').delete()
})

test('externalIdsOfGuids: reads the TVDB, TMDB, and IMDb agent ids from a Plex Guid list', () => {
  assert.deepEqual(externalIdsOfGuids([{ id: 'imdb://tt5753856' }, { id: 'tmdb://70523' }, { id: 'tvdb://334824' }, { id: 'plex://show/5d9c' }]),
    { tmdb: '70523', tvdb: '334824', imdb: 'tt5753856' })
  assert.equal(externalIdsOfGuids([{ id: 'plex://show/5d9c' }]), null)
  assert.equal(externalIdsOfGuids(undefined), null)
})

test('externalIdsOfSeries: keeps only real Sonarr ids', () => {
  assert.deepEqual(externalIdsOfSeries({ tvdbId: 334824, tmdbId: 0, imdbId: 'tt5753856' }), { tmdb: null, tvdb: '334824', imdb: 'tt5753856' })
  assert.equal(externalIdsOfSeries({ tvdbId: 0, tmdbId: 0, imdbId: '' }), null)
})

test('entries: one per title and kind, keyed by the show title key, without id-less items', () => {
  assert.deepEqual(plexExternalIdEntriesOf({ kind: 'series', items: [{ title: 'Dark', Guid: [{ id: 'tvdb://334824' }] }, { title: 'Nothing', Guid: [] }] }),
    [{ titleKey: 'dark', kind: 'series', ids: { tmdb: null, tvdb: '334824', imdb: null } }])
  assert.deepEqual(sonarrExternalIdEntriesOf([{ title: 'The Office (US)', tvdbId: 73244 }]).map((entry) => entry.titleKey), ['office us'])
})

test('cache keys: an id-keyed lookup sits under the plain key so forgetting the title clears it', () => {
  const ids = { tmdb: '70523', tvdb: '334824', imdb: null }
  assert.equal(externalIdsKeyOf(ids), 'tmdb-70523.tvdb-334824')
  assert.equal(idKeyedCacheKeyOf({ cacheKey: 'open:v3:dark', ids }), 'open:v3:dark@tmdb-70523.tvdb-334824')
  assert.equal(idKeyedCacheKeyOf({ cacheKey: 'open:v3:dark', ids: null }), 'open:v3:dark')
})

test('tmdbIdOfExternalIds: uses the TMDB id, else asks TMDB find by TVDB then IMDb id', async () => {
  const asked = []
  const findTmdb = async ({ source, id }) => {
    asked.push(source)
    return source === 'imdb_id' && id === 'tt1' ? { tv_results: [{ id: 9 }] } : {}
  }
  assert.equal(await tmdbIdOfExternalIds({ ids: { tmdb: '5', tvdb: '1', imdb: null }, type: 'tv', findTmdb }), '5')
  assert.equal(await tmdbIdOfExternalIds({ ids: { tmdb: null, tvdb: '1', imdb: 'tt1' }, type: 'tv', findTmdb }), '9')
  assert.deepEqual(asked, ['tvdb_id', 'imdb_id'])
  assert.equal(await tmdbIdOfExternalIds({ ids: { tmdb: null, tvdb: null, imdb: 'tt1' }, type: 'movie', findTmdb }), null)
})

test('store: Plex ids come first and Sonarr fills the gaps; a full pass replaces the old rows', async () => {
  await saveExternalIds({ source: 'plex', entries: [{ titleKey: 'dark', kind: 'series', ids: { tmdb: '70523', tvdb: null, imdb: null } }], replace: true, seenAt: 1 })
  await saveExternalIds({ source: 'sonarr', entries: [{ titleKey: 'dark', kind: 'series', ids: { tmdb: '1', tvdb: '334824', imdb: null } }], replace: true, seenAt: 1 })
  assert.deepEqual(await loadExternalIds({ title: 'Dark' }), { tmdb: '70523', tvdb: '334824', imdb: null })
  assert.equal(await loadExternalIds({ title: 'Dark', kind: 'movie' }), null)
  await saveExternalIds({ source: 'plex', entries: [], replace: true, seenAt: 2 })
  assert.deepEqual(await loadExternalIds({ title: 'Dark' }), { tmdb: '1', tvdb: '334824', imdb: null })
  assert.equal(await loadExternalIds({ title: '' }), null)
})
