import assert from 'node:assert/strict'
import test from 'node:test'

import { createLibraryScan, managerUpdatesOf, QUICK_OVERLAP_S } from '../src/plex-library-scan.js'
import { libraryItemRowsOf } from '../src/plex-library.js'
import { rowToSave, wholeLibrarySettingsOf } from '../src/plex-library-store.js'
import { createPlexWatchSync } from '../src/plex-watch-sync.js'

const NOW = Date.parse('2026-10-30T10:00:00Z')

const job = () => {
  const facts = []
  const logs = []
  return { facts, logs, step: () => {}, fact: (name, value) => facts.push([name, value]), log: (text) => logs.push(text), item: () => {}, outcome: () => {} }
}

const plexItem = (key) => ({ ratingKey: key, grandparentTitle: 'Show', parentIndex: 1, index: Number(key), Media: [{ Part: [{ id: key, file: `/data/media/tv/Show/Season 01/Show - S01E0${key}.mkv` }] }] })

const harness = ({ settings = { enabled: true, sectionIds: ['2', '1'] }, pending = [], index = null, lookup = null, write = async () => {}, shows = [], movies = [], sonarrSeries = null } = {}) => {
  const state = { saved: [], cleared: [], managerUpdates: [], listCalls: [], writes: [], externalIds: [], showCalls: [] }
  const client = {
    sections: async () => [{ id: '2', type: 'show' }, { id: '1', type: 'movie' }, { id: '9', type: 'artist' }, { id: '5', type: 'movie' }],
    listItems: async (args) => {
      state.listCalls.push({ section: args.section.id, addedSinceS: args.addedSinceS ?? null, viewedSinceS: args.viewedSinceS ?? null })
      if (args.section.id === '2') return [plexItem('1'), plexItem('2')]
      return args.section.id === '1' ? movies : []
    },
    listShows: async ({ section }) => {
      state.showCalls.push(section.id)
      return shows
    },
    write: async (args) => {
      state.writes.push(args)
      await write(args)
    },
  }
  const scan = createLibraryScan({
    loadSettings: async () => settings,
    loadRecordingFiles: async () => [],
    loadRoots: async () => ['/data/media/tv', '/data/media/movies'],
    saveScannedItems: async (args) => state.saved.push(args),
    loadPendingPushes: async () => pending,
    clearPendingPush: async (args) => state.cleared.push(args),
    loadManagerIndex: async () => index,
    createManagerLookup: () => lookup,
    saveManagerFields: async (updates) => state.managerUpdates.push(...updates),
    saveExternalIds: async (args) => state.externalIds.push(args),
    loadSonarrSeries: async () => sonarrSeries,
    now: () => NOW,
  })
  return { scan, client, state }
}

test('afterSync: a full pass reads every chosen show and movie library and saves its rows', async () => {
  const { scan, client, state } = harness()
  const result = await scan.afterSync({ client, full: true, job: job() })
  assert.deepEqual(state.listCalls.map((call) => call.section), ['2', '1'])
  assert.equal(result.scanned, 2)
  assert.equal(state.saved[0].full, true)
  assert.equal(state.saved[0].rows[0].rating_key, '1')
})

test('afterSync: a quick pass reads only items added or watched since the last run', async () => {
  const { scan, client, state } = harness()
  await scan.afterSync({ client, full: false, status: { lastRunAt: NOW - 1800_000 }, job: job() })
  const since = Math.floor((NOW - 1800_000) / 1000) - QUICK_OVERLAP_S
  assert.deepEqual(state.listCalls.filter((call) => call.section === '2'), [
    { section: '2', addedSinceS: since, viewedSinceS: null },
    { section: '2', addedSinceS: null, viewedSinceS: since },
  ])
  assert.equal(state.saved[0].rows.length, 2)
})

test('afterSync: turned off, it only sends waiting watched changes to Plex', async () => {
  const { scan, client, state } = harness({ settings: { enabled: false, sectionIds: ['2'] }, pending: [{ rating_key: '7', pending_push: 'scrobble', view_offset_s: 0 }] })
  const result = await scan.afterSync({ client, full: true, job: job() })
  assert.deepEqual(state.writes, [{ ratingKey: '7', action: 'scrobble', seconds: 0 }])
  assert.deepEqual(state.cleared, [{ ratingKey: '7', action: 'scrobble' }])
  assert.equal(result.pushed, 1)
  assert.equal(state.listCalls.length, 0)
})

test('afterSync: a failed push stays waiting; a rejected token stops the run', async () => {
  const failing = harness({ pending: [{ rating_key: '7', pending_push: 'progress', view_offset_s: 60 }], write: async () => { throw Object.assign(new Error('Plex HTTP 500'), { kind: 'unreachable' }) } })
  const log = job()
  await failing.scan.afterSync({ client: failing.client, full: false, job: log })
  assert.deepEqual(failing.state.cleared, [])
  assert.match(log.logs[0], /Plex HTTP 500/)
  const rejected = harness({ pending: [{ rating_key: '7', pending_push: 'scrobble' }], write: async () => { throw Object.assign(new Error('token'), { kind: 'token' }) } })
  await assert.rejects(rejected.scan.afterSync({ client: rejected.client, full: false, job: job() }))
})

test('afterSync: a full pass links Sonarr and Radarr files by path; an empty index clears old links', async () => {
  const index = new Map([['/data/media/tv/Show/Season 01/Show - S01E01.mkv', { manager: 'sonarr', path: '/data/media/tv/Show/Season 01/Show - S01E01.mkv', fileId: 11, itemId: null, seriesId: 3 }]])
  const linked = harness({ index })
  await linked.scan.afterSync({ client: linked.client, full: true, job: job() })
  assert.deepEqual(linked.state.managerUpdates.map((update) => [update.rating_key, update.manager, update.manager_file_id]), [['1', 'sonarr', 11], ['2', null, null]])
  const cleared = harness({ index: new Map() })
  await cleared.scan.afterSync({ client: cleared.client, full: true, job: job() })
  assert.equal(cleared.state.managerUpdates.every((update) => update.manager === null), true)
})

test('managerUpdatesOf: matches another container path by its last folders', () => {
  const index = new Map([['/tv/Show/Season 01/x.mkv', { manager: 'sonarr', path: '/tv/Show/Season 01/x.mkv', fileId: 1, seriesId: 2 }]])
  const [update] = managerUpdatesOf({ rows: [{ rating_key: '1', part_id: 'a', file_path: '/data/media/tv/Show/Season 01/x.mkv' }], index })
  assert.equal(update.manager, 'sonarr')
})

test('rowToSave: keeps a waiting local change and the Sonarr link for the same file', () => {
  const kept = { file_path: '/a.mkv', pending_push: 'scrobble', watched_at: 5, view_offset_s: 0, manager: 'sonarr', manager_file_id: 9, manager_item_id: null, manager_series_id: 3 }
  const saved = rowToSave({ row: { file_path: '/a.mkv', watched_at: null, view_offset_s: 30, manager: null }, kept })
  assert.equal(saved.watched_at, 5)
  assert.equal(saved.manager, 'sonarr')
  const moved = rowToSave({ row: { file_path: '/b.mkv', manager: null }, kept: { ...kept, pending_push: null } })
  assert.equal(moved.manager, null)
})

test('wholeLibrarySettingsOf: on by default, TV and Movies by default, never the one-offs library', () => {
  assert.deepEqual(wholeLibrarySettingsOf({ enabled: null, chosen: null, tv: '2', oneoff: '5', movies: '1' }), { enabled: true, sectionIds: ['2', '1'], oneOffSectionId: '5' })
  assert.deepEqual(wholeLibrarySettingsOf({ enabled: 'false', chosen: '["2","5"]', tv: '2', oneoff: '5', movies: '1' }).sectionIds, ['2'])
  assert.equal(wholeLibrarySettingsOf({ enabled: 'false' }).enabled, false)
})

test('plex watch sync: runs the whole-library step after the watched sync and keeps going when it fails', async () => {
  const calls = []
  const sync = createPlexWatchSync({
    loadConfig: async () => ({ url: 'http://plex', token: 't', sections: [{ id: '2', type: 'show' }] }),
    loadToggles: async () => ({ fromPlex: true, toPlex: true }),
    loadRows: async () => [],
    loadSnapshots: async () => [],
    saveSnapshots: async () => {},
    pruneSnapshots: async () => {},
    applyPull: async () => {},
    loadStatus: async () => ({}),
    saveStatus: async () => {},
    createClient: () => ({ listItems: async () => [], metadata: async () => [], write: async () => {} }),
    afterSync: async ({ full }) => {
      calls.push(full)
      throw new Error('Plex HTTP 500')
    },
    now: () => NOW,
  })
  const result = await sync.run({ trigger: 'manual' })
  assert.deepEqual(calls, [true])
  assert.equal(result.full, true)
})

test('afterSync: a quick pass links new items Sonarr holds and leaves the others as they were', async () => {
  const asked = []
  const lookup = {
    managerOf: async ({ filePath, apps }) => {
      asked.push(apps)
      return { found: filePath.endsWith('S01E01.mkv') ? { manager: 'sonarr', fileId: 11, itemId: null, seriesId: 3 } : null, checked: ['sonarr'] }
    },
  }
  const { scan, client, state } = harness({ lookup })
  const log = job()
  await scan.afterSync({ client, full: false, status: { lastRunAt: NOW - 60_000 }, job: log })
  assert.deepEqual(state.managerUpdates.map((update) => [update.rating_key, update.manager, update.manager_file_id]), [['1', 'sonarr', 11]])
  assert.deepEqual(asked[0], ['sonarr'])
  assert.deepEqual(log.facts.at(-1), ['Downloaded by Sonarr or Radarr', 1])
})

test('afterSync: a quick pass keeps going when Sonarr does not answer, and clears no links', async () => {
  const lookup = { managerOf: async () => { throw new Error('Sonarr did not answer (ECONNREFUSED)') } }
  const { scan, client, state } = harness({ lookup })
  const log = job()
  await scan.afterSync({ client, full: false, status: { lastRunAt: NOW - 60_000 }, job: log })
  assert.deepEqual(state.managerUpdates, [])
  assert.match(log.logs[0], /Sonarr did not answer/)
  assert.equal(state.saved[0].rows.length, 2)
})

const pathOf = (n) => `/data/media/tv/Show ${n}/Season 01/Show ${n} - S01E01.mkv`

test('managerUpdatesOf and libraryItemRowsOf: path matching stays fast for a large library', () => {
  const size = 20_000
  const index = new Map(Array.from({ length: size }, (_, n) => [`/tv/Show ${n}/Season 01/Show ${n} - S01E01.mkv`, { manager: 'sonarr', path: `/tv/Show ${n}/Season 01/Show ${n} - S01E01.mkv`, fileId: n, seriesId: n }]))
  const rows = Array.from({ length: size }, (_, n) => ({ rating_key: String(n), part_id: String(n), file_path: pathOf(n) }))
  const recordingFiles = Array.from({ length: size }, (_, n) => ({ recordingId: `r${n}`, filePath: pathOf(n) }))
  const items = Array.from({ length: size }, (_, n) => ({ ratingKey: String(n), Media: [{ Part: [{ id: n, file: pathOf(n + size) }] }] }))
  const started = performance.now()
  const updates = managerUpdatesOf({ rows, index })
  const itemRows = libraryItemRowsOf({ items, section: { id: '2', type: 'show' }, recordingFiles, roots: ['/data/media/tv'], seenAt: NOW })
  const elapsed = performance.now() - started
  assert.equal(updates.filter((update) => update.manager).length, size)
  assert.equal(itemRows.length, size)
  assert.ok(elapsed < 1000, `took ${Math.round(elapsed)} ms`)
})

test('afterSync: a full pass saves the Plex agent ids of each show and movie, and the Sonarr series ids', async () => {
  const { scan, client, state } = harness({
    shows: [{ title: 'Dark', Guid: [{ id: 'imdb://tt5753856' }, { id: 'tmdb://70523' }, { id: 'tvdb://334824' }] }, { title: 'No Ids', Guid: [] }],
    movies: [{ ratingKey: '9', title: 'Heat', Guid: [{ id: 'tmdb://949' }], Media: [] }],
    sonarrSeries: [{ title: 'Dark', tvdbId: 334824, tmdbId: 70523, imdbId: 'tt5753856' }],
  })
  await scan.afterSync({ client, full: true, job: job() })
  assert.deepEqual(state.showCalls, ['2'])
  assert.deepEqual(state.externalIds, [
    {
      source: 'plex',
      replace: true,
      entries: [
        { titleKey: 'dark', kind: 'series', ids: { tmdb: '70523', tvdb: '334824', imdb: 'tt5753856' } },
        { titleKey: 'heat', kind: 'movie', ids: { tmdb: '949', tvdb: null, imdb: null } },
      ],
    },
    { source: 'sonarr', replace: true, entries: [{ titleKey: 'dark', kind: 'series', ids: { tmdb: '70523', tvdb: '334824', imdb: 'tt5753856' } }] },
  ])
})

test('afterSync: a quick pass with no new episodes asks Plex for no shows and keeps the saved ids', async () => {
  const { scan, client, state } = harness({ settings: { enabled: true, sectionIds: ['1'] } })
  await scan.afterSync({ client, full: false, status: { lastRunAt: NOW - 60_000 }, job: job() })
  assert.deepEqual(state.showCalls, [])
  assert.deepEqual(state.externalIds, [])
})
